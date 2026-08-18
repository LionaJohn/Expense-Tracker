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


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Expense.objects.filter(
            owner=self.request.user
        )

        category = self.request.query_params.get('category')
        search = self.request.query_params.get('search')

        if category and category.strip() and category.lower() != 'all':
            queryset = queryset.filter(category__iexact=category.strip())

        if search and search.strip():
            query = search.strip()
            queryset = queryset.filter(
                Q(description__icontains=query) |
                Q(category__icontains=query)
            )

        return queryset.order_by('-date', '-id')

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=False, methods=['get'])
    def monthly_total(self, request):
        today = timezone.localdate()

        # Allow query params for year and month if provided
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

        # All-time total
        all_time_total = user_expenses.aggregate(total=Sum('amount'))['total'] or 0

        # Expense count
        expense_count = user_expenses.count()

        # Category breakdown
        breakdown = user_expenses.values('category').annotate(
            total=Sum('amount'),
            count=Count('id')
        ).order_by('-total')

        category_breakdown = [
            {
                'category': item['category'],
                'total': float(item['total']),
                'count': item['count']
            }
            for item in breakdown
        ]

        return Response({
            'monthly_total': float(monthly_total),
            'all_time_total': float(all_time_total),
            'expense_count': expense_count,
            'category_breakdown': category_breakdown,
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
@permission_classes([IsAuthenticated])
def logout_api(request):
    try:
        # Delete the user's auth token
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