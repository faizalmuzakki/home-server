import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './db/init.js';
import expenseRoutes from './routes/expenses.js';
import categoryRoutes from './routes/categories.js';
import parseRoutes from './routes/parse.js';
import statsRoutes from './routes/stats.js';
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import investmentRoutes from './routes/investments.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, '../data/uploads')));

// Initialize database
initDatabase();

// Routes
app.use('/api/expenses', expenseRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/parse', parseRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/investments', investmentRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Expense Tracker API running on port ${PORT}`);
});

export default app;
