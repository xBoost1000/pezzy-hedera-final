/**
 * Pezzy Backend Server
 * Express.js server with MongoDB and Hedera integration
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const routes = require('./routes');
const logger = require('./utils/logger');
const hederaService = require('./services/hederaService');

// Create Express app
const app = express();

// ============================================================
// Middleware
// ============================================================

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4200',
  credentials: true
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// ============================================================
// Routes
// ============================================================
app.use('/api', routes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Pezzy Money Market Fund API',
    version: '1.0.0',
    description: 'Backend API for tokenized money market fund on Hedera',
    documentation: '/api/health'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================================
// Database Connection
// ============================================================
async function connectDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI ;
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
    });
    
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

// ============================================================
// Hedera Initialization
// ============================================================
async function initializeHedera() {
  try {
    await hederaService.initialize();
    logger.info('Hedera service initialized successfully');
    
    // Check if token already exists and set it
    const { Token } = require('./models');
    const existingToken = await Token.findOne({ isActive: true });
    
    if (existingToken) {
      hederaService.setTokenId(existingToken.tokenId);
      logger.info(`Using existing token: ${existingToken.tokenId}`);
    } else {
      logger.info('No token found. Managers need to create token.');
    }
  } catch (error) {
    logger.error('Hedera initialization error:', error);
    logger.warn('Server will start but Hedera operations may fail');
  }
}

// ============================================================
// Server Startup
// ============================================================
async function startServer() {
  const PORT = process.env.PORT || 3000;

  try {
    // Connect to database
    await connectDatabase();
    
    // Initialize Hedera
    await initializeHedera();
    
    // Start server
    app.listen(PORT, () => {
      logger.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   Pezzy Money Market Fund - Backend Server               ║
║                                                           ║
║   Status: Running                                         ║
║   Port: ${PORT}                                           ║
║   Environment: ${process.env.NODE_ENV || 'development'}   ║
║   Network: ${process.env.HEDERA_NETWORK || 'testnet'}     ║
║                                                           ║
║   API: http://localhost:${PORT}/api                       ║
║   Health Check: http://localhost:${PORT}/api/health       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
      `);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  
  // Close database connection
  await mongoose.connection.close();
  logger.info('Database connection closed');
  
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;
