import { useState, useEffect, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function Calories() {
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate, setEndDate] = useState(todayStr())
  const [summary, setSummary] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = `startDate=${startDate}&endDate=${endDate}`
      const [s, e] = await Promise.all([
        fetch(`${API_URL}/api/calories/summary?${qs}`).then(r => r.json()),
        fetch(`${API_URL}/api/calories?${qs}&limit=100`).then(r => r.json())
      ])
      setSummary(Array.isArray(s) ? s : [])
      setEntries(Array.isArray(e) ? e : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { load() }, [load])

  return (
    <div className="calories-view">
      <div className="filter-bar">
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        <button onClick={load}>Refresh</button>
      </div>

      {error && <p className="error">Failed to load: {error}</p>}
      {loading && <p>Loading…</p>}

      <div className="stat-cards">
        {summary.map(s => (
          <div key={s.sender_id} className="stat-card">
            <span className="stat-label">{s.sender_name || s.sender_id}</span>
            <span className="stat-value">{Math.round(s.total_calories)} kcal</span>
            <span className="stat-sub">
              P {Math.round(s.total_protein_g)}g · C {Math.round(s.total_carbs_g)}g · F {Math.round(s.total_fat_g)}g · {s.entry_count} meal(s)
            </span>
          </div>
        ))}
        {!loading && summary.length === 0 && <p>No food logged for this range.</p>}
      </div>

      <ul className="calorie-entries">
        {entries.map(en => (
          <li key={en.id} className="calorie-entry">
            {en.image_url && (
              <img src={`${API_URL}${en.image_url}`} alt="" className="calorie-thumb" width="56" height="56" />
            )}
            <div>
              <strong>{en.sender_name || en.sender_id}</strong> — {en.description || 'Meal'}<br />
              {Math.round(en.calories)} kcal · {en.date}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
