import express from 'express';
import { db } from '../db/init.js';

const router = express.Router();

// Asset type order for display
const ASSET_ORDER = ['emergency_fund', 'pension_fund', 'indonesian_equity', 'international_equity', 'gold'];

// Portfolio bucket definitions
const PORTFOLIO_BUCKETS = {
  safety: {
    name: 'Safety',
    description: 'Emergency fund - untouchable safety money',
    emoji: '🛡️',
    color: '#6B7280',
    holdings: ['emergency_fund'],
    targetAmount: 30000000, // Target Rp30M
    showIn5040: false
  },
  pension: {
    name: 'Pension',
    description: 'Auto-pilot retirement fund (Robo Agresif)',
    emoji: '🏦',
    color: '#8B5CF6',
    holdings: ['pension_fund'],
    showIn5040: false
  },
  active: {
    name: 'Active Portfolio',
    description: '50/40/10 strategy - Indonesian/International/Gold',
    emoji: '📊',
    color: '#10B981',
    holdings: ['indonesian_equity', 'international_equity', 'gold'],
    showIn5040: true,
    allocation: {
      indonesian_equity: 50,
      international_equity: 40,
      gold: 10
    }
  }
};

// Get all investment holdings
router.get('/holdings', (req, res) => {
  try {
    const holdings = db.prepare(`
      SELECT * FROM investment_holdings 
      ORDER BY 
        CASE type 
          WHEN 'emergency_fund' THEN 1
          WHEN 'pension_fund' THEN 2
          WHEN 'indonesian_equity' THEN 3 
          WHEN 'international_equity' THEN 4 
          WHEN 'gold' THEN 5 
        END
    `).all();
    res.json(holdings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get investment summary with portfolio breakdown
router.get('/summary', (req, res) => {
  try {
    const holdings = db.prepare('SELECT * FROM investment_holdings').all();
    const config = db.prepare('SELECT * FROM investment_config LIMIT 1').get();

    // Map holdings by type
    const holdingMap = {};
    holdings.forEach(h => { holdingMap[h.type] = h; });

    // Calculate totals for each bucket
    const buckets = {};
    let totalPortfolio = 0;

    for (const [bucketKey, bucketDef] of Object.entries(PORTFOLIO_BUCKETS)) {
      const bucketHoldings = bucketDef.holdings.map(type => holdingMap[type]).filter(Boolean);
      const bucketTotal = bucketHoldings.reduce((sum, h) => sum + h.current_value, 0);
      totalPortfolio += bucketTotal;

      buckets[bucketKey] = {
        ...bucketDef,
        key: bucketKey,
        total: bucketTotal,
        holdings: bucketHoldings.map(h => ({
          ...h,
          targetPercentage: bucketDef.allocation?.[h.type] || null
        }))
      };
    }

    // Calculate active portfolio 50/40/10 allocation
    const activeBucket = buckets.active;
    const activeTotal = activeBucket.total;

    const activeAllocation = activeBucket.holdings.map(h => {
      const targetPct = PORTFOLIO_BUCKETS.active.allocation[h.type] || 0;
      const currentPct = activeTotal > 0 ? (h.current_value / activeTotal) * 100 : 0;
      return {
        type: h.type,
        name: h.name,
        platform: h.platform,
        value: h.current_value,
        currentPercentage: currentPct,
        targetPercentage: targetPct,
        difference: currentPct - targetPct,
        targetValue: activeTotal * (targetPct / 100)
      };
    });

    // Calculate overall portfolio percentages
    const portfolioBreakdown = Object.entries(buckets).map(([key, bucket]) => ({
      key,
      name: bucket.name,
      emoji: bucket.emoji,
      color: bucket.color,
      value: bucket.total,
      percentage: totalPortfolio > 0 ? (bucket.total / totalPortfolio) * 100 : 0
    }));

    res.json({
      totalPortfolio,
      activePortfolioTotal: activeTotal,
      monthlyBudget: config?.monthly_budget || 5000000,
      startDate: config?.start_date || null,
      buckets,
      portfolioBreakdown,
      activeAllocation,
      // Individual holdings for detailed view
      holdings: holdings.sort((a, b) => ASSET_ORDER.indexOf(a.type) - ASSET_ORDER.indexOf(b.type)).map(h => ({
        ...h,
        percentage: totalPortfolio > 0 ? (h.current_value / totalPortfolio) * 100 : 0
      })),
      portfolioBuckets: PORTFOLIO_BUCKETS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get contribution plan
router.get('/contribution-plan', (req, res) => {
  try {
    const holdings = db.prepare('SELECT * FROM investment_holdings').all();
    const config = db.prepare('SELECT * FROM investment_config LIMIT 1').get();

    const monthlyBudget = config?.monthly_budget || 5000000;

    // Map holdings by type
    const holdingMap = {};
    holdings.forEach(h => { holdingMap[h.type] = h; });

    // Emergency fund check
    const emergencyFund = holdingMap.emergency_fund?.current_value || 0;
    const emergencyTarget = PORTFOLIO_BUCKETS.safety.targetAmount;
    const emergencyMet = emergencyFund >= emergencyTarget;

    // Calculate active portfolio total
    const activeHoldings = PORTFOLIO_BUCKETS.active.holdings.map(type => holdingMap[type]).filter(Boolean);
    const activeTotal = activeHoldings.reduce((sum, h) => sum + h.current_value, 0);

    // Build contribution suggestions
    let contributions = [];
    let remainingBudget = monthlyBudget;

    // If emergency not met, prioritize it
    if (!emergencyMet) {
      const emergencyContrib = Math.min(remainingBudget, emergencyTarget - emergencyFund);
      contributions.push({
        type: 'emergency_fund',
        name: 'Emergency Fund',
        amount: Math.min(emergencyContrib, monthlyBudget * 0.5), // Max 50% to emergency
        reason: 'Building safety buffer'
      });
      remainingBudget -= contributions[0].amount;
    }

    // Pension contribution (25% of remaining)
    const pensionContrib = remainingBudget * 0.25;
    contributions.push({
      type: 'pension_fund',
      name: 'Pension Fund',
      amount: Math.round(pensionContrib),
      reason: 'Retirement auto-pilot'
    });
    remainingBudget -= pensionContrib;

    // Active portfolio (75% of remaining) split by 50/40/10
    const activeContrib = remainingBudget;
    const activeAllocation = PORTFOLIO_BUCKETS.active.allocation;

    for (const [type, pct] of Object.entries(activeAllocation)) {
      const holding = holdingMap[type];
      contributions.push({
        type,
        name: holding?.name || type,
        amount: Math.round(activeContrib * (pct / 100)),
        reason: `50/40/10 (${pct}%)`
      });
    }

    res.json({
      monthlyBudget,
      emergencyMet,
      emergencyProgress: Math.min(100, (emergencyFund / emergencyTarget) * 100),
      contributions,
      activePortfolioTotal: activeTotal,
      note: emergencyMet
        ? 'Emergency fund complete! Contributions split between Pension (25%) and Active Portfolio (75%).'
        : 'Building emergency fund first, then splitting remaining budget.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update holding value
router.put('/holdings/:type', (req, res) => {
  try {
    const { type } = req.params;
    const { current_value, name, platform } = req.body;

    const existing = db.prepare('SELECT * FROM investment_holdings WHERE type = ?').get(type);

    if (existing) {
      db.prepare(`
        UPDATE investment_holdings 
        SET current_value = COALESCE(?, current_value), 
            name = COALESCE(?, name), 
            platform = COALESCE(?, platform),
            updated_at = CURRENT_TIMESTAMP
        WHERE type = ?
      `).run(current_value, name, platform, type);
    } else {
      db.prepare(`
        INSERT INTO investment_holdings (type, name, platform, current_value) 
        VALUES (?, ?, ?, ?)
      `).run(type, name || type, platform || '', current_value || 0);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update investment config
router.put('/config', (req, res) => {
  try {
    const { monthly_budget, start_date } = req.body;

    const existing = db.prepare('SELECT * FROM investment_config LIMIT 1').get();

    if (existing) {
      db.prepare(`
        UPDATE investment_config 
        SET monthly_budget = COALESCE(?, monthly_budget), 
            start_date = COALESCE(?, start_date),
            updated_at = CURRENT_TIMESTAMP
      `).run(monthly_budget, start_date);
    } else {
      db.prepare(`
        INSERT INTO investment_config (monthly_budget, start_date, catch_up_phase) VALUES (?, ?, 1)
      `).run(monthly_budget || 5000000, start_date);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Log a contribution
router.post('/contributions', (req, res) => {
  try {
    const { type, amount, date, notes } = req.body;

    db.prepare(`
      INSERT INTO investment_contributions (type, amount, date, notes) VALUES (?, ?, ?, ?)
    `).run(type, amount, date || new Date().toISOString().split('T')[0], notes);

    const existing = db.prepare('SELECT * FROM investment_holdings WHERE type = ?').get(type);

    if (existing) {
      db.prepare(`
        UPDATE investment_holdings 
        SET current_value = current_value + ?, updated_at = CURRENT_TIMESTAMP
        WHERE type = ?
      `).run(amount, type);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get contribution history
router.get('/contributions', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let query = 'SELECT * FROM investment_contributions';
    const params = [];

    if (startDate && endDate) {
      query += ' WHERE DATE(date) BETWEEN DATE(?) AND DATE(?)';
      params.push(startDate, endDate);
    }

    query += ' ORDER BY date DESC, created_at DESC LIMIT 50';

    const contributions = db.prepare(query).all(...params);
    res.json(contributions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get action items
router.get('/action-items', (req, res) => {
  try {
    const holdings = db.prepare('SELECT * FROM investment_holdings').all();

    const holdingMap = {};
    holdings.forEach(h => { holdingMap[h.type] = h; });

    const actionItems = [];

    // Check emergency fund
    const emergency = holdingMap.emergency_fund?.current_value || 0;
    const emergencyTarget = PORTFOLIO_BUCKETS.safety.targetAmount;

    if (emergency < emergencyTarget) {
      actionItems.push({
        id: 'build_emergency',
        priority: 'high',
        category: 'safety',
        title: 'Build Emergency Fund',
        description: `Target: Rp30M. Current: Rp${(emergency / 1000000).toFixed(1)}M (${((emergency / emergencyTarget) * 100).toFixed(0)}%)`,
        completed: false
      });
    }

    // Check gold (if 0, suggest starting)
    const gold = holdingMap.gold?.current_value || 0;
    if (gold === 0) {
      actionItems.push({
        id: 'start_gold',
        priority: 'medium',
        category: 'active',
        title: 'Start Gold Position',
        description: 'You have no gold allocation yet. Consider starting with your monthly contribution.',
        completed: false
      });
    }

    // Check pension platform
    const pension = holdingMap.pension_fund;
    if (pension && !pension.platform?.toLowerCase().includes('agresif')) {
      actionItems.push({
        id: 'switch_pension',
        priority: 'high',
        category: 'pension',
        title: 'Switch Pension to Agresif',
        description: 'Change robo-advisor from Moderat to Agresif for higher growth.',
        completed: false
      });
    }

    res.json(actionItems);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
