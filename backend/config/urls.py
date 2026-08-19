"""
URL configuration for config project.
"""
from django.contrib import admin
from django.urls import path, include
from expenses.views import login_view, logout_view, expense_page

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', expense_page, name='home'),
    path('expenses/', expense_page, name='expense_page'),
    path('login/', login_view, name='login'),
    path('logout/', logout_view, name='logout'),
    path('api/', include('expenses.urls')),
]
