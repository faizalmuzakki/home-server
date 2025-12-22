import { useState, useEffect } from 'react';
import { PlusCircle, Trash2, Edit2, X, Check, TrendingUp, Calendar, Tag } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || '';

function App() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState({ total: 0, count: 0, byCategory: [] });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  async function fetchData() {
    setLoading(true);
    try {
      const [expRes, catRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/expenses?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`),
        fetch(`${API_URL}/api/categories`),
        fetch(`${API_URL}/api/stats/summary?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`)
      ]);
      
      setExpenses(await expRes.json());
      setCategories(await catRes.json());
      setStats(await statsRes.json());
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    setLoading(false);
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">💰 Expense Tracker</h1>
        </div>
      </header>

      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-4">
            {['dashboard', 'expenses', 'categories'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 font-medium capitalize transition-colors ${
                  activeTab === tab 
                    ? 'text-blue-600 border-b-2 border-blue-600' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6 flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-500" />
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              className="border rounded-lg px-3 py-2"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              className="border rounded-lg px-3 py-2"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <Dashboard stats={stats} formatCurrency={formatCurrency} />
            )}
            {activeTab === 'expenses' && (
              <ExpenseList 
                expenses={expenses} 
                categories={categories}
                formatCurrency={formatCurrency}
                onRefresh={fetchData}
              />
            )}
            {activeTab === 'categories' && (
              <CategoryList 
                categories={categories}
                onRefresh={fetchData}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Dashboard({ stats, formatCurrency }) {
  const chartData = stats.byCategory
    .filter(c => c.total > 0)
    .map(c => ({ name: c.name, value: c.total, color: c.color }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-6 border">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Spent</p>
              <p className="text-2xl font-bold">{formatCurrency(stats.total)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <Tag className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Transactions</p>
              <p className="text-2xl font-bold">{stats.count}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Calendar className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Avg per Transaction</p>
              <p className="text-2xl font-bold">
                {formatCurrency(stats.count > 0 ? stats.total / stats.count : 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border">
          <h3 className="text-lg font-semibold mb-4">Spending by Category</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-12">No data for this period</p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border">
          <h3 className="text-lg font-semibold mb-4">Category Breakdown</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} layout="vertical">
                <XAxis type="number" tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={100} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-12">No data for this period</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ExpenseList({ expenses, categories, formatCurrency, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    amount: '',
    description: '',
    vendor: '',
    category_id: '',
    date: new Date().toISOString().split('T')[0]
  });

  const API_URL = import.meta.env.VITE_API_URL || '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = editingId 
      ? `${API_URL}/api/expenses/${editingId}`
      : `${API_URL}/api/expenses`;
    
    await fetch(url, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        amount: parseFloat(form.amount),
        category_id: form.category_id ? parseInt(form.category_id) : null
      })
    });

    setShowForm(false);
    setEditingId(null);
    setForm({ amount: '', description: '', vendor: '', category_id: '', date: new Date().toISOString().split('T')[0] });
    onRefresh();
  };

  const handleEdit = (expense) => {
    setForm({
      amount: expense.amount,
      description: expense.description || '',
      vendor: expense.vendor || '',
      category_id: expense.category_id || '',
      date: expense.date
    });
    setEditingId(expense.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return;
    await fetch(`${API_URL}/api/expenses/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Expenses</h2>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle className="w-5 h-5" />
          Add Expense
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm p-6 border">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <input
                  type="number"
                  required
                  value={form.amount}
                  onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="50000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Lunch"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <input
                  type="text"
                  value={form.vendor}
                  onChange={(e) => setForm(prev => ({ ...prev, vendor: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Restaurant name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm(prev => ({ ...prev, category_id: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Select category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                <Check className="w-5 h-5" />
                {editingId ? 'Update' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="flex items-center gap-2 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                <X className="w-5 h-5" />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Date</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Description</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Category</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Amount</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {expenses.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-8 text-gray-500">
                  No expenses found
                </td>
              </tr>
            ) : (
              expenses.map(expense => (
                <tr key={expense.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{expense.date}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{expense.description || '-'}</div>
                    {expense.vendor && (
                      <div className="text-sm text-gray-500">{expense.vendor}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {expense.category_name ? (
                      <span 
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm"
                        style={{ backgroundColor: expense.category_color + '20', color: expense.category_color }}
                      >
                        {expense.category_icon} {expense.category_name}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(expense.amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleEdit(expense)}
                      className="p-1 text-gray-500 hover:text-blue-600"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(expense.id)}
                      className="p-1 text-gray-500 hover:text-red-600 ml-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoryList({ categories, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', icon: '', color: '#4ECDC4' });

  const API_URL = import.meta.env.VITE_API_URL || '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    const url = editingId 
      ? `${API_URL}/api/categories/${editingId}`
      : `${API_URL}/api/categories`;
    
    await fetch(url, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    setShowForm(false);
    setEditingId(null);
    setForm({ name: '', icon: '', color: '#4ECDC4' });
    onRefresh();
  };

  const handleEdit = (category) => {
    setForm({
      name: category.name,
      icon: category.icon || '',
      color: category.color || '#4ECDC4'
    });
    setEditingId(category.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this category?')) return;
    const res = await fetch(`${API_URL}/api/categories/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error);
      return;
    }
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Categories</h2>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle className="w-5 h-5" />
          Add Category
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm p-6 border">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Category name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Icon (emoji)</label>
                <input
                  type="text"
                  value={form.icon}
                  onChange={(e) => setForm(prev => ({ ...prev, icon: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="🍔"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm(prev => ({ ...prev, color: e.target.value }))}
                  className="w-full h-10 border rounded-lg cursor-pointer"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                <Check className="w-5 h-5" />
                {editingId ? 'Update' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="flex items-center gap-2 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                <X className="w-5 h-5" />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map(category => (
          <div 
            key={category.id} 
            className="bg-white rounded-xl shadow-sm p-4 border flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                style={{ backgroundColor: category.color + '20' }}
              >
                {category.icon}
              </div>
              <span className="font-medium">{category.name}</span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => handleEdit(category)}
                className="p-2 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-gray-100"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(category.id)}
                className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-gray-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
