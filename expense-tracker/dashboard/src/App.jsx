import { useState, useEffect, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// Format currency (Indonesian Rupiah)
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

// Format date
const formatDate = (dateStr) => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

// Get current month date range
const getCurrentMonthRange = () => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0]
  }
}

// Icons (simple SVG)
const Icons = {
  home: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  chart: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  plus: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  close: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  calendar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  filter: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  wallet: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
  empty: <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
}

// Stat Card Component
function StatCard({ label, value, type, count }) {
  const isPositive = type === 'income' || (type === 'net' && value >= 0)
  const valueClass = type === 'net'
    ? (value >= 0 ? 'positive' : 'negative')
    : (type === 'income' ? 'positive' : 'negative')

  return (
    <div className={`stat-card ${type}`}>
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${valueClass}`}>
        {type === 'income' && '+'}
        {type === 'expense' && '-'}
        {formatCurrency(Math.abs(value))}
      </span>
      {count !== undefined && (
        <span className="text-secondary" style={{ fontSize: 'var(--font-sm)' }}>
          {count} transaction{count !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}

// Transaction Item Component
function TransactionItem({ transaction, onClick }) {
  const isIncome = transaction.type === 'income'

  return (
    <div className="transaction-item" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div
        className="transaction-icon"
        style={{ backgroundColor: transaction.category_color + '20' }}
      >
        {transaction.category_icon || (isIncome ? '+' : '-')}
      </div>
      <div className="transaction-details">
        <div className="transaction-description">
          {transaction.description || transaction.vendor || 'No description'}
        </div>
        <div className="transaction-meta">
          <span>{formatDate(transaction.date)}</span>
          {transaction.category_name && (
            <span className="category-badge" style={{ borderColor: transaction.category_color }}>
              {transaction.category_name}
            </span>
          )}
        </div>
      </div>
      <div className={`transaction-amount ${isIncome ? 'income' : 'expense'}`}>
        {isIncome ? '+' : '-'}{formatCurrency(transaction.amount)}
      </div>
    </div>
  )
}

// Category Item Component
function CategoryItem({ category, maxTotal }) {
  const percentage = maxTotal > 0 ? (category.total / maxTotal) * 100 : 0

  return (
    <div className="category-item">
      <div
        className="transaction-icon"
        style={{ backgroundColor: category.color + '20', width: '36px', height: '36px' }}
      >
        {category.icon}
      </div>
      <div className="category-info">
        <div className="category-name">{category.name}</div>
        <div className="category-bar-container">
          <div
            className="category-bar"
            style={{
              width: `${percentage}%`,
              backgroundColor: category.color
            }}
          />
        </div>
      </div>
      <div className="category-amount">
        {formatCurrency(category.total)}
      </div>
    </div>
  )
}

// Transaction Modal Component
function TransactionModal({ isOpen, onClose, transaction, categories, onSave, onDelete }) {
  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    vendor: '',
    category_id: '',
    date: new Date().toISOString().split('T')[0],
    type: 'expense'
  })

  useEffect(() => {
    if (transaction) {
      setFormData({
        amount: transaction.amount?.toString() || '',
        description: transaction.description || '',
        vendor: transaction.vendor || '',
        category_id: transaction.category_id?.toString() || '',
        date: transaction.date || new Date().toISOString().split('T')[0],
        type: transaction.type || 'expense'
      })
    } else {
      setFormData({
        amount: '',
        description: '',
        vendor: '',
        category_id: '',
        date: new Date().toISOString().split('T')[0],
        type: 'expense'
      })
    }
  }, [transaction, isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...formData,
      amount: parseFloat(formData.amount),
      category_id: formData.category_id ? parseInt(formData.category_id) : null
    })
  }

  const filteredCategories = categories.filter(c => c.type === formData.type)

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{transaction ? 'Edit Transaction' : 'New Transaction'}</h2>
          <button className="btn btn-icon" onClick={onClose}>
            {Icons.close}
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <div className="tabs">
                <button
                  type="button"
                  className={`tab ${formData.type === 'expense' ? 'active' : ''}`}
                  onClick={() => setFormData(d => ({ ...d, type: 'expense', category_id: '' }))}
                >
                  Expense
                </button>
                <button
                  type="button"
                  className={`tab ${formData.type === 'income' ? 'active' : ''}`}
                  onClick={() => setFormData(d => ({ ...d, type: 'income', category_id: '' }))}
                >
                  Income
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Amount *</label>
              <input
                type="number"
                placeholder="0"
                value={formData.amount}
                onChange={e => setFormData(d => ({ ...d, amount: e.target.value }))}
                required
                min="0"
                step="any"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  type="text"
                  placeholder="What was it for?"
                  value={formData.description}
                  onChange={e => setFormData(d => ({ ...d, description: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Vendor</label>
                <input
                  type="text"
                  placeholder="Where?"
                  value={formData.vendor}
                  onChange={e => setFormData(d => ({ ...d, vendor: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  value={formData.category_id}
                  onChange={e => setFormData(d => ({ ...d, category_id: e.target.value }))}
                >
                  <option value="">Select category</option>
                  {filteredCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Date *</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData(d => ({ ...d, date: e.target.value }))}
                  required
                />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            {transaction && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  if (confirm('Delete this transaction?')) {
                    onDelete(transaction.id)
                  }
                }}
                style={{ marginRight: 'auto' }}
              >
                Delete
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {transaction ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Main App Component
function App() {
  const [activeTab, setActiveTab] = useState('home')
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState(null)

  const [filters, setFilters] = useState(() => getCurrentMonthRange())
  const [typeFilter, setTypeFilter] = useState('all')

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        startDate: filters.startDate,
        endDate: filters.endDate,
        limit: '100'
      })
      if (typeFilter !== 'all') {
        params.append('type', typeFilter)
      }

      const [transRes, catRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/expenses?${params}`),
        fetch(`${API_URL}/api/categories`),
        fetch(`${API_URL}/api/stats/summary?startDate=${filters.startDate}&endDate=${filters.endDate}`)
      ])

      if (!transRes.ok || !catRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch data')
      }

      const [transData, catData, statsData] = await Promise.all([
        transRes.json(),
        catRes.json(),
        statsRes.json()
      ])

      setTransactions(transData)
      setCategories(catData)
      setStats(statsData)
    } catch (err) {
      console.error('Fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filters, typeFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Save transaction
  const handleSaveTransaction = async (data) => {
    try {
      const url = editingTransaction
        ? `${API_URL}/api/expenses/${editingTransaction.id}`
        : `${API_URL}/api/expenses`

      const res = await fetch(url, {
        method: editingTransaction ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (!res.ok) throw new Error('Failed to save')

      setModalOpen(false)
      setEditingTransaction(null)
      fetchData()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  // Delete transaction
  const handleDeleteTransaction = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/expenses/${id}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to delete')

      setModalOpen(false)
      setEditingTransaction(null)
      fetchData()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  // Open modal for new transaction
  const handleNewTransaction = () => {
    setEditingTransaction(null)
    setModalOpen(true)
  }

  // Open modal for editing
  const handleEditTransaction = (transaction) => {
    setEditingTransaction(transaction)
    setModalOpen(true)
  }

  // Get expense categories for breakdown
  const expenseCategories = stats?.byCategory?.filter(c => c.category_type === 'expense' && c.total > 0) || []
  const maxCategoryTotal = Math.max(...expenseCategories.map(c => c.total), 1)

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1 className="header-title">Expense Tracker</h1>
          <div className="desktop-only header-nav">
            <button
              className={`tab ${activeTab === 'home' ? 'active' : ''}`}
              onClick={() => setActiveTab('home')}
            >
              Dashboard
            </button>
            <button
              className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
              onClick={() => setActiveTab('stats')}
            >
              Analytics
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="container">
          {/* Filters */}
          <div className="filter-bar">
            <div className="filter-row">
              <input
                type="date"
                value={filters.startDate}
                onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))}
              />
              <input
                type="date"
                value={filters.endDate}
                onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))}
              />
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="expense">Expenses</option>
                <option value="income">Income</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="loading">
              <div className="spinner"></div>
            </div>
          ) : error ? (
            <div className="empty-state">
              <p>Error: {error}</p>
              <button className="btn btn-primary mt-md" onClick={fetchData}>
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Stats Grid */}
              {stats && (
                <div className="grid grid-stats mb-md">
                  <StatCard
                    label="Income"
                    value={stats.income}
                    type="income"
                    count={stats.incomeCount}
                  />
                  <StatCard
                    label="Expenses"
                    value={stats.expenses}
                    type="expense"
                    count={stats.expenseCount}
                  />
                  <StatCard
                    label="Net Balance"
                    value={stats.net}
                    type="net"
                  />
                </div>
              )}

              {/* Main Grid - Transactions & Categories */}
              <div className="grid grid-main">
                {/* Transactions */}
                <div className="card">
                  <div className="card-header">
                    <h2>Recent Transactions</h2>
                    <span className="text-secondary">
                      {transactions.length} item{transactions.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="card-body">
                    {transactions.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-state-icon">{Icons.empty}</div>
                        <p>No transactions found</p>
                        <button
                          className="btn btn-primary mt-md"
                          onClick={handleNewTransaction}
                        >
                          Add your first transaction
                        </button>
                      </div>
                    ) : (
                      <div className="transaction-list">
                        {transactions.map(t => (
                          <TransactionItem
                            key={t.id}
                            transaction={t}
                            onClick={() => handleEditTransaction(t)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Category Breakdown */}
                {activeTab === 'home' && expenseCategories.length > 0 && (
                  <div className="card mobile-only">
                    <div className="card-header">
                      <h2>Spending by Category</h2>
                    </div>
                    <div className="card-body">
                      <div className="category-list">
                        {expenseCategories.slice(0, 5).map(cat => (
                          <CategoryItem
                            key={cat.id}
                            category={cat}
                            maxTotal={maxCategoryTotal}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Desktop sidebar with category breakdown */}
                <div className="desktop-only">
                  <div className="card">
                    <div className="card-header">
                      <h2>Spending by Category</h2>
                    </div>
                    <div className="card-body">
                      {expenseCategories.length === 0 ? (
                        <div className="empty-state">
                          <p className="text-secondary">No expenses yet</p>
                        </div>
                      ) : (
                        <div className="category-list">
                          {expenseCategories.map(cat => (
                            <CategoryItem
                              key={cat.id}
                              category={cat}
                              maxTotal={maxCategoryTotal}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* FAB */}
      <button className="fab" onClick={handleNewTransaction} aria-label="Add transaction">
        {Icons.plus}
      </button>

      {/* Bottom Navigation - Mobile */}
      <nav className="bottom-nav mobile-only">
        <button
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <span className="nav-icon">{Icons.home}</span>
          <span>Home</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          <span className="nav-icon">{Icons.chart}</span>
          <span>Stats</span>
        </button>
      </nav>

      {/* Transaction Modal */}
      <TransactionModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingTransaction(null)
        }}
        transaction={editingTransaction}
        categories={categories}
        onSave={handleSaveTransaction}
        onDelete={handleDeleteTransaction}
      />
    </div>
  )
}

export default App
