import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Routes
import authRoutes from './src/routes/authRoutes.js';
import downloadRoutes from './src/routes/downloadRoutes.js';

// Middlewares
import { notFound, errorHandler } from './src/middlewares/errorMiddleware.js';
import { apiLimiter } from './src/middlewares/rateLimiter.js';
import logger from './src/utils/logger.js';

// Config
config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
// Update the CORS section in app.js
const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
};

app.use(cors(corsOptions));


// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { 
    stream: { write: message => logger.info(message.trim()) } 
  }));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// API routes with rate limiting
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/download', downloadRoutes);

// 404 handler
app.use(notFound);

// Error handler
app.use(errorHandler);

export default app;