import express from 'express';
import dotenv from 'dotenv';
import { issueToken, safeEqual } from '../middleware/auth.js';

dotenv.config();

const router = express.Router();

const DASHBOARD_PIN = process.env.DASHBOARD_PIN || '';
const ALLOWED_EMAIL = process.env.DASHBOARD_EMAIL || '';

const emailMatches = (email) => String(email).toLowerCase() === ALLOWED_EMAIL.toLowerCase();

// Verify email first
router.post('/verify-email', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    if (!ALLOWED_EMAIL || !DASHBOARD_PIN) {
        console.error('❌ DASHBOARD_EMAIL / DASHBOARD_PIN env var not set!');
        return res.status(500).json({ error: 'Auth not configured' });
    }

    if (emailMatches(email)) {
        res.json({ success: true, message: 'Email verified, enter PIN' });
    } else {
        res.status(401).json({ success: false, error: 'Unauthorized email' });
    }
});

// Verify PIN (after email verified) and hand out the API token
router.post('/verify-pin', (req, res) => {
    const { email, pin } = req.body;

    if (!email || !pin) {
        return res.status(400).json({ error: 'Email and PIN are required' });
    }

    if (!ALLOWED_EMAIL || !DASHBOARD_PIN || !process.env.API_AUTH_SECRET) {
        return res.status(500).json({ error: 'Auth not configured' });
    }

    if (!emailMatches(email) || !safeEqual(pin, DASHBOARD_PIN)) {
        return res.status(401).json({ success: false, error: 'Invalid email or PIN' });
    }

    res.json({ success: true, message: 'Authenticated', token: issueToken() });
});

export default router;
