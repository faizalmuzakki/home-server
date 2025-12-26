import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const DASHBOARD_PIN = process.env.DASHBOARD_PIN || '123456';
const ALLOWED_EMAIL = process.env.DASHBOARD_EMAIL || '';

// Verify email first
router.post('/verify-email', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    if (email.toLowerCase() === ALLOWED_EMAIL.toLowerCase()) {
        res.json({ success: true, message: 'Email verified, enter PIN' });
    } else {
        res.status(401).json({ success: false, error: 'Unauthorized email' });
    }
});

// Verify PIN (after email verified)
router.post('/verify-pin', (req, res) => {
    const { email, pin } = req.body;

    if (!email || !pin) {
        return res.status(400).json({ error: 'Email and PIN are required' });
    }

    // Double-check email
    if (email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (pin === DASHBOARD_PIN) {
        res.json({ success: true, message: 'Authenticated' });
    } else {
        res.status(401).json({ success: false, error: 'Invalid PIN' });
    }
});

export default router;
