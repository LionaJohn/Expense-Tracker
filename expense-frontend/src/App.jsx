import { useState, useEffect, useMemo } from 'react';
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

function getCategoryIcon(categoryId) {
  const match = CATEGORIES.find(
    (c) => c.id.toLowerCase() === (categoryId || '').toLowerCase()
  );
  return match ? match.icon : '💸';
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

  // Expenses data state
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({
    monthly_total: 0,
    all_time_total: 0,
    expense_count: 0,
    category_breakdown: [],
  });
  const [dataLoading, setDataLoading] = useState(false);

  // Filter & Search
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Add Expense form
  const [form, setForm] = useState({
    amount: '',
    category: 'Food',
    description: '',
    date: getTodayString(),
  });
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Toast alerts
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  // Listen for auth expiry
  useEffect(() => {
    const handleAuthExpired = () => {
      setToken('');
      setUser(null);
      addToast('Session expired. Please log in again.', 'error');
    };
    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
  }, []);

  // Fetch expenses and summary when authenticated or filters change
  const loadData = async () => {
    if (!token) return;
    setDataLoading(true);
    try {
      const params = {};
      if (selectedCategory && selectedCategory !== 'all') {
        params.category = selectedCategory;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const [expensesData, summaryData] = await Promise.all([
        expenseAPI.list(params),
        expenseAPI.getSummary(),
      ]);

      setExpenses(expensesData);
      setSummary(summaryData);
    } catch (err) {
      console.error('Error loading data:', err);
      // If error not 401, display toast
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
  }, [token, selectedCategory, searchQuery]);

  // Auth Submit Handlers
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
        addToast(`Account created successfully! Welcome, ${data.user.username}`, 'success');
      }
    } catch (err) {
      const errMsg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        'Authentication failed. Please check your credentials.';
      setAuthError(errMsg);
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

  // Add Expense Handler
  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      addToast('Please enter a valid expense amount', 'error');
      return;
    }
    if (!form.description.trim()) {
      addToast('Please enter a description', 'error');
      return;
    }

    setFormSubmitting(true);
    try {
      await expenseAPI.create({
        amount: parseFloat(form.amount).toFixed(2),
        category: form.category,
        description: form.description.trim(),
        date: form.date || getTodayString(),
      });

      setForm({
        amount: '',
        category: 'Food',
        description: '',
        date: getTodayString(),
      });

      addToast('Expense added successfully!', 'success');
      await loadData();
    } catch (err) {
      console.error('Error adding expense:', err);
      addToast('Failed to add expense. Please try again.', 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete Expense Handler
  const handleDeleteExpense = async (id, description) => {
    if (!window.confirm(`Delete expense "${description}"?`)) return;

    try {
      await expenseAPI.delete(id);
      addToast('Expense removed', 'success');
      await loadData();
    } catch (err) {
      console.error('Error deleting expense:', err);
      addToast('Failed to delete expense', 'error');
    }
  };

  // Top spending category
  const topCategory = useMemo(() => {
    if (!summary.category_breakdown || summary.category_breakdown.length === 0) {
      return 'None';
    }
    return summary.category_breakdown[0].category;
  }, [summary]);

  // If unauthenticated, show Auth Card
  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <div className="brand-icon" style={{ margin: '0 auto 16px' }}>
              💎
            </div>
            <h1 className="brand-title" style={{ fontSize: '28px', marginBottom: '8px' }}>
              ExpenseFlow
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              Smart & effortless personal expense tracking
            </p>
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
                placeholder="At least 6 characters"
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
              style={{ marginTop: '12px' }}
            >
              {authLoading
                ? 'Processing...'
                : authTab === 'login'
                ? 'Sign In to Dashboard'
                : 'Create My Account'}
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

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="nav-content">
          <div className="brand">
            <div className="brand-icon">💎</div>
            <div className="brand-title">ExpenseFlow</div>
          </div>

          <div className="nav-user">
            <div className="user-badge">
              <div className="user-avatar">
                {user?.username ? user.username[0].toUpperCase() : 'U'}
              </div>
              <span className="username">@{user?.username || 'user'}</span>
            </div>
            <button onClick={handleLogout} className="btn-logout">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Metric Cards Row */}
        <div className="metrics-grid">
          <div className="metric-card monthly">
            <div className="metric-header">
              <span className="metric-label">This Month</span>
              <span className="metric-icon">📅</span>
            </div>
            <div className="metric-value">
              ₹{Number(summary.monthly_total || 0).toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="metric-subtitle">Current billing period</div>
          </div>

          <div className="metric-card alltime">
            <div className="metric-header">
              <span className="metric-label">All-Time Total</span>
              <span className="metric-icon">💰</span>
            </div>
            <div className="metric-value">
              ₹{Number(summary.all_time_total || 0).toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="metric-subtitle">Cumulative recorded spend</div>
          </div>

          <div className="metric-card count">
            <div className="metric-header">
              <span className="metric-label">Total Transactions</span>
              <span className="metric-icon">🧾</span>
            </div>
            <div className="metric-value">{summary.expense_count || 0}</div>
            <div className="metric-subtitle">Logged expense records</div>
          </div>

          <div className="metric-card top">
            <div className="metric-header">
              <span className="metric-label">Top Category</span>
              <span className="metric-icon">🏆</span>
            </div>
            <div className="metric-value">{topCategory}</div>
            <div className="metric-subtitle">Highest expenditure area</div>
          </div>
        </div>

        {/* 2-Column Core Layout */}
        <div className="dashboard-grid">
          {/* Left Column: Add Expense Form */}
          <section className="glass-card">
            <h2 className="card-title">
              <span>➕</span> Add New Expense
            </h2>

            <form onSubmit={handleAddExpense}>
              <div className="form-group">
                <label className="form-label">Amount (₹)</label>
                <div className="input-with-prefix">
                  <span className="input-prefix">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className="input-field"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="select-field"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
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
                <label className="form-label">Description / Note</label>
                <input
                  type="text"
                  required
                  className="input-field"
                  placeholder="e.g. Lunch at cafe, Uber ride"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label className="form-label">Date</label>
                <input
                  type="date"
                  required
                  className="input-field"
                  value={form.date}
                  onChange={(e) =>
                    setForm({ ...form, date: e.target.value })
                  }
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={formSubmitting}
              >
                {formSubmitting ? 'Saving...' : 'Add Expense'}
              </button>
            </form>
          </section>

          {/* Right Column: Category Breakdown & List Explorer */}
          <section className="glass-card">
            {/* Category Breakdown Bars */}
            {summary.category_breakdown && summary.category_breakdown.length > 0 && (
              <div className="category-bars">
                <h3
                  style={{
                    fontSize: '15px',
                    fontWeight: '700',
                    color: 'var(--text-muted)',
                    marginBottom: '14px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Category Breakdown
                </h3>
                {summary.category_breakdown.slice(0, 4).map((cat) => {
                  const percentage =
                    summary.all_time_total > 0
                      ? Math.round((cat.total / summary.all_time_total) * 100)
                      : 0;

                  return (
                    <div key={cat.category} className="cat-bar-item">
                      <div className="cat-bar-info">
                        <span className="cat-bar-name">
                          {getCategoryIcon(cat.category)} {cat.category} ({percentage}%)
                        </span>
                        <span className="cat-bar-amount">
                          ₹{cat.total.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <div className="cat-progress-bg">
                        <div
                          className="cat-progress-fill"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Controls: Search & Category Chips */}
            <div className="explorer-controls">
              <div className="search-box">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search expenses by description or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="filter-chips">
                <button
                  type="button"
                  className={`filter-chip ${
                    selectedCategory === 'all' ? 'active' : ''
                  }`}
                  onClick={() => setSelectedCategory('all')}
                >
                  All Categories
                </button>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`filter-chip ${
                      selectedCategory === cat.id ? 'active' : ''
                    }`}
                    onClick={() => setSelectedCategory(cat.id)}
                  >
                    {cat.icon} {cat.id}
                  </button>
                ))}
              </div>
            </div>

            {/* Expenses List */}
            <div className="expense-list">
              {dataLoading ? (
                <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                  Loading transactions...
                </div>
              ) : expenses.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🍃</div>
                  <div className="empty-title">No expenses found</div>
                  <div className="empty-subtitle">
                    {searchQuery || selectedCategory !== 'all'
                      ? 'Try adjusting your search or category filter.'
                      : 'Add your first expense on the left to get started!'}
                  </div>
                </div>
              ) : (
                expenses.map((expense) => (
                  <div key={expense.id} className="expense-item">
                    <div className="expense-left">
                      <div className="category-icon-badge">
                        {getCategoryIcon(expense.category)}
                      </div>
                      <div className="expense-details">
                        <div className="expense-desc">{expense.description}</div>
                        <div className="expense-meta">
                          <span className="expense-tag">{expense.category}</span>
                          <span>•</span>
                          <span>{expense.date}</span>
                        </div>
                      </div>
                    </div>

                    <div className="expense-right">
                      <div className="expense-amount">
                        ₹{Number(expense.amount).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <button
                        className="btn-delete"
                        title="Delete expense"
                        onClick={() =>
                          handleDeleteExpense(expense.id, expense.description)
                        }
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Toast Notifications */}
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