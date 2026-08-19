from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ExpenseViewSet,
    register_api,
    login_api,
    demo_login_api,
    logout_api,
    user_api,
)

router = DefaultRouter()
router.register(r'expenses', ExpenseViewSet, basename='expense')

urlpatterns = [
    # Auth endpoints for React SPA / Mobile / External clients
    path('auth/register/', register_api, name='api_register'),
    path('auth/login/', login_api, name='api_login'),
    path('auth/demo/', demo_login_api, name='api_demo_login'),
    path('auth/logout/', logout_api, name='api_logout'),
    path('auth/user/', user_api, name='api_user'),

    # Expense REST endpoints
    path('', include(router.urls)),
]