import { useState, useEffect, useMemo, useRef } from 'react';
import { authAPI, expenseAPI } from './api';
import './App.css';

const CATEGORIES = [
  { id: 'Food', label: 'Food & Dining', icon: '🍔', color: '#f59e0b' },
  { id: 'Transport', label: 'Transportation', icon: '🚗', color: '#3b82f6' },
  { id: 'Housing', label: 'Housing & Rent', icon: '🏠', color: '#8b5cf6' },
  { id: 'Utilities', label: 'Bills & Utilities', icon: '⚡', color: '#06b6d4' },
  { id: 'Entertainment', label: 'Entertainment', icon: '🎬', color: '#ec4899' },
  { id: 'Shopping', label: 'Shopping', icon: '🛍️', color: '#10b981' },
  { id: 'Health', label: 'Health & Fitness', icon: '💊', color: '#f43f5e' },
  { id: 'Education', label: 'Education', icon: '📚', color: '#6366f1' },
  { id: 'Other', label: 'General & Other', icon: '🏷️', color: '#64748b' },
];

const PAYMENT_METHODS = [
  { id: 'UPI', label: 'UPI / GPay / PhonePe', icon: '📱' },
  { id: 'Credit Card', label: 'Credit Card', icon: '💳' },
  { id: 'Debit Card', label: 'Debit Card', icon: '🏧' },
  { id: 'Cash', label: 'Cash', icon: '💵' },
  { id: 'Net Banking', label: 'Net Banking', icon: '🏦' },
  { id: 'Other', label: 'Other', icon: '🔖' },
];

const CURRENCIES = [
  { code: 'INR', symbol: '₹', locale: 'en-IN' },
  { code: 'USD', symbol: '$', locale: 'en-US' },
  { code: 'EUR', symbol: '€', locale: 'de-DE' },
  { code: 'GBP', symbol: '£', locale: 'en-GB' },
];

function getCategoryMeta(categoryId) {
  const match = CATEGORIES.find(
    (c) => c.id.toLowerCase() === (categoryId || '').toLowerCase()
  );
  return match || { id: categoryId, label: categoryId, icon: '💸', color: '#6366f1' };
}

function getTodayString() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

