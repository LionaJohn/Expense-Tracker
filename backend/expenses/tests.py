from decimal import Decimal
from datetime import date
from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from .models import Expense


class ExpenseTrackerTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.api_client = APIClient()

        self.user1 = User.objects.create_user(username='testuser1', password='password123')
        self.user2 = User.objects.create_user(username='testuser2', password='password123')

        # Create sample expenses for user1
        self.expense1 = Expense.objects.create(
            owner=self.user1,
            amount=Decimal('150.00'),
            category='Food',
            description='Lunch with team',
            date=date.today()
        )
        self.expense2 = Expense.objects.create(
            owner=self.user1,
            amount=Decimal('50.00'),
            category='Travel',
            description='Metro ticket',
            date=date.today()
        )

        # Create expense for user2
        self.expense_user2 = Expense.objects.create(
            owner=self.user2,
            amount=Decimal('500.00'),
            category='Shopping',
            description='Shoes',
            date=date.today()
        )

    def test_unauthenticated_redirect_from_expense_page(self):
        response = self.client.get(reverse('expense_page'))
        self.assertEqual(response.status_code, 302)
        self.assertIn('/login/', response.url)

    def test_login_view_get(self):
        response = self.client.get(reverse('login'))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'login.html')

    def test_login_view_post_success(self):
        response = self.client.post(reverse('login'), {
            'username': 'testuser1',
            'password': 'password123'
        })
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse('expense_page'))

    def test_login_view_post_failure(self):
        response = self.client.post(reverse('login'), {
            'username': 'testuser1',
            'password': 'wrongpassword'
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('Invalid username or password', response.content.decode())

    def test_authenticated_access_expense_page(self):
        self.client.login(username='testuser1', password='password123')
        response = self.client.get(reverse('expense_page'))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'expense.html')

    def test_api_list_expenses_isolation(self):
        self.api_client.force_authenticate(user=self.user1)
        response = self.api_client.get('/api/expenses/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(len(data), 2)
        descriptions = [item['description'] for item in data]
        self.assertIn('Lunch with team', descriptions)
        self.assertIn('Metro ticket', descriptions)
        self.assertNotIn('Shoes', descriptions)

    def test_api_create_expense(self):
        self.api_client.force_authenticate(user=self.user1)
        payload = {
            'amount': '75.50',
            'category': 'Food',
            'description': 'Snacks',
            'date': str(date.today())
        }
        response = self.api_client.post('/api/expenses/', data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertEqual(data['amount'], '75.50')
        self.assertEqual(data['owner'], self.user1.id)

        # Check DB
        expense = Expense.objects.get(id=data['id'])
        self.assertEqual(expense.owner, self.user1)
        self.assertEqual(expense.amount, Decimal('75.50'))

    def test_api_monthly_total(self):
        self.api_client.force_authenticate(user=self.user1)
        response = self.api_client.get('/api/expenses/monthly_total/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        # user1 has 150 + 50 = 200 in current month
        self.assertEqual(data['monthly_total'], 200.0)

    def test_api_delete_expense(self):
        self.api_client.force_authenticate(user=self.user1)
        response = self.api_client.delete(f'/api/expenses/{self.expense1.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Expense.objects.filter(id=self.expense1.id).exists())

    def test_api_summary(self):
        self.api_client.force_authenticate(user=self.user1)
        response = self.api_client.get('/api/expenses/summary/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['expense_count'], 2)
        self.assertEqual(data['all_time_total'], 200.0)
        self.assertEqual(data['monthly_total'], 200.0)
        self.assertEqual(len(data['category_breakdown']), 2)

    def test_api_category_filter(self):
        self.api_client.force_authenticate(user=self.user1)
        response = self.api_client.get('/api/expenses/?category=Food')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['category'], 'Food')

    def test_register_api_success(self):
        payload = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': 'strongpassword123'
        }
        response = self.api_client.post('/api/auth/register/', data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertIn('token', data)
        self.assertEqual(data['user']['username'], 'newuser')

    def test_register_api_validation(self):
        # Short password
        response = self.api_client.post('/api/auth/register/', data={'username': 'short', 'password': '123'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Existing user
        response = self.api_client.post('/api/auth/register/', data={'username': 'testuser1', 'password': 'password123'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_api_success_and_token_auth(self):
        payload = {
            'username': 'testuser1',
            'password': 'password123'
        }
        response = self.api_client.post('/api/auth/login/', data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        token = data['token']
        self.assertIsNotNone(token)

        # Test authenticated request with Token in Authorization header
        token_client = APIClient()
        token_client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        user_res = token_client.get('/api/auth/user/')
        self.assertEqual(user_res.status_code, status.HTTP_200_OK)
        self.assertEqual(user_res.json()['username'], 'testuser1')

        # Test logout
        logout_res = token_client.post('/api/auth/logout/')
        self.assertEqual(logout_res.status_code, status.HTTP_200_OK)

    def test_api_update_expense(self):
        self.api_client.force_authenticate(user=self.user1)
        payload = {
            'amount': '199.99',
            'category': 'Food',
            'description': 'Updated Dinner',
            'date': str(date.today()),
            'payment_method': 'UPI'
        }
        response = self.api_client.put(f'/api/expenses/{self.expense1.id}/', data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.expense1.refresh_from_db()
        self.assertEqual(self.expense1.amount, Decimal('199.99'))
        self.assertEqual(self.expense1.description, 'Updated Dinner')
        self.assertEqual(self.expense1.payment_method, 'UPI')

    def test_api_demo_login(self):
        response = self.api_client.post('/api/auth/demo/', format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn('token', data)
        self.assertEqual(data['user']['username'], 'demo_user')

    def test_api_validation_negative_amount(self):
        self.api_client.force_authenticate(user=self.user1)
        payload = {
            'amount': '-50.00',
            'category': 'Food',
            'description': 'Invalid expense',
            'date': str(date.today())
        }
        response = self.api_client.post('/api/expenses/', data=payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_api_ordering_and_filters(self):
        self.api_client.force_authenticate(user=self.user1)
        response = self.api_client.get('/api/expenses/?ordering=-amount')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(len(data), 2)
        self.assertGreaterEqual(float(data[0]['amount']), float(data[1]['amount']))

