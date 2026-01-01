import express from 'express';
import { db } from '../db/init.js';

const router = express.Router();

// Asset type order for display
const ASSET_ORDER = ['emergency_fund', 'pension_fund', 'indonesian_equity', 'international_equity', 'gold'];

// Allocation group config (for 50/40/10 chart)
const ALLOCATION_GROUPS = {
  indonesian: {
    name: 'Indonesian',
    emoji: '🇮🇩',
    color: '#EF4444',
    target: 50
  },
  international: {
    name: 'International',
    emoji: '🌍',
    color: '#3B82F6',
    target: 40
  },
  gold: {
    name: 'Gold',
    emoji: '🥇',
    color: '#F59E0B',
    target: 10
  }
};

// Phase definitions
const PHASES = {
  1: {
    name: 'Build Gold',
    description: 'Focus 100% on building gold position',
    duration: 2,
    allocation: { indonesian: 0, international: 0, gold: 100 }
  },
  2: {
    name: 'Build Indonesian Equity',
    description: 'Focus on Indonesian equity while maintaining gold',
    duration: 6,
    allocation: { indonesian: 90, international: 0, gold: 10 }
  },
  3: {
    name: 'Maintenance',
    description: 'Balanced allocation across all categories',
    duration: null,
    allocation: { indonesian: 50, international: 40, gold: 10 }
  }
};

// Calculate current phase based on start date
function calculateCurrentPhase(startDate) {
  if (!startDate) return 1;

  const start = new Date(startDate);
  const now = new Date();
  const monthsDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());

  if (monthsDiff < 2) return 1;
  if (monthsDiff < 8) return 2;
  return 3;
}

// Calculate grouped allocations from holdings
function calculateGroupedAllocations(holdings) {
  const groups = { indonesian: 0, international: 0, gold: 0 };

  for (const h of holdings) {
    const group = h.allocation_group || 'indonesian';
    groups[group] = (groups[group] || 0) + h.current_value;
  }

  const total = Object.values(groups).reduce((sum, v) => sum + v, 0);

  return Object.entries(groups).map(([key, value]) => ({
    group: key,
    name: ALLOCATION_GROUPS[key]?.name || key,
    emoji: ALLOCATION_GROUPS[key]?.emoji || '📊',
    color: ALLOCATION_GROUPS[key]?.color || '#888',
    value,
    percentage: total > 0 ? (value / total) * 100 : 0,
    target: ALLOCATION_GROUPS[key]?.target || 0
  }));
}

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

