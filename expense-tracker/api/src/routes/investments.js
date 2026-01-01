import express from 'express';
import { db } from '../db/init.js';

const router = express.Router();

// Get all investment holdings
router.get('/holdings', (req, res) => {
  try {
    const holdings = db.prepare(`
      SELECT * FROM investment_holdings 
      ORDER BY 
        CASE type 
          WHEN 'indonesian_equity' THEN 1 
          WHEN 'international_equity' THEN 2 
          WHEN 'gold' THEN 3 
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
    
    const summary = {
      totalValue: total,
      monthlyBudget: config?.monthly_budget || 5000000,
      catchUpPhase: config?.catch_up_phase || true,
      holdings: holdings.map(h => ({
        ...h,
        percentage: total > 0 ? (h.current_value / total) * 100 : 0
      })),
      targets: targets.reduce((acc, t) => {
        acc[t.type] = t.target_percentage;
        return acc;
      }, {})
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
    
    const stmt = db.prepare(`
      UPDATE investment_holdings 
      SET current_value = ?, name = COALESCE(?, name), platform = COALESCE(?, platform), updated_at = CURRENT_TIMESTAMP
      WHERE type = ?
    `);
    
    stmt.run(current_value, name, platform, type);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get contribution plan
router.get('/contribution-plan', (req, res) => {
  try {
    const holdings = db.prepare('SELECT * FROM investment_holdings').all();
    const targets = db.prepare('SELECT * FROM investment_targets').all();
    const config = db.prepare('SELECT * FROM investment_config LIMIT 1').get();
    
    const monthlyBudget = config?.monthly_budget || 5000000;
    const total = holdings.reduce((sum, h) => sum + h.current_value, 0);
    
    // Calculate target values and differences
    const targetMap = targets.reduce((acc, t) => {
      acc[t.type] = t.target_percentage / 100;
      return acc;
    }, {});
    
    const holdingsWithDiff = holdings.map(h => {
      const currentPct = total > 0 ? h.current_value / total : 0;
      const targetPct = targetMap[h.type] || 0;
      const difference = currentPct - targetPct;
      return {
        ...h,
        currentPercentage: currentPct * 100,
        targetPercentage: targetPct * 100,
        difference: difference * 100,
        targetValue: total * targetPct,
        shortfall: Math.max(0, (total * targetPct) - h.current_value)
      };
    });
    
    // Determine if in catch-up phase
    const isUnderweight = holdingsWithDiff.some(h => h.difference < -5);
    
    let contributions;
    
    if (isUnderweight && config?.catch_up_phase) {
      // Catch-up phase: Prioritize underweight assets
      const underweight = holdingsWithDiff.filter(h => h.difference < 0).sort((a, b) => a.difference - b.difference);
      const totalShortfall = underweight.reduce((sum, h) => sum + Math.abs(h.shortfall), 0);
      
      contributions = holdingsWithDiff.map(h => {
        if (h.difference >= 0) {
          return { ...h, suggestedContribution: 0, contributionPercentage: 0 };
        }
        
        // Weight contribution by how underweight each asset is
        const weight = Math.abs(h.shortfall) / totalShortfall;
        const contribution = monthlyBudget * weight;
        
        return {
          ...h,
          suggestedContribution: Math.round(contribution),
          contributionPercentage: weight * 100
        };
      });
    } else {
      // Maintenance phase: Use target allocations
      contributions = holdingsWithDiff.map(h => ({
        ...h,
        suggestedContribution: Math.round(monthlyBudget * (targetMap[h.type] || 0)),
        contributionPercentage: (targetMap[h.type] || 0) * 100
      }));
    }
    
    // Calculate months to reach target allocation
    const monthsToTarget = calculateMonthsToTarget(holdingsWithDiff, monthlyBudget, targetMap);
    
    res.json({
      monthlyBudget,
      isInCatchUpPhase: isUnderweight && config?.catch_up_phase,
      contributions,
      monthsToTarget
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update investment config
router.put('/config', (req, res) => {
  try {
    const { monthly_budget, catch_up_phase } = req.body;
    
    const existing = db.prepare('SELECT * FROM investment_config LIMIT 1').get();
    
    if (existing) {
      db.prepare(`
        UPDATE investment_config 
        SET monthly_budget = COALESCE(?, monthly_budget), 
            catch_up_phase = COALESCE(?, catch_up_phase),
            updated_at = CURRENT_TIMESTAMP
      `).run(monthly_budget, catch_up_phase !== undefined ? (catch_up_phase ? 1 : 0) : null);
    } else {
      db.prepare(`
        INSERT INTO investment_config (monthly_budget, catch_up_phase) VALUES (?, ?)
      `).run(monthly_budget || 5000000, catch_up_phase !== undefined ? (catch_up_phase ? 1 : 0) : 1);
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
    
    // Log the contribution
    db.prepare(`
      INSERT INTO investment_contributions (type, amount, date, notes) VALUES (?, ?, ?, ?)
    `).run(type, amount, date || new Date().toISOString().split('T')[0], notes);
    
    // Update the holding value
    db.prepare(`
      UPDATE investment_holdings 
      SET current_value = current_value + ?, updated_at = CURRENT_TIMESTAMP
      WHERE type = ?
    `).run(amount, type);
    
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
    
    db.prepare(`
      UPDATE investment_targets SET target_percentage = ? WHERE type = ?
    `).run(target_percentage, type);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper function to calculate months to reach target
function calculateMonthsToTarget(holdings, monthlyBudget, targetMap) {
  let months = 0;
  const maxMonths = 60; // Cap at 5 years
  
  // Simulate contributions
  let simHoldings = holdings.map(h => ({ ...h }));
  
  while (months < maxMonths) {
    const total = simHoldings.reduce((sum, h) => sum + h.current_value, 0);
    
    // Check if within 2% of target for all assets
    const allOnTarget = simHoldings.every(h => {
      const currentPct = h.current_value / total;
      const targetPct = targetMap[h.type] || 0;
      return Math.abs(currentPct - targetPct) <= 0.02;
    });
    
    if (allOnTarget) break;
    
    // Add monthly contribution proportionally to shortfall
    const totalShortfall = simHoldings.reduce((sum, h) => {
      const targetValue = total * (targetMap[h.type] || 0);
      return sum + Math.max(0, targetValue - h.current_value);
    }, 0);
    
    simHoldings = simHoldings.map(h => {
      const targetValue = total * (targetMap[h.type] || 0);
      const shortfall = Math.max(0, targetValue - h.current_value);
      const contribution = totalShortfall > 0 ? monthlyBudget * (shortfall / totalShortfall) : monthlyBudget * (targetMap[h.type] || 0);
      return { ...h, current_value: h.current_value + contribution };
    });
    
    months++;
  }
  
  return months >= maxMonths ? null : months;
}

export default router;
