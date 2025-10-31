/**
 * API Routes Configuration
 */

const express = require('express');
const router = express.Router();

// Controllers
const authController = require('../controllers/authController');
const investmentController = require('../controllers/investmentController');
const managerController = require('../controllers/managerController');

// Middleware
const { authenticate, isManager } = require('../middleware/auth');

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Pezzy API is running',
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// Authentication Routes
// ============================================================
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/profile', authenticate, authController.getProfile);
router.post('/auth/create-hedera-account', authenticate, authController.createHederaAccount);
router.post('/auth/change-password', authenticate, authController.changePassword);

// ============================================================
// Investment Routes (Protected)
// ============================================================
router.post('/invest/buy', authenticate, investmentController.buyTokens);
router.post('/invest/redeem', authenticate, investmentController.redeemTokens);
router.get('/invest/portfolio', authenticate, investmentController.getPortfolio);
router.get('/invest/transactions', authenticate, investmentController.getTransactions);
router.get('/invest/calculate-interest', investmentController.calculateInterest);
router.get('/invest/rates', investmentController.getRates);
router.post('/invest/associate-token', authenticate, investmentController.associateToken);

// ============================================================
// Manager Routes (Protected - Manager Only)
// ============================================================
router.post('/manager/initiate-token-creation', authenticate, isManager, managerController.initiateTokenCreation);
router.post('/manager/approve-token-creation', authenticate, isManager, managerController.approveTokenCreation);
router.get('/manager/pending-requests', authenticate, isManager, managerController.getPendingRequests);
router.get('/manager/requests', authenticate, isManager, managerController.getAllRequests);
router.get('/manager/token-info', authenticate, isManager, managerController.getTokenInfo);
router.post('/manager/update-interest-rate', authenticate, isManager, managerController.updateInterestRate);

module.exports = router;