// Get investment summary with allocations
router.get('/summary', (req, res) => {
  try {
    const holdings = db.prepare('SELECT * FROM investment_holdings').all();
    const targets = db.prepare('SELECT * FROM investment_targets').all();
    const config = db.prepare('SELECT * FROM investment_config LIMIT 1').get();

    const total = holdings.reduce((sum, h) => sum + h.current_value, 0);
    const currentPhase = calculateCurrentPhase(config?.start_date);

    // Sort holdings by asset order
    const sortedHoldings = holdings.sort((a, b) =>
      ASSET_ORDER.indexOf(a.type) - ASSET_ORDER.indexOf(b.type)
    );

    // Calculate grouped allocations for 50/40/10 chart
    const allocations = calculateGroupedAllocations(holdings);

    const summary = {
      totalValue: total,
      monthlyBudget: config?.monthly_budget || 5000000,
      startDate: config?.start_date || null,
      currentPhase,
      phaseInfo: PHASES[currentPhase],
      // Individual holdings for detailed view
      holdings: sortedHoldings.map(h => ({
        ...h,
        percentage: total > 0 ? (h.current_value / total) * 100 : 0
      })),
      // Grouped allocations for 50/40/10 chart
      allocations,
      // Target percentages for each allocation group
      targets: targets.reduce((acc, t) => {
        acc[t.type] = t.target_percentage;
        return acc;
      }, {}),
      phases: PHASES,
      allocationGroups: ALLOCATION_GROUPS
    };

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update holding value
router.put('/holdings/:type', (req, res) => {
  try {
    const { type } = req.params;
    const { current_value, name, platform, allocation_group } = req.body;

    const existing = db.prepare('SELECT * FROM investment_holdings WHERE type = ?').get(type);

    if (existing) {
      db.prepare(`
        UPDATE investment_holdings 
        SET current_value = COALESCE(?, current_value), 
            name = COALESCE(?, name), 
            platform = COALESCE(?, platform),
            allocation_group = COALESCE(?, allocation_group),
            updated_at = CURRENT_TIMESTAMP
        WHERE type = ?
      `).run(current_value, name, platform, allocation_group, type);
    } else {
      db.prepare(`
        INSERT INTO investment_holdings (type, name, platform, current_value, allocation_group) 
        VALUES (?, ?, ?, ?, ?)
      `).run(type, name || type, platform || '', current_value || 0, allocation_group || 'indonesian');
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get contribution plan based on current phase
router.get('/contribution-plan', (req, res) => {
  try {
    const holdings = db.prepare('SELECT * FROM investment_holdings').all();
    const targets = db.prepare('SELECT * FROM investment_targets').all();
    const config = db.prepare('SELECT * FROM investment_config LIMIT 1').get();

    const monthlyBudget = config?.monthly_budget || 5000000;
    const currentPhase = calculateCurrentPhase(config?.start_date);
    const phaseAllocation = PHASES[currentPhase].allocation;

    const total = holdings.reduce((sum, h) => sum + h.current_value, 0);

    // Calculate grouped allocations
    const allocations = calculateGroupedAllocations(holdings);

    // Calculate contributions per allocation group
    const groupContributions = Object.entries(phaseAllocation).map(([group, pct]) => {
      const allocation = allocations.find(a => a.group === group);
      return {
        group,
        name: ALLOCATION_GROUPS[group]?.name || group,
        emoji: ALLOCATION_GROUPS[group]?.emoji || '📊',
        currentValue: allocation?.value || 0,
        currentPercentage: allocation?.percentage || 0,
        targetPercentage: ALLOCATION_GROUPS[group]?.target || 0,
        suggestedContribution: Math.round(monthlyBudget * (pct / 100)),
        contributionPercentage: pct
      };
    });

    // Also provide per-holding breakdown for detailed view
    const sortedHoldings = holdings.sort((a, b) =>
      ASSET_ORDER.indexOf(a.type) - ASSET_ORDER.indexOf(b.type)
    );

    const holdingContributions = sortedHoldings.map(h => {
      const group = h.allocation_group || 'indonesian';
      const groupPct = phaseAllocation[group] || 0;

      // Divide group contribution among holdings in that group
      const holdingsInGroup = holdings.filter(x => x.allocation_group === group);
      const holdingShare = holdingsInGroup.length > 0 ? 1 / holdingsInGroup.length : 0;

      return {
        ...h,
        currentPercentage: total > 0 ? (h.current_value / total) * 100 : 0,
        suggestedContribution: Math.round(monthlyBudget * (groupPct / 100) * holdingShare),
        contributionPercentage: groupPct * holdingShare
      };
    });

    // Calculate months remaining in current phase
    let monthsInPhase = 0;
    let monthsRemaining = null;

    if (config?.start_date) {
      const start = new Date(config.start_date);
      const now = new Date();
      monthsInPhase = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());

      if (currentPhase === 1) {
        monthsRemaining = Math.max(0, 2 - monthsInPhase);
      } else if (currentPhase === 2) {
        monthsRemaining = Math.max(0, 8 - monthsInPhase);
      }
    }

    res.json({
      monthlyBudget,
      currentPhase,
      phaseInfo: PHASES[currentPhase],
      monthsInPhase,
      monthsRemaining,
      // Group-level contributions (for 50/40/10 view)
      groupContributions,
      // Per-holding contributions (for detailed view)
      contributions: holdingContributions
    });
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
      `).run(monthly_budget || 5000000, start_date || new Date().toISOString().split('T')[0]);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start the investment plan
router.post('/start-plan', (req, res) => {
  try {
    const startDate = new Date().toISOString().split('T')[0];

    const existing = db.prepare('SELECT * FROM investment_config LIMIT 1').get();

    if (existing) {
      db.prepare(`
        UPDATE investment_config 
        SET start_date = ?, updated_at = CURRENT_TIMESTAMP
      `).run(startDate);
    } else {
      db.prepare(`
        INSERT INTO investment_config (monthly_budget, start_date, catch_up_phase) VALUES (?, ?, 1)
      `).run(5000000, startDate);
    }

    res.json({ success: true, startDate });
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
      query += ' WHERE date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const contributions = db.prepare(query).all(...params);
    res.json(contributions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update target allocation
router.put('/targets/:type', (req, res) => {
  try {
    const { type } = req.params;
    const { target_percentage } = req.body;

    const existing = db.prepare('SELECT * FROM investment_targets WHERE type = ?').get(type);

    if (existing) {
      db.prepare(`UPDATE investment_targets SET target_percentage = ? WHERE type = ?`).run(target_percentage, type);
    } else {
      db.prepare(`INSERT INTO investment_targets (type, target_percentage) VALUES (?, ?)`).run(type, target_percentage);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get action items
router.get('/action-items', (req, res) => {
  try {
    const holdings = db.prepare('SELECT * FROM investment_holdings').all();
    const config = db.prepare('SELECT * FROM investment_config LIMIT 1').get();

    const allocations = calculateGroupedAllocations(holdings);
    const goldAlloc = allocations.find(a => a.group === 'gold');
    const indoAlloc = allocations.find(a => a.group === 'indonesian');

    const currentPhase = calculateCurrentPhase(config?.start_date);
    const actionItems = [];

    if (!config?.start_date) {
      actionItems.unshift({
        id: 'start_plan',
        priority: 'high',
        category: 'setup',
        title: 'Start Investment Plan',
        description: 'Click "Start Plan" to begin your 8-month investment journey.',
        completed: false
      });
    }

    if (currentPhase === 1 && (goldAlloc?.value || 0) < 10000000) {
      actionItems.push({
        id: 'build_gold',
        priority: 'high',
        category: 'contribution',
        title: 'Build Gold Position',
        description: `Target: Rp10M. Current: Rp${((goldAlloc?.value || 0) / 1000000).toFixed(1)}M. Put 100% of monthly budget into gold.`,
        completed: false
      });
    }

    if (currentPhase === 2) {
      actionItems.push({
        id: 'build_indo_equity',
        priority: 'high',
        category: 'contribution',
        title: 'Build Indonesian Allocation',
        description: `Focus 90% on Indonesian assets (Emergency/Pension/Equity). Current: ${indoAlloc?.percentage.toFixed(1)}%`,
        completed: false
      });
    }

    res.json(actionItems);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
