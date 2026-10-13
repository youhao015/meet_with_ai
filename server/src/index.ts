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
const CLIENT_URL = process.env.CLIENT_URL || '';

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(cors({
  origin: CLIENT_URL ? [CLIENT_URL] : true,
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
  console.log(`[MeetWithAI Backend] Listening on port ${PORT}`);
});
