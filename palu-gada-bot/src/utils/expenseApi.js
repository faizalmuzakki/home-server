const BASE_URL = process.env.EXPENSE_API_URL || 'http://expense-tracker-api:3000';

async function apiFetch(path, opts = {}) {
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Expense API ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
}

/**
 * @param {{ startDate?: string, endDate?: string }} opts - YYYY-MM-DD format
 * @returns {Promise<{ income, incomeCount, expenses, expenseCount, net, total, count, byCategory: Array }>}
 */
export function getExpenseSummary({ startDate, endDate } = {}) {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const qs = params.toString();
    return apiFetch(`/api/stats/summary${qs ? `?${qs}` : ''}`);
}

/**
 * @param {{ startDate?: string, endDate?: string }} opts
 * @returns {Promise<Array<{ date, expenses, income, net, count }>>}
 */
export function getDailyStats({ startDate, endDate } = {}) {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const qs = params.toString();
    return apiFetch(`/api/stats/daily${qs ? `?${qs}` : ''}`);
}

/**
 * @param {{ year?: number }} opts
 * @returns {Promise<Array<{ month, expenses, income, net, count }>>}
 */
export function getMonthlyStats({ year } = {}) {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    const qs = params.toString();
    return apiFetch(`/api/stats/monthly${qs ? `?${qs}` : ''}`);
}

/**
 * @returns {Promise<Array<{ id, name, icon, color, type }>>}
 */
export function getCategories() {
    return apiFetch('/api/categories');
}

/**
 * @param {{ amount: number, date: string, description: string, vendor?: string, category_id?: number, type?: 'expense'|'income' }} data
 */
export function createExpense(data) {
    return apiFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}
