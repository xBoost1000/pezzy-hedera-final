/**
 * Manager Controller - Handles manager-specific operations
 * 
 * Includes multi-signature workflows for:
 * - Token creation
 * - Token minting/burning
 * - Interest rate changes
 */

const { Token, MultiSigRequest, User } = require('../models');
const hederaService = require('../services/hederaService');
const interestService = require('../services/interestService');
const logger = require('../utils/logger');

/**
 * Initiate token creation (Manager 1)
 * POST /api/manager/initiate-token-creation
 */
exports.initiateTokenCreation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { tokenName, tokenSymbol, decimals, initialSupply } = req.body;

    // Check if user is a manager
    const user = await User.findById(userId);
    if (!user || user.role !== 'manager') {
      return res.status(403).json({
        success: false,
        message: 'Only managers can initiate token creation'
      });
    }

    // Check if token already exists
    const existingToken = await Token.findOne({});
    if (existingToken) {
      return res.status(400).json({
        success: false,
        message: 'Token already exists'
      });
    }

    // Create multi-sig request
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

    const multiSigRequest = new MultiSigRequest({
      requestType: 'token_creation',
      description: 'Create Pezzy Money Market Token',
      requestData: {
        tokenName: tokenName || process.env.TOKEN_NAME,
        tokenSymbol: tokenSymbol || process.env.TOKEN_SYMBOL,
        decimals: decimals || parseInt(process.env.TOKEN_DECIMALS),
        initialSupply: initialSupply || 0
      },
      requiredSignatures: 2,
      signatures: [{
        managerId: userId,
        managerAccountId: user.hederaAccountId,
        signedAt: new Date()
      }],
      status: 'pending',
      createdBy: userId,
      expiresAt: expiresAt
    });

    await multiSigRequest.save();

    logger.info(`Token creation initiated by manager: ${user.email}`);

    res.json({
      success: true,
      message: 'Token creation initiated. Awaiting second manager approval.',
      data: {
        requestId: multiSigRequest._id,
        requestType: multiSigRequest.requestType,
        status: multiSigRequest.status,
        signaturesCollected: 1,
        signaturesRequired: 2,
        expiresAt: multiSigRequest.expiresAt
      }
    });

  } catch (error) {
    logger.error('Initiate token creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate token creation',
      error: error.message
    });
  }
};

/**
 * Approve and execute token creation (Manager 2)
 * POST /api/manager/approve-token-creation
 */
