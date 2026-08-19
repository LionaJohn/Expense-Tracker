from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from django.db.models import Sum, Count, Q
from django.utils import timezone

from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.authtoken.models import Token

from .models import Expense
from .serializers import ExpenseSerializer


from datetime import timedelta
import calendar
from decimal import Decimal

class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Expense.objects.filter(
            owner=self.request.user
        )

        category = self.request.query_params.get('category')
        search = self.request.query_params.get('search')
        payment_method = self.request.query_params.get('payment_method')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        year = self.request.query_params.get('year')
        month = self.request.query_params.get('month')
        ordering = self.request.query_params.get('ordering', '-date')

        if category and category.strip() and category.lower() != 'all':
            queryset = queryset.filter(category__iexact=category.strip())

        if payment_method and payment_method.strip() and payment_method.lower() != 'all':
            queryset = queryset.filter(payment_method__iexact=payment_method.strip())

        if search and search.strip():
            query = search.strip()
            queryset = queryset.filter(
                Q(description__icontains=query) |
                Q(category__icontains=query) |
                Q(payment_method__icontains=query)
            )

        if start_date:
            queryset = queryset.filter(date__gte=start_date)

        if end_date:
            queryset = queryset.filter(date__lte=end_date)

        if year:
            try:
                queryset = queryset.filter(date__year=int(year))
            except (ValueError, TypeError):
                pass

        if month:
            try:
                queryset = queryset.filter(date__month=int(month))
            except (ValueError, TypeError):
                pass

        valid_orderings = {
            'date': 'date',
            '-date': '-date',
            'amount': 'amount',
            '-amount': '-amount',
            'category': 'category',
            '-category': '-category',
        }
        order_by_field = valid_orderings.get(ordering, '-date')
        return queryset.order_by(order_by_field, '-id')

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=False, methods=['get'])
    def monthly_total(self, request):
        today = timezone.localdate()

        year = request.query_params.get('year', today.year)
        month = request.query_params.get('month', today.month)

        try:
            year = int(year)
            month = int(month)
        except (ValueError, TypeError):
            year, month = today.year, today.month

        total = Expense.objects.filter(
            owner=request.user,
            date__year=year,
            date__month=month
        ).aggregate(
            total=Sum('amount')
        )['total'] or 0

        return Response({
            'monthly_total': float(total),
            'year': year,
            'month': month
        })

    @action(detail=False, methods=['get'])
    def summary(self, request):
        today = timezone.localdate()
        user_expenses = Expense.objects.filter(owner=request.user)

        # Monthly total
        monthly_total = user_expenses.filter(
            date__year=today.year,
            date__month=today.month
        ).aggregate(total=Sum('amount'))['total'] or 0

        # Today's total
        today_total = user_expenses.filter(
            date=today
        ).aggregate(total=Sum('amount'))['total'] or 0

        # All-time total
        all_time_total = user_expenses.aggregate(total=Sum('amount'))['total'] or 0

        # Expense count
        expense_count = user_expenses.count()

        # Highest expense
        highest = user_expenses.order_by('-amount').first()
        highest_expense = {
            'amount': float(highest.amount),
            'category': highest.category,
            'description': highest.description,
            'date': str(highest.date)
        } if highest else None

        # Category breakdown
        breakdown = user_expenses.values('category').annotate(
            total=Sum('amount'),
            count=Count('id')
        ).order_by('-total')

        all_total_float = float(all_time_total) if all_time_total else 1.0
        category_breakdown = [
            {
                'category': item['category'],
                'total': float(item['total']),
                'count': item['count'],
                'percentage': round((float(item['total']) / all_total_float) * 100, 1) if all_time_total else 0
            }
            for item in breakdown
        ]

        # Payment method breakdown
        pay_breakdown = user_expenses.values('payment_method').annotate(
            total=Sum('amount'),
            count=Count('id')
        ).order_by('-total')

        payment_method_breakdown = [
            {
                'payment_method': item['payment_method'] or 'Other',
                'total': float(item['total']),
                'count': item['count']
            }
            for item in pay_breakdown
        ]

        # Monthly trend (last 6 months)
        monthly_trend = []
        for i in range(5, -1, -1):
            # Calculate year and month for (today - i months)
            target_month = today.month - i
            target_year = today.year
            while target_month <= 0:
                target_month += 12
                target_year -= 1

            m_total = user_expenses.filter(
                date__year=target_year,
                date__month=target_month
            ).aggregate(total=Sum('amount'))['total'] or 0

            month_name = calendar.month_abbr[target_month]
            monthly_trend.append({
                'year': target_year,
                'month': target_month,
                'label': f"{month_name} '{str(target_year)[-2:]}",
                'full_label': f"{calendar.month_name[target_month]} {target_year}",
                'total': float(m_total)
            })

        return Response({
            'monthly_total': float(monthly_total),
            'today_total': float(today_total),
            'all_time_total': float(all_time_total),
            'expense_count': expense_count,
            'highest_expense': highest_expense,
            'category_breakdown': category_breakdown,
            'payment_method_breakdown': payment_method_breakdown,
            'monthly_trend': monthly_trend,
        })


