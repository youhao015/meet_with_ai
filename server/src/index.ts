import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import summarizeRoutes from './routes/summarize.js';
import transcribeRoutes from './routes/transcribe.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(cors({
  origin: [CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));

// Route Mounts
app.use('/auth', authRoutes);
app.use('/api/summarize', summarizeRoutes);
app.use('/api/transcribe', transcribeRoutes);

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'MeetWithAI Backend'
  });
});

app.listen(PORT, () => {
  console.log(`[MeetWithAI Backend] Listening on http://localhost:${PORT}`);
});
