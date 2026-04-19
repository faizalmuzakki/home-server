import axios from 'axios';
import { notifyError } from './discord.js';

const API_URL = process.env.API_URL || 'http://api:3000';

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000, // 60s for Claude API calls
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    // Skip 4xx (user errors, already surfaced to the user)
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return Promise.reject(error);
    }

    const meta = error.config?.meta || {};
    const endpoint = error.config?.url || null;
    const method = error.config?.method?.toUpperCase() || null;
    const errorMessage = error.response?.data?.error
      || error.response?.data?.message
      || error.code
      || error.message
      || 'unknown error';

    // Fire-and-forget: never await, never let webhook failure affect the caller
    notifyError({
      endpoint,
      method,
      status: typeof status === 'number' ? status : null,
      errorMessage,
      sender: meta.sender,
      messagePreview: meta.messagePreview
    });

    return Promise.reject(error);
  }
);

export async function parseText(text, meta = {}) {
  const response = await api.post('/api/parse/text', { text }, { meta });
  return response.data;
}

export async function parseImage(base64Image, meta = {}) {
  const response = await api.post('/api/parse/image', { image: base64Image }, { meta });
  return response.data;
}

export async function createExpense(expense, meta = {}) {
  const response = await api.post('/api/expenses', expense, { meta });
  return response.data;
}

export async function getCategories(meta = {}) {
  const response = await api.get('/api/categories', { meta });
  return response.data;
}

export async function getExpenses(params = {}, meta = {}) {
  const response = await api.get('/api/expenses', { params, meta });
  return response.data;
}

export async function getStats(params = {}, meta = {}) {
  const response = await api.get('/api/stats/summary', { params, meta });
  return response.data;
}

export async function uploadImage(base64Image, filename, meta = {}) {
  const response = await api.post('/api/upload', { image: base64Image, filename }, { meta });
  return response.data;
}
