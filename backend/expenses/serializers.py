from rest_framework import serializers
from .models import Expense


class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = [
            'id',
            'amount',
            'category',
            'description',
            'date',
            'payment_method',
            'created_at',
            'owner'
        ]
        read_only_fields = ['owner', 'created_at']

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Expense amount must be greater than 0.")
        return value

    def validate_description(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Description cannot be empty.")
        return value.strip()

    def validate_category(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Category cannot be empty.")
        return value.strip()