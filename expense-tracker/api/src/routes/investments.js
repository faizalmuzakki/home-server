import express from 'express';
import { db } from '../db/init.js';

const router = express.Router();

// Asset type order for display
const ASSET_ORDER = ['emergency_fund', 'pension_fund', 'indonesian_equity', 'international_equity', 'gold'];

// Phase definitions
const PHASES = {
  1: {
    name: 'Build Gold',
    description: 'Focus 100% on building gold position',
    duration: 2, // months
    allocation: {
      emergency_fund: 0,
      pension_fund: 0,
      indonesian_equity: 0,
      international_equity: 0,
      gold: 100
    }
  },
  2: {
    name: 'Build Indonesian Equity',
    description: 'Focus on Indonesian equity while maintaining gold',
    duration: 6, // months (3-8)
    allocation: {
      emergency_fund: 0,
      pension_fund: 0,
      indonesian_equity: 90,
      international_equity: 0,
      gold: 10
    }
  },
  3: {
    name: 'Maintenance',
    description: 'Balanced allocation across all categories',
    duration: null, // ongoing
    allocation: {
      emergency_fund: 10,
      pension_fund: 25,
      indonesian_equity: 30,
      international_equity: 25,
      gold: 10
    }
  }
};

// Calculate current phase based on start date
function calculateCurrentPhase(startDate) {
  if (!startDate) return 1;

  const start = new Date(startDate);
  const now = new Date();
  const monthsDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());

  if (monthsDiff < 2) return 1;  // Months 1-2
  if (monthsDiff < 8) return 2;  // Months 3-8
  return 3;  // Month 9+
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

    const summary = {
      totalValue: total,
      monthlyBudget: config?.monthly_budget || 5000000,
      startDate: config?.start_date || null,
      currentPhase,
      phaseInfo: PHASES[currentPhase],
      holdings: sortedHoldings.map(h => ({
        ...h,
        percentage: total > 0 ? (h.current_value / total) * 100 : 0
      })),
      targets: targets.reduce((acc, t) => {
        acc[t.type] = t.target_percentage;
        return acc;
      }, {}),
      phases: PHASES
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
    const { current_value, name, platform } = req.body;

    // Check if holding exists
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
      // Insert new holding
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

    // Calculate target values and differences (final targets)
    const targetMap = targets.reduce((acc, t) => {
      acc[t.type] = t.target_percentage / 100;
      return acc;
    }, {});

    // Sort holdings
    const sortedHoldings = holdings.sort((a, b) =>
      ASSET_ORDER.indexOf(a.type) - ASSET_ORDER.indexOf(b.type)
    );

    const contributions = sortedHoldings.map(h => {
      const currentPct = total > 0 ? h.current_value / total : 0;
      const targetPct = targetMap[h.type] || 0;
      const phaseContribPct = phaseAllocation[h.type] || 0;

      return {
        ...h,
        currentPercentage: currentPct * 100,
        targetPercentage: targetPct * 100,
        difference: (currentPct - targetPct) * 100,
        suggestedContribution: Math.round(monthlyBudget * (phaseContribPct / 100)),
        contributionPercentage: phaseContribPct
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
      contributions
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

// Start the investment plan (sets start_date)
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

    // Log the contribution
    db.prepare(`
      INSERT INTO investment_contributions (type, amount, date, notes) VALUES (?, ?, ?, ?)
    `).run(type, amount, date || new Date().toISOString().split('T')[0], notes);

    // Update the holding value
    const existing = db.prepare('SELECT * FROM investment_holdings WHERE type = ?').get(type);

    if (existing) {
      db.prepare(`
        UPDATE investment_holdings 
        SET current_value = current_value + ?, updated_at = CURRENT_TIMESTAMP
        WHERE type = ?
      `).run(amount, type);
    } else {
      // Create holding if it doesn't exist
      db.prepare(`
        INSERT INTO investment_holdings (type, name, platform, current_value) 
        VALUES (?, ?, '', ?)
      `).run(type, type, amount);
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
      db.prepare(`
        UPDATE investment_targets SET target_percentage = ? WHERE type = ?
      `).run(target_percentage, type);
    } else {
      db.prepare(`
        INSERT INTO investment_targets (type, target_percentage) VALUES (?, ?)
      `).run(type, target_percentage);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get action items / checklist
router.get('/action-items', (req, res) => {
  try {
    const holdings = db.prepare('SELECT * FROM investment_holdings').all();
    const config = db.prepare('SELECT * FROM investment_config LIMIT 1').get();

    const holdingMap = holdings.reduce((acc, h) => {
      acc[h.type] = h;
      return acc;
    }, {});

    const currentPhase = calculateCurrentPhase(config?.start_date);
    const actionItems = [];

    // Phase-specific actions
    if (currentPhase === 1) {
      if ((holdingMap.gold?.current_value || 0) < 10000000) {
        actionItems.push({
          id: 'build_gold',
          priority: 'high',
          category: 'contribution',
          title: 'Build Gold Position',
          description: `Target: Rp10M. Current: Rp${((holdingMap.gold?.current_value || 0) / 1000000).toFixed(1)}M. Put 100% of monthly budget into gold.`,
          completed: false
        });
      }
    } else if (currentPhase === 2) {
      if ((holdingMap.indonesian_equity?.current_value || 0) < 32000000) {
        actionItems.push({
          id: 'build_indo_equity',
          priority: 'high',
          category: 'contribution',
          title: 'Build Indonesian Equity',
          description: `Target: Rp32M. Current: Rp${((holdingMap.indonesian_equity?.current_value || 0) / 1000000).toFixed(1)}M. Put 90% into Reksa Dana Saham.`,
          completed: false
        });
      }
    }

    // One-time setup actions
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

    // Check pension allocation (should be Agresif)
    const pensionHolding = holdingMap.pension_fund;
    if (pensionHolding && !pensionHolding.platform?.toLowerCase().includes('agresif')) {
      actionItems.push({
        id: 'switch_pension',
        priority: 'high',
        category: 'setup',
        title: 'Switch Pension to Agresif',
        description: 'Change your robo-advisor from Moderat to Agresif for higher growth potential.',
        completed: false
      });
    }

    res.json(actionItems);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