function App() {
  // Auth state
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user')) || null;
    } catch {
      return null;
    }
  });

  const [authTab, setAuthTab] = useState('login'); // 'login' | 'register'
  const [authForm, setAuthForm] = useState({ username: '', email: '', password: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Currency & Theme preferences
  const [currency, setCurrency] = useState(() => {
    const saved = localStorage.getItem('expense_currency');
    return CURRENCIES.find((c) => c.code === saved) || CURRENCIES[0];
  });
  const [theme, setTheme] = useState(() => localStorage.getItem('expense_theme') || 'dark');

  // Budget Goal State (stored per user in localStorage)
  const [monthlyBudget, setMonthlyBudget] = useState(() => {
    const saved = localStorage.getItem('expense_monthly_budget');
    return saved ? Number(saved) : 25000;
  });
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudget, setTempBudget] = useState(monthlyBudget);

  // Expenses & Summary Data
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({
    monthly_total: 0,
    today_total: 0,
    all_time_total: 0,
    expense_count: 0,
    highest_expense: null,
    category_breakdown: [],
    payment_method_breakdown: [],
    monthly_trend: [],
  });
  const [dataLoading, setDataLoading] = useState(false);

  // Filters & Search & Sorting
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [timePreset, setTimePreset] = useState('all'); // 'all' | 'this_month' | 'last_30_days' | 'this_year'
  const [sortOrder, setSortOrder] = useState('-date');

  // Add Expense form
  const [form, setForm] = useState({
    amount: '',
    category: 'Food',
    description: '',
    date: getTodayString(),
    payment_method: 'UPI',
  });
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Edit Expense Modal State
  const [editingExpense, setEditingExpense] = useState(null);
  const [editForm, setEditForm] = useState({
    amount: '',
    category: 'Food',
    description: '',
    date: getTodayString(),
    payment_method: 'UPI',
  });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Active analytics tab ('trend' | 'categories' | 'payment')
  const [analyticsTab, setAnalyticsTab] = useState('trend');

  // Toast Alerts
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  };

  // Sync theme to root attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('expense_theme', theme);
  }, [theme]);

  // Sync currency to localStorage
  useEffect(() => {
    localStorage.setItem('expense_currency', currency.code);
  }, [currency]);

  // Sync budget to localStorage
  useEffect(() => {
    localStorage.setItem('expense_monthly_budget', monthlyBudget);
  }, [monthlyBudget]);

  // Auth Expired Listener
  useEffect(() => {
    const handleAuthExpired = () => {
      setToken('');
      setUser(null);
      addToast('Session expired. Please log in again.', 'error');
    };
    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
  }, []);

  // Format money helper
  const formatMoney = (amount) => {
    const num = Number(amount) || 0;
    return `${currency.symbol}${num.toLocaleString(currency.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Fetch expenses and summary data
  const loadData = async () => {
    if (!token) return;
    setDataLoading(true);
    try {
      const params = {
        ordering: sortOrder,
      };

      if (selectedCategory && selectedCategory !== 'all') {
        params.category = selectedCategory;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      // Time preset date filtering
      const now = new Date();
      if (timePreset === 'this_month') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        params.start_date = firstDay;
      } else if (timePreset === 'last_30_days') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        params.start_date = thirtyDaysAgo;
      } else if (timePreset === 'this_year') {
        const firstDayYear = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
        params.start_date = firstDayYear;
      }

      const [expensesData, summaryData] = await Promise.all([
        expenseAPI.list(params),
        expenseAPI.getSummary(),
      ]);

      setExpenses(expensesData);
      setSummary(summaryData);
    } catch (err) {
      console.error('Error loading data:', err);
      if (err?.response?.status !== 401) {
        addToast('Failed to load expenses data', 'error');
      }
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token, selectedCategory, searchQuery, timePreset, sortOrder]);

  // Auth Handlers
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      if (authTab === 'login') {
        const data = await authAPI.login(authForm.username, authForm.password);
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        addToast(`Welcome back, ${data.user.username}!`, 'success');
      } else {
        const data = await authAPI.register(
          authForm.username,
          authForm.email,
          authForm.password
        );
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        addToast(`Account created! Welcome, ${data.user.username}`, 'success');
      }
    } catch (err) {
      const errMsg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        'Authentication failed. Please check credentials.';
      setAuthError(errMsg);
    } finally {
      setAuthLoading(false);
    }
  };

  // Instant Demo Login
  const handleDemoLogin = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const data = await authAPI.demoLogin();
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      addToast('Signed in as Demo User!', 'success');
    } catch (err) {
      console.error('Demo login error:', err);
      setAuthError('Failed to initiate demo session. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await authAPI.logout();
    setToken('');
    setUser(null);
    setExpenses([]);
    addToast('Logged out successfully', 'success');
  };

  // Add Expense
  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      addToast('Please enter an amount greater than 0', 'error');
      return;
    }
    if (!form.description.trim()) {
      addToast('Please enter a description note', 'error');
      return;
    }

    setFormSubmitting(true);
    try {
      await expenseAPI.create({
        amount: parseFloat(form.amount).toFixed(2),
        category: form.category,
        description: form.description.trim(),
        date: form.date || getTodayString(),
        payment_method: form.payment_method || 'UPI',
      });

      setForm({
        amount: '',
        category: 'Food',
        description: '',
        date: getTodayString(),
        payment_method: 'UPI',
      });

      addToast('Expense recorded successfully!', 'success');
      await loadData();
    } catch (err) {
      console.error('Error adding expense:', err);
      addToast('Failed to add expense. Please check your inputs.', 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (expense) => {
    setEditingExpense(expense);
    setEditForm({
      amount: expense.amount,
      category: expense.category,
      description: expense.description,
      date: expense.date,
      payment_method: expense.payment_method || 'UPI',
    });
  };

  // Submit Edit Expense
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm.amount || Number(editForm.amount) <= 0) {
      addToast('Please enter an amount greater than 0', 'error');
      return;
    }
    if (!editForm.description.trim()) {
      addToast('Please enter a description note', 'error');
      return;
    }

    setEditSubmitting(true);
    try {
      await expenseAPI.update(editingExpense.id, {
        amount: parseFloat(editForm.amount).toFixed(2),
        category: editForm.category,
        description: editForm.description.trim(),
        date: editForm.date,
        payment_method: editForm.payment_method,
      });

      setEditingExpense(null);
      addToast('Expense updated successfully!', 'success');
      await loadData();
    } catch (err) {
      console.error('Error updating expense:', err);
      addToast('Failed to update expense', 'error');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (id, description) => {
    if (!window.confirm(`Are you sure you want to delete "${description}"?`)) return;

    try {
      await expenseAPI.delete(id);
      addToast('Expense removed', 'success');
      await loadData();
    } catch (err) {
      console.error('Error deleting expense:', err);
      addToast('Failed to delete expense', 'error');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (expenses.length === 0) {
      addToast('No expenses to export', 'error');
      return;
    }

    const headers = ['ID', 'Date', 'Category', 'Description', 'Amount', 'Payment Method'];
    const rows = expenses.map((e) => [
      e.id,
      e.date,
      `"${(e.category || '').replace(/"/g, '""')}"`,
      `"${(e.description || '').replace(/"/g, '""')}"`,
      e.amount,
      `"${(e.payment_method || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `expenses_export_${getTodayString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('Expenses exported to CSV!', 'success');
  };

  // Top spending category
  const topCategory = useMemo(() => {
    if (!summary.category_breakdown || summary.category_breakdown.length === 0) {
      return { name: 'None', percentage: 0 };
    }
    const top = summary.category_breakdown[0];
    return { name: top.category, percentage: top.percentage || 0 };
  }, [summary]);

  // Budget Calculations
  const budgetPercentage = useMemo(() => {
    if (monthlyBudget <= 0) return 0;
    return Math.min(Math.round((summary.monthly_total / monthlyBudget) * 100), 100);
  }, [summary.monthly_total, monthlyBudget]);

  const budgetRemaining = useMemo(() => {
    return monthlyBudget - (summary.monthly_total || 0);
  }, [monthlyBudget, summary.monthly_total]);

  // Max value in monthly trend for scaling chart
  const maxTrendValue = useMemo(() => {
    if (!summary.monthly_trend || summary.monthly_trend.length === 0) return 100;
    const max = Math.max(...summary.monthly_trend.map((m) => m.total));
    return max > 0 ? max * 1.15 : 100;
  }, [summary.monthly_trend]);

  // -------------------------------------------------------------
  // Unauthenticated Screen (Auth Page)
  // -------------------------------------------------------------
  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <div className="brand-icon-large">💎</div>
            <h1 className="brand-title-large">ExpenseFlow</h1>
            <p className="auth-subtitle">
              Sleek, powerful & intelligent expense management
            </p>
          </div>

          {/* Instant 1-Click Demo Login */}
          <div className="demo-login-box">
            <button
              type="button"
              className="btn-demo"
              onClick={handleDemoLogin}
              disabled={authLoading}
            >
              <span>⚡</span>
              <span>Quick Test Drive: <strong>Try Demo Account</strong></span>
            </button>
            <div className="demo-divider">
              <span>or continue with your account</span>
            </div>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${authTab === 'login' ? 'active' : ''}`}
              onClick={() => {
                setAuthTab('login');
                setAuthError('');
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab ${authTab === 'register' ? 'active' : ''}`}
              onClick={() => {
                setAuthTab('register');
                setAuthError('');
              }}
            >
              Create Account
            </button>
          </div>

          {authError && (
            <div className="alert-error">
              <span>⚠️</span>
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                required
                className="input-field"
                placeholder="e.g. johndoe"
                value={authForm.username}
                onChange={(e) =>
                  setAuthForm({ ...authForm, username: e.target.value })
                }
              />
            </div>

            {authTab === 'register' && (
              <div className="form-group">
                <label className="form-label">Email (Optional)</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="e.g. john@example.com"
                  value={authForm.email}
                  onChange={(e) =>
                    setAuthForm({ ...authForm, email: e.target.value })
                  }
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                required
                minLength={6}
                className="input-field"
                placeholder="Minimum 6 characters"
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm({ ...authForm, password: e.target.value })
                }
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={authLoading}
              style={{ marginTop: '14px' }}
            >
              {authLoading
                ? 'Authenticating...'
                : authTab === 'login'
                ? 'Sign In to Dashboard'
                : 'Create Account & Start'}
            </button>
          </form>
        </div>

        {/* Toasts */}
        <div className="toast-container">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast ${toast.type}`}>
              <span>{toast.type === 'error' ? '❌' : '✨'}</span>
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Authenticated Main Dashboard
  // -------------------------------------------------------------
  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="nav-content">
          <div className="brand">
            <div className="brand-icon">💎</div>
            <div className="brand-titles">
              <span className="brand-title">ExpenseFlow</span>
              <span className="brand-badge">PRO</span>
            </div>
          </div>

          <div className="nav-actions">
            {/* Currency Selector */}
            <div className="currency-selector">
              {CURRENCIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`currency-btn ${currency.code === c.code ? 'active' : ''}`}
                  onClick={() => setCurrency(c)}
                  title={`Switch currency to ${c.code} (${c.symbol})`}
                >
                  {c.symbol} {c.code}
                </button>
              ))}
            </div>

            {/* Dark / Light Theme Toggle */}
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            {/* User Profile Badge */}
            <div className="user-badge">
              <div className="user-avatar">
                {user?.username ? user.username[0].toUpperCase() : 'U'}
              </div>
              <span className="username">@{user?.username || 'user'}</span>
            </div>

            {/* Sign Out Button */}
            <button onClick={handleLogout} className="btn-logout" title="Sign out of your session">
              <span>🚪</span> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Area */}
      <main className="dashboard-main">
        {/* Metric Cards Row */}
        <div className="metrics-grid">
          {/* 1. Monthly Total */}
          <div className="metric-card monthly">
            <div className="metric-header">
              <span className="metric-label">This Month</span>
              <span className="metric-icon">📅</span>
            </div>
            <div className="metric-value">{formatMoney(summary.monthly_total)}</div>
            <div className="metric-subtitle">
              {budgetRemaining >= 0
                ? `${formatMoney(budgetRemaining)} remaining in budget`
                : `${formatMoney(Math.abs(budgetRemaining))} OVER budget!`}
            </div>
          </div>

          {/* 2. Today's Spend */}
          <div className="metric-card today">
            <div className="metric-header">
              <span className="metric-label">Spent Today</span>
              <span className="metric-icon">⚡</span>
            </div>
            <div className="metric-value">{formatMoney(summary.today_total)}</div>
            <div className="metric-subtitle">Live daily expenditure</div>
          </div>

          {/* 3. All Time Total */}
          <div className="metric-card alltime">
            <div className="metric-header">
              <span className="metric-label">All-Time Total</span>
              <span className="metric-icon">💰</span>
            </div>
            <div className="metric-value">{formatMoney(summary.all_time_total)}</div>
            <div className="metric-subtitle">{summary.expense_count} total logged transactions</div>
          </div>

          {/* 4. Top Category */}
          <div className="metric-card top">
            <div className="metric-header">
              <span className="metric-label">Top Category</span>
              <span className="metric-icon">🏆</span>
            </div>
            <div className="metric-value" style={{ fontSize: '22px' }}>
              {topCategory.name}
            </div>
            <div className="metric-subtitle">
              {topCategory.percentage > 0 ? `${topCategory.percentage}% of total spending` : 'No expenses logged'}
            </div>
          </div>
        </div>

        {/* Monthly Budget & Spending Goals Banner */}
        <div className="budget-banner glass-card">
          <div className="budget-header">
            <div className="budget-info">
              <div className="budget-title">
                <span>🎯</span> Monthly Spending Budget & Goal
              </div>
              <div className="budget-values">
                <span>Spent {formatMoney(summary.monthly_total)} of {formatMoney(monthlyBudget)}</span>
                <span className={`budget-tag ${budgetRemaining < 0 ? 'danger' : budgetPercentage > 80 ? 'warning' : 'safe'}`}>
                  {budgetRemaining < 0 ? '⚠️ OVER BUDGET' : `${budgetPercentage}% USED`}
                </span>
              </div>
            </div>

            <div className="budget-actions">
              {isEditingBudget ? (
                <div className="budget-edit-form">
                  <input
                    type="number"
                    min="1"
                    className="budget-input"
                    value={tempBudget}
                    onChange={(e) => setTempBudget(Number(e.target.value))}
                  />
                  <button
                    type="button"
                    className="btn-sm btn-primary-sm"
                    onClick={() => {
                      if (tempBudget > 0) {
                        setMonthlyBudget(tempBudget);
                        setIsEditingBudget(false);
                        addToast('Monthly budget updated!', 'success');
                      }
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn-sm btn-secondary-sm"
                    onClick={() => {
                      setTempBudget(monthlyBudget);
                      setIsEditingBudget(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-edit-budget"
                  onClick={() => {
                    setTempBudget(monthlyBudget);
                    setIsEditingBudget(true);
                  }}
                >
                  ✏️ Edit Budget Goal
                </button>
              )}
            </div>
          </div>

          <div className="budget-progress-bar">
            <div
              className={`budget-progress-fill ${
                budgetRemaining < 0
                  ? 'fill-danger'
                  : budgetPercentage > 80
                  ? 'fill-warning'
                  : 'fill-safe'
              }`}
              style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
            />
          </div>
        </div>

        {/* Analytics & Visualizations Section */}
        <div className="analytics-section glass-card">
          <div className="analytics-header">
            <div className="analytics-title">
              <span>📊</span> Visual Analytics & Spending Trends
            </div>
            <div className="analytics-tabs">
              <button
                type="button"
                className={`analytics-tab-btn ${analyticsTab === 'trend' ? 'active' : ''}`}
                onClick={() => setAnalyticsTab('trend')}
              >
                6-Month Trend
              </button>
              <button
                type="button"
                className={`analytics-tab-btn ${analyticsTab === 'categories' ? 'active' : ''}`}
                onClick={() => setAnalyticsTab('categories')}
              >
                Category Split
              </button>
              <button
                type="button"
                className={`analytics-tab-btn ${analyticsTab === 'payment' ? 'active' : ''}`}
                onClick={() => setAnalyticsTab('payment')}
              >
                Payment Methods
              </button>
            </div>
          </div>

          {/* TAB 1: 6-Month Trend Chart */}
          {analyticsTab === 'trend' && (
            <div className="trend-chart-container">
              {summary.monthly_trend && summary.monthly_trend.length > 0 ? (
                <div className="svg-chart-wrapper">
                  <div className="bar-chart-grid">
                    {summary.monthly_trend.map((m, idx) => {
                      const heightPercent =
                        maxTrendValue > 0 ? Math.round((m.total / maxTrendValue) * 100) : 0;
                      return (
                        <div key={`${m.year}-${m.month}`} className="bar-column">
                          <div className="bar-value-label">
                            {m.total > 0 ? formatMoney(m.total) : `${currency.symbol}0`}
                          </div>
                          <div className="bar-track">
                            <div
                              className="bar-fill"
                              style={{
                                height: `${Math.max(heightPercent, 4)}%`,
                                animationDelay: `${idx * 0.08}s`,
                              }}
                            />
                          </div>
                          <div className="bar-month-label">{m.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="chart-empty">No historical spending recorded yet</div>
              )}
            </div>
          )}

          {/* TAB 2: Categories Split */}
          {analyticsTab === 'categories' && (
            <div className="categories-breakdown-grid">
              {summary.category_breakdown && summary.category_breakdown.length > 0 ? (
                summary.category_breakdown.map((cat) => {
                  const meta = getCategoryMeta(cat.category);
                  return (
                    <div key={cat.category} className="cat-card">
                      <div className="cat-card-top">
                        <span className="cat-card-icon">{meta.icon}</span>
                        <div className="cat-card-meta">
                          <div className="cat-card-title">{cat.category}</div>
                          <div className="cat-card-count">{cat.count} transactions ({cat.percentage}%)</div>
                        </div>
                        <div className="cat-card-amount">{formatMoney(cat.total)}</div>
                      </div>
                      <div className="cat-card-bar-bg">
                        <div
                          className="cat-card-bar-fill"
                          style={{
                            width: `${Math.min(cat.percentage, 100)}%`,
                            background: meta.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="chart-empty">No category data recorded yet</div>
              )}
            </div>
          )}

          {/* TAB 3: Payment Methods Split */}
          {analyticsTab === 'payment' && (
            <div className="payment-breakdown-grid">
              {summary.payment_method_breakdown && summary.payment_method_breakdown.length > 0 ? (
                summary.payment_method_breakdown.map((pay) => {
                  const match = PAYMENT_METHODS.find(
                    (p) => p.id.toLowerCase() === (pay.payment_method || '').toLowerCase()
                  );
                  const icon = match ? match.icon : '💳';
                  const percentage =
                    summary.all_time_total > 0
                      ? Math.round((pay.total / summary.all_time_total) * 100)
                      : 0;

                  return (
                    <div key={pay.payment_method} className="pay-card">
                      <div className="pay-card-icon">{icon}</div>
                      <div className="pay-card-body">
                        <div className="pay-card-title">{pay.payment_method}</div>
                        <div className="pay-card-amount">{formatMoney(pay.total)}</div>
                        <div className="pay-card-sub">{pay.count} txns • {percentage}% of total</div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="chart-empty">No payment data recorded yet</div>
              )}
            </div>
          )}
        </div>

        {/* 2-Column Core Layout (Add Form + Transaction Explorer) */}
        <div className="dashboard-grid">
          {/* LEFT COLUMN: Add Expense Form */}
          <section className="glass-card add-expense-card">
            <h2 className="card-title">
              <span>➕</span> Add New Expense
            </h2>

            <form onSubmit={handleAddExpense}>
              {/* Amount */}
              <div className="form-group">
                <label className="form-label">Amount ({currency.symbol})</label>
                <div className="input-with-prefix">
                  <span className="input-prefix">{currency.symbol}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className="input-field"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
              </div>

              {/* Category */}
              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="select-field"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Method */}
              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <select
                  className="select-field"
                  value={form.payment_method}
                  onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.icon} {method.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="form-group">
                <label className="form-label">Description / Note</label>
                <input
                  type="text"
                  required
                  className="input-field"
                  placeholder="e.g. Organic grocery, Starbucks coffee, Uber ride"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              {/* Date */}
              <div className="form-group">
                <label className="form-label">Date</label>
                <input
                  type="date"
                  required
                  className="input-field"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={formSubmitting}
              >
                {formSubmitting ? 'Saving Transaction...' : '✨ Record Expense'}
              </button>
            </form>
          </section>

          {/* RIGHT COLUMN: Transaction Explorer & List */}
          <section className="glass-card explorer-card">
            {/* Header with Search, Filter & Export */}
            <div className="explorer-header">
              <div className="explorer-title-area">
                <h2 className="card-title" style={{ marginBottom: 0 }}>
                  <span>🧾</span> Transaction Explorer
                </h2>
                <span className="results-count">
                  {expenses.length} {expenses.length === 1 ? 'record' : 'records'}
                </span>
              </div>

              <button
                type="button"
                className="btn-export"
                onClick={handleExportCSV}
                title="Download current filtered expenses as a CSV file"
              >
                <span>📥</span> Export CSV
              </button>
            </div>

            {/* Explorer Controls: Search, Time Filter, Sort */}
            <div className="explorer-controls">
              {/* Search Box */}
              <div className="search-box">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search by description, category, payment method..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => setSearchQuery('')}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Time Presets & Sort Bar */}
              <div className="controls-row">
                <div className="time-presets">
                  <button
                    type="button"
                    className={`preset-btn ${timePreset === 'all' ? 'active' : ''}`}
                    onClick={() => setTimePreset('all')}
                  >
                    All Time
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${timePreset === 'this_month' ? 'active' : ''}`}
                    onClick={() => setTimePreset('this_month')}
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${timePreset === 'last_30_days' ? 'active' : ''}`}
                    onClick={() => setTimePreset('last_30_days')}
                  >
                    Last 30 Days
                  </button>
                  <button
                    type="button"
                    className={`preset-btn ${timePreset === 'this_year' ? 'active' : ''}`}
                    onClick={() => setTimePreset('this_year')}
                  >
                    This Year
                  </button>
                </div>

                <div className="sort-box">
                  <label className="sort-label">Sort:</label>
                  <select
                    className="sort-select"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                  >
                    <option value="-date">Newest Date</option>
                    <option value="date">Oldest Date</option>
                    <option value="-amount">Highest Amount</option>
                    <option value="amount">Lowest Amount</option>
                    <option value="category">Category (A-Z)</option>
                  </select>
                </div>
              </div>

              {/* Category Filter Chips */}
              <div className="filter-chips">
                <button
                  type="button"
                  className={`filter-chip ${selectedCategory === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedCategory('all')}
                >
                  All Categories
                </button>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`filter-chip ${selectedCategory === cat.id ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat.id)}
                  >
                    {cat.icon} {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Expenses List */}
            <div className="expense-list">
              {dataLoading ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <span>Loading expenses...</span>
                </div>
              ) : expenses.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🍃</div>
                  <div className="empty-title">No transactions found</div>
                  <div className="empty-subtitle">
                    {searchQuery || selectedCategory !== 'all' || timePreset !== 'all'
                      ? 'No transactions matched your active filters. Try adjusting your search query or filters.'
                      : 'Record your first expense on the left panel to start tracking!'}
                  </div>
                  {(searchQuery || selectedCategory !== 'all' || timePreset !== 'all') && (
                    <button
                      type="button"
                      className="btn-reset-filters"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCategory('all');
                        setTimePreset('all');
                      }}
                    >
                      Reset All Filters
                    </button>
                  )}
                </div>
              ) : (
                expenses.map((expense) => {
                  const meta = getCategoryMeta(expense.category);
                  return (
                    <div key={expense.id} className="expense-item">
                      <div className="expense-left">
                        <div
                          className="category-icon-badge"
                          style={{
                            borderColor: `${meta.color}40`,
                            background: `${meta.color}15`,
                          }}
                        >
                          {meta.icon}
                        </div>
                        <div className="expense-details">
                          <div className="expense-desc">{expense.description}</div>
                          <div className="expense-meta">
                            <span className="expense-tag">{expense.category}</span>
                            {expense.payment_method && (
                              <span className="payment-tag">
                                💳 {expense.payment_method}
                              </span>
                            )}
                            <span className="date-tag">📅 {expense.date}</span>
                          </div>
                        </div>
                      </div>

                      <div className="expense-right">
                        <div className="expense-amount">
                          {formatMoney(expense.amount)}
                        </div>
                        <div className="expense-actions">
                          <button
                            className="btn-action btn-edit"
                            title="Edit transaction"
                            onClick={() => handleOpenEdit(expense)}
                          >
                            ✏️
                          </button>
                          <button
                            className="btn-action btn-delete"
                            title="Delete transaction"
                            onClick={() =>
                              handleDeleteExpense(expense.id, expense.description)
                            }
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Edit Expense Modal Popup */}
      {editingExpense && (
        <div className="modal-backdrop" onClick={() => setEditingExpense(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                <span>✏️</span> Edit Expense
              </h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setEditingExpense(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label className="form-label">Amount ({currency.symbol})</label>
                <div className="input-with-prefix">
                  <span className="input-prefix">{currency.symbol}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className="input-field"
                    value={editForm.amount}
                    onChange={(e) =>
                      setEditForm({ ...editForm, amount: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="select-field"
                  value={editForm.category}
                  onChange={(e) =>
                    setEditForm({ ...editForm, category: e.target.value })
                  }
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <select
                  className="select-field"
                  value={editForm.payment_method}
                  onChange={(e) =>
                    setEditForm({ ...editForm, payment_method: e.target.value })
                  }
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.icon} {method.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Description / Note</label>
                <input
                  type="text"
                  required
                  className="input-field"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label className="form-label">Date</label>
                <input
                  type="date"
                  required
                  className="input-field"
                  value={editForm.date}
                  onChange={(e) =>
                    setEditForm({ ...editForm, date: e.target.value })
                  }
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setEditingExpense(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ flex: 1 }}
                  disabled={editSubmitting}
                >
                  {editSubmitting ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notifications Container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <span>{toast.type === 'error' ? '❌' : '✨'}</span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;