# --- Authentication API Endpoints (for React SPA / Token Auth) ---

@api_view(['POST'])
@permission_classes([AllowAny])
def register_api(request):
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')
    email = request.data.get('email', '').strip()

    if not username:
        return Response(
            {'error': 'Username is required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not password or len(password) < 6:
        return Response(
            {'error': 'Password must be at least 6 characters long'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if User.objects.filter(username__iexact=username).exists():
        return Response(
            {'error': 'Username already exists'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user = User.objects.create_user(
        username=username,
        email=email,
        password=password
    )
    token, _ = Token.objects.get_or_create(user=user)

    return Response({
        'token': token.key,
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email
        },
        'message': 'Registration successful'
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_api(request):
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')

    if not username or not password:
        return Response(
            {'error': 'Both username and password are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user = authenticate(request, username=username, password=password)

    if user is None:
        return Response(
            {'error': 'Invalid username or password'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    token, _ = Token.objects.get_or_create(user=user)

    return Response({
        'token': token.key,
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email
        },
        'message': 'Login successful'
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def demo_login_api(request):
    demo_username = 'demo_user'
    user, created = User.objects.get_or_create(
        username=demo_username,
        defaults={'email': 'demo@example.com'}
    )
    if created:
        user.set_password('demo1234')
        user.save()

    # Seed sample realistic expenses if demo user has none
    if Expense.objects.filter(owner=user).count() == 0:
        today = timezone.localdate()
        sample_data = [
            {'amount': Decimal('450.00'), 'category': 'Food', 'description': 'Weekend dinner & drinks', 'date': today, 'payment_method': 'UPI'},
            {'amount': Decimal('120.00'), 'category': 'Transport', 'description': 'Metro & Uber ride', 'date': today, 'payment_method': 'UPI'},
            {'amount': Decimal('1200.00'), 'category': 'Shopping', 'description': 'Nike running shoes', 'date': today - timedelta(days=2), 'payment_method': 'Credit Card'},
            {'amount': Decimal('850.00'), 'category': 'Utilities', 'description': 'High-speed Fiber Internet', 'date': today - timedelta(days=5), 'payment_method': 'Net Banking'},
            {'amount': Decimal('250.00'), 'category': 'Entertainment', 'description': 'Movie IMAX Tickets', 'date': today - timedelta(days=7), 'payment_method': 'UPI'},
            {'amount': Decimal('320.00'), 'category': 'Health', 'description': 'Pharmacy & multivitamins', 'date': today - timedelta(days=10), 'payment_method': 'Cash'},
            {'amount': Decimal('5500.00'), 'category': 'Housing', 'description': 'Monthly Apartment Maintenance', 'date': today - timedelta(days=15), 'payment_method': 'Bank Transfer'},
            {'amount': Decimal('600.00'), 'category': 'Education', 'description': 'Python & Cloud Architecture Course', 'date': today - timedelta(days=22), 'payment_method': 'Debit Card'},
            {'amount': Decimal('350.00'), 'category': 'Food', 'description': 'Weekly organic groceries', 'date': today - timedelta(days=32), 'payment_method': 'UPI'},
            {'amount': Decimal('900.00'), 'category': 'Entertainment', 'description': 'Live concert pass', 'date': today - timedelta(days=45), 'payment_method': 'Credit Card'},
            {'amount': Decimal('2100.00'), 'category': 'Shopping', 'description': 'Noise Cancelling Headphones', 'date': today - timedelta(days=60), 'payment_method': 'Credit Card'},
            {'amount': Decimal('750.00'), 'category': 'Utilities', 'description': 'Electricity bill', 'date': today - timedelta(days=70), 'payment_method': 'UPI'},
        ]
        for item in sample_data:
            Expense.objects.create(owner=user, **item)

    token, _ = Token.objects.get_or_create(user=user)

    return Response({
        'token': token.key,
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email
        },
        'message': 'Demo login successful'
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_api(request):
    try:
        if hasattr(request.user, 'auth_token'):
            request.user.auth_token.delete()
    except Exception:
        pass

    return Response(
        {'message': 'Successfully logged out'},
        status=status.HTTP_200_OK
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_api(request):
    return Response({
        'id': request.user.id,
        'username': request.user.username,
        'email': request.user.email
    })


# --- Template Views (for Direct Django Server-Rendered UI) ---

def login_view(request):
    if request.user.is_authenticated:
        return redirect('expense_page')

    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '')

        user = authenticate(
            request,
            username=username,
            password=password
        )

        if user is not None:
            login(request, user)
            next_url = request.GET.get('next')
            if next_url:
                return redirect(next_url)
            return redirect('expense_page')
        else:
            return render(
                request,
                'login.html',
                {'error': 'Invalid username or password'}
            )

    return render(request, 'login.html')


def logout_view(request):
    logout(request)
    return redirect('login')


@login_required(login_url='login')
def expense_page(request):
    return render(request, 'expense.html', {'user': request.user})