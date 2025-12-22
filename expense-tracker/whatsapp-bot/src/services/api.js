import axios from 'axios';

const API_URL = process.env.API_URL || 'http://api:3000';

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000, // 60s for Claude API calls
});

export async function parseText(text) {
  const response = await api.post('/api/parse/text', { text });
  return response.data;
}

export async function parseImage(base64Image) {
  const response = await api.post('/api/parse/image', { image: base64Image });
  return response.data;
}

export async function createExpense(expense) {
  const response = await api.post('/api/expenses', expense);
  return response.data;
}

export async function getCategories() {
  const response = await api.get('/api/categories');
  return response.data;
}

export async function getExpenses(params = {}) {
  const response = await api.get('/api/expenses', { params });
  return response.data;
}

export async function getStats(params = {}) {
  const response = await api.get('/api/stats/summary', { params });
  return response.data;
}