exports.approveTokenCreation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { requestId } = req.body;

    // Check if user is a manager
    const user = await User.findById(userId);
    if (!user || user.role !== 'manager') {
      return res.status(403).json({
        success: false,
        message: 'Only managers can approve token creation'
      });
    }

    // Get multi-sig request
    const multiSigRequest = await MultiSigRequest.findById(requestId);
    if (!multiSigRequest) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check if request is still pending
    if (multiSigRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Request is already ${multiSigRequest.status}`
      });
    }

    // Check if request has expired
    if (new Date() > multiSigRequest.expiresAt) {
      multiSigRequest.status = 'rejected';
      await multiSigRequest.save();
      return res.status(400).json({
        success: false,
        message: 'Request has expired'
      });
    }

    // Check if this manager already signed
    const alreadySigned = multiSigRequest.signatures.some(
      sig => sig.managerId.toString() === userId
    );

    if (alreadySigned) {
      return res.status(400).json({
        success: false,
        message: 'You have already signed this request'
      });
    }

    // Add second signature
    multiSigRequest.signatures.push({
      managerId: userId,
      managerAccountId: user.hederaAccountId,
      signedAt: new Date()
    });

    multiSigRequest.status = 'approved';
    await multiSigRequest.save();

    logger.info(`Token creation approved by second manager: ${user.email}`);

    // Execute token creation on Hedera
    try {
      const tokenResult = await hederaService.createTokenWithMultiSig(
        multiSigRequest.requestData
      );

      // Save token information
      const token = new Token({
        tokenId: tokenResult.tokenId,
        name: tokenResult.name,
        symbol: tokenResult.symbol,
        decimals: tokenResult.decimals,
        totalSupply: tokenResult.initialSupply.toString(),
        treasuryAccountId: tokenResult.treasuryAccount,
        manager1AccountId: tokenResult.managers[0],
        manager2AccountId: tokenResult.managers[1],
        creationTransactionId: tokenResult.transactionId,
        isActive: true
      });

      await token.save();

      // Update multi-sig request
      multiSigRequest.status = 'executed';
      multiSigRequest.executedAt = new Date();
      multiSigRequest.executionTransactionId = tokenResult.transactionId;
      await multiSigRequest.save();

      // Set token ID in Hedera service
      hederaService.setTokenId(tokenResult.tokenId);

      logger.info(`Token created successfully: ${tokenResult.tokenId}`);

      res.json({
        success: true,
        message: 'Token creation approved and executed successfully',
        data: {
          tokenId: tokenResult.tokenId,
          tokenName: tokenResult.name,
          tokenSymbol: tokenResult.symbol,
          transactionId: tokenResult.transactionId,
          treasuryAccount: tokenResult.treasuryAccount
        }
      });

    } catch (error) {
      multiSigRequest.status = 'rejected';
      multiSigRequest.metadata = { error: error.message };
      await multiSigRequest.save();
      throw error;
    }

  } catch (error) {
    logger.error('Approve token creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve token creation',
      error: error.message
    });
  }
};

/**
 * Get pending multi-sig requests
 * GET /api/manager/pending-requests
 */
exports.getPendingRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if user is a manager
    const user = await User.findById(userId);
    if (!user || user.role !== 'manager') {
      return res.status(403).json({
        success: false,
        message: 'Only managers can view pending requests'
      });
    }

    // Get pending requests that this manager hasn't signed yet
    const pendingRequests = await MultiSigRequest.find({
      status: 'pending',
      expiresAt: { $gt: new Date() },
      'signatures.managerId': { $ne: userId }
    })
    .populate('createdBy', 'firstName lastName email')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: pendingRequests
    });

  } catch (error) {
    logger.error('Get pending requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending requests',
      error: error.message
    });
  }
};

/**
 * Get all multi-sig requests (history)
 * GET /api/manager/requests
 */
exports.getAllRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, limit = 50, page = 1 } = req.query;

    // Check if user is a manager
    const user = await User.findById(userId);
    if (!user || user.role !== 'manager') {
      return res.status(403).json({
        success: false,
        message: 'Only managers can view requests'
      });
    }

    const query = {};
    if (status) {
      query.status = status;
    }

    const requests = await MultiSigRequest.find(query)
      .populate('createdBy', 'firstName lastName email')
      .populate('signatures.managerId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await MultiSigRequest.countDocuments(query);

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    logger.error('Get all requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch requests',
      error: error.message
    });
  }
};

/**
 * Get token information
 * GET /api/manager/token-info
 */
exports.getTokenInfo = async (req, res) => {
  try {
    // Get token from database
    const token = await Token.findOne({ isActive: true });
    
    if (!token) {
      return res.status(404).json({
        success: false,
        message: 'Token not found. Please create token first.'
      });
    }

    // Get real-time info from Hedera
    try {
      hederaService.setTokenId(token.tokenId);
      const hederaInfo = await hederaService.getTokenInfo();

      res.json({
        success: true,
        data: {
          ...hederaInfo,
          createdAt: token.createdAt,
          creationTransactionId: token.creationTransactionId,
          manager1: token.manager1AccountId,
          manager2: token.manager2AccountId
        }
      });
    } catch (error) {
      // If Hedera query fails, return database info
      res.json({
        success: true,
        data: {
          tokenId: token.tokenId,
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals,
          totalSupply: token.totalSupply,
          treasury: token.treasuryAccountId,
          createdAt: token.createdAt,
          creationTransactionId: token.creationTransactionId,
          manager1: token.manager1AccountId,
          manager2: token.manager2AccountId,
          note: 'Real-time data unavailable, showing cached information'
        }
      });
    }

  } catch (error) {
    logger.error('Get token info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch token info',
      error: error.message
    });
  }
};

/**
 * Update interest rate (requires multi-sig)
 * POST /api/manager/update-interest-rate
 */
exports.updateInterestRate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { newRate } = req.body;

    // Check if user is a manager
    const user = await User.findById(userId);
    if (!user || user.role !== 'manager') {
      return res.status(403).json({
        success: false,
        message: 'Only managers can update interest rate'
      });
    }

    // Validate rate
    if (!newRate || newRate < 0 || newRate > 100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid interest rate. Must be between 0 and 100.'
      });
    }

    // Create multi-sig request
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const multiSigRequest = new MultiSigRequest({
      requestType: 'rate_change',
      description: `Change interest rate to ${newRate}%`,
      requestData: {
        newRate: newRate,
        previousRate: parseFloat(process.env.FUND_ANNUAL_INTEREST_RATE || 8.5)
      },
      requiredSignatures: 2,
      signatures: [{
        managerId: userId,
        managerAccountId: user.hederaAccountId,
        signedAt: new Date()
      }],
      status: 'pending',
      createdBy: userId,
      expiresAt: expiresAt
    });

    await multiSigRequest.save();

    logger.info(`Interest rate change initiated: ${newRate}%`);

    res.json({
      success: true,
      message: 'Interest rate change initiated. Awaiting second manager approval.',
      data: {
        requestId: multiSigRequest._id,
        newRate: newRate,
        status: 'pending'
      }
    });

  } catch (error) {
    logger.error('Update interest rate error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update interest rate',
      error: error.message
    });
  }
};
