/**
 * Investment Controller - Handles all investment operations
 * 
 * Endpoints for:
 * - Buying tokens (investing)
 * - Redeeming tokens (liquidating)
 * - Viewing portfolio
 * - Checking interest accrued
 */

const { Investment, Transaction, User } = require('../models');
const hederaService = require('../services/hederaService');
const interestService = require('../services/interestService');
const logger = require('../utils/logger');

/**
 * Buy tokens (invest money)
 * POST /api/invest/buy
 */
exports.buyTokens = async (req, res) => {
  try {
    const { amountRWF, paymentMethod, paymentReference } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!amountRWF || amountRWF <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid investment amount'
      });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has Hedera account and token association
    if (!user.hederaAccountId) {
      return res.status(400).json({
        success: false,
        message: 'Please set up your Hedera account first'
      });
    }

    if (!user.tokenAssociated) {
      return res.status(400).json({
        success: false,
        message: 'Please associate the token with your account first'
      });
    }

    // TODO: Verify payment with payment gateway
    // For now, we assume payment is verified

    // Calculate token amount (1 RWF = 1 token, considering decimals)
    const decimals = parseInt(process.env.TOKEN_DECIMALS || 2);
    const tokenAmount = Math.floor(amountRWF * Math.pow(10, decimals));

    logger.info(`Processing investment: User ${userId}, Amount: ${amountRWF} RWF, Tokens: ${tokenAmount}`);

    // Create transaction record
    const transaction = new Transaction({
      userId: userId,
      type: 'deposit',
      amountRWF: amountRWF,
      tokenAmount: tokenAmount,
      paymentMethod: paymentMethod,
      paymentReference: paymentReference,
      status: 'pending',
      description: `Investment of ${amountRWF} RWF`
    });
    await transaction.save();

    try {
      // Mint tokens to treasury (requires multi-sig)
      const mintResult = await hederaService.mintTokens(tokenAmount);
      
      // Transfer tokens from treasury to user
      // const transferResult = await hederaService.transferTokensToInvestor(
      //   user.hederaAccountId,
      //   tokenAmount
      // );

      // USE MOCK TRANSFER FOR TESTING
  const transferResult = {
    success: true,
    transactionId: `mock-transfer-${Date.now()}`,
    amount: tokenAmount,
    recipient: user.hederaAccountId,
    status: 'SUCCESS'
  };
  
  logger.info('TESTING MODE: Using mock token transfer');
  logger.info(`Mock transfer: ${tokenAmount} tokens to ${user.hederaAccountId}`);

      // Get current interest rate
      const currentRates = interestService.getCurrentRates();

      // Create investment record
      const investment = new Investment({
        userId: userId,
        amountRWF: amountRWF,
        tokenAmount: tokenAmount,
        investmentDate: new Date(),
        interestRate: currentRates.annualRate,
        status: 'active',
        hederaTransactionId: transferResult.transactionId
      });
      await investment.save();

      // Update transaction
      transaction.investmentId = investment._id;
      transaction.hederaTransactionId = transferResult.transactionId;
      transaction.status = 'completed';
      transaction.completedDate = new Date();
      await transaction.save();

      logger.info(`Investment successful: ${investment._id}`);

      res.json({
        success: true,
        message: 'Investment successful',
        data: {
          investmentId: investment._id,
          amountRWF: amountRWF,
          tokenAmount: tokenAmount,
          transactionId: transferResult.transactionId,
          investmentDate: investment.investmentDate,
          interestRate: currentRates.annualRate
        }
      });

    } catch (error) {
      // Update transaction as failed
      transaction.status = 'failed';
      transaction.metadata = { error: error.message };
      await transaction.save();

      throw error;
    }

  } catch (error) {
    logger.error('Buy tokens error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process investment',
      error: error.message
    });
  }
};

/**
 * Redeem tokens (liquidate investment)
 * POST /api/invest/redeem
 */
exports.redeemTokens = async (req, res) => {
  try {
    const { investmentId, tokenAmount, withdrawalMethod } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!investmentId) {
      return res.status(400).json({
        success: false,
        message: 'Investment ID is required'
      });
    }

    // Get investment
    const investment = await Investment.findOne({
      _id: investmentId,
      userId: userId,
      status: 'active'
    });

    if (!investment) {
      return res.status(404).json({
        success: false,
        message: 'Investment not found or already redeemed'
      });
    }

    // Calculate current value with interest
    const interestCalc = interestService.calculateInterest(
      investment.amountRWF,
      investment.investmentDate
    );

    const totalValueRWF = interestCalc.totalValue;
    const tokensToRedeem = tokenAmount || investment.tokenAmount;

    // Get user with private key
    const user = await User.findById(userId).select('+hederaPrivateKey');
    if (!user || !user.hederaPrivateKey) {
      return res.status(400).json({
        success: false,
        message: 'User Hedera account not properly configured'
      });
    }

    logger.info(`Processing redemption: Investment ${investmentId}, Tokens: ${tokensToRedeem}`);

    // Create transaction record
    const transaction = new Transaction({
      userId: userId,
      investmentId: investment._id,
      type: 'withdrawal',
      amountRWF: totalValueRWF,
      tokenAmount: tokensToRedeem,
      paymentMethod: withdrawalMethod || 'mtn_momo',
      status: 'pending',
      description: `Redemption of investment ${investmentId}`
    });
    await transaction.save();

    try {
      // Transfer tokens from user back to treasury
      // const transferResult = await hederaService.transferTokensFromInvestor(
      //   user.hederaAccountId,
      //   user.hederaPrivateKey,
      //   tokensToRedeem
      // );

      // Mock transfer tokens back to treasury
const transferResult = {
  success: true,
  transactionId: `mock-redeem-${Date.now()}`,
  amount: tokensToRedeem,
  sender: user.hederaAccountId,
  recipient: 'treasury',
  status: 'SUCCESS'
};

      // Burn tokens (requires multi-sig)
      // const burnResult = await hederaService.burnTokens(tokensToRedeem);
// Mock burn tokens
const burnResult = {
  success: true,
  transactionId: `mock-burn-${Date.now()}`,
  amount: tokensToRedeem,
  status: 'SUCCESS'
};
  
      // Update investment status
      investment.status = 'redeemed';
      investment.redemptionDate = new Date();
      investment.redemptionAmount = totalValueRWF;
      investment.redemptionTransactionId = transferResult.transactionId;
      investment.interestAccrued = interestCalc.interest;
      await investment.save();

      // Update transaction
      transaction.hederaTransactionId = transferResult.transactionId;
      transaction.status = 'completed';
      transaction.completedDate = new Date();
      await transaction.save();

      // TODO: Process payment to user via mobile money/bank

      logger.info(`Redemption successful: ${investment._id}`);

      res.json({
        success: true,
        message: 'Redemption successful',
        data: {
          investmentId: investment._id,
          principal: investment.amountRWF,
          interestEarned: interestCalc.interest,
          totalAmount: totalValueRWF,
          tokensRedeemed: tokensToRedeem,
          transactionId: transferResult.transactionId,
          redemptionDate: investment.redemptionDate
        }
      });

    } catch (error) {
      // Update transaction as failed
      transaction.status = 'failed';
      transaction.metadata = { error: error.message };
      await transaction.save();

      throw error;
    }

  } catch (error) {
    logger.error('Redeem tokens error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process redemption',
      error: error.message
    });
  }
};

/**
 * Associate token with user's Hedera account
 * POST /api/invest/associate-token
 */
exports.associateToken = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has Hedera account
    if (!user.hederaAccountId) {
      return res.status(400).json({
        success: false,
        message: 'Please create your Hedera account first'
      });
    }

    // Check if already associated
    if (user.tokenAssociated) {
      return res.status(400).json({
        success: false,
        message: 'Token is already associated with your account'
      });
    }

    // Update user record (marks as associated for testing)
    user.tokenAssociated = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Token associated successfully! You can now invest.',
      data: {
        email: user.email,
        hederaAccountId: user.hederaAccountId,
        tokenAssociated: true
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Token association failed'
    });
  }
};

/**
 * Get user portfolio
 * GET /api/invest/portfolio
 */
exports.getPortfolio = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all active investments
    const investments = await Investment.find({
      userId: userId,
      status: 'active'
    }).sort({ investmentDate: -1 });

    // Calculate interest for each investment
    const investmentsWithInterest = investments.map(inv => {
      const interestCalc = interestService.calculateInterest(
        inv.amountRWF,
        inv.investmentDate
      );

      return {
        id: inv._id,
        amount: inv.amountRWF,
        tokenAmount: inv.tokenAmount,
        investmentDate: inv.investmentDate,
        daysInvested: interestCalc.days,
        interestEarned: interestCalc.interest,
        currentValue: interestCalc.totalValue,
        interestRate: inv.interestRate,
        transactionId: inv.hederaTransactionId
      };
    });

    // Calculate portfolio totals
    const portfolio = interestService.calculatePortfolioInterest(
      investments.map(inv => ({
        id: inv._id,
        amount: inv.amountRWF,
        startDate: inv.investmentDate
      }))
    );

    // Get user's Hedera balance
    const user = await User.findById(userId);
    let hederaBalance = null;
    if (user.hederaAccountId) {
      try {
        hederaBalance = await hederaService.getAccountBalance(user.hederaAccountId);
      } catch (error) {
        logger.warn(`Could not fetch Hedera balance: ${error.message}`);
      }
    }

    res.json({
      success: true,
      data: {
        summary: {
          totalInvested: portfolio.totalPrincipal,
          totalInterest: portfolio.totalInterest,
          totalValue: portfolio.totalValue,
          numberOfInvestments: portfolio.numberOfInvestments,
          currentRate: portfolio.annualRate
        },
        investments: investmentsWithInterest,
        hederaBalance: hederaBalance,
        dailyInterest: interestService.calculateDailyInterest(portfolio.totalPrincipal)
      }
    });

  } catch (error) {
    logger.error('Get portfolio error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch portfolio',
      error: error.message
    });
  }
};

/**
 * Get interest calculation for an amount
 * GET /api/invest/calculate-interest
 */
exports.calculateInterest = async (req, res) => {
  try {
    const { amount, days } = req.query;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    let result;
    if (days) {
      // Calculate for specific period
      result = interestService.calculateInterestForPeriod(
        parseFloat(amount),
        parseInt(days)
      );
    } else {
      // Calculate daily, monthly, yearly projections
      result = interestService.calculateDailyInterest(parseFloat(amount));
      
      // Add different time period projections
      result.projections = {
        oneWeek: interestService.calculateInterestForPeriod(parseFloat(amount), 7),
        oneMonth: interestService.calculateInterestForPeriod(parseFloat(amount), 30),
        threeMonths: interestService.calculateInterestForPeriod(parseFloat(amount), 90),
        sixMonths: interestService.calculateInterestForPeriod(parseFloat(amount), 180),
        oneYear: interestService.calculateInterestForPeriod(parseFloat(amount), 365)
      };
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('Calculate interest error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate interest',
      error: error.message
    });
  }
};

/**
 * Get transaction history
 * GET /api/invest/transactions
 */
exports.getTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, page = 1, type } = req.query;

    const query = { userId };
    if (type) {
      query.type = type;
    }

    const transactions = await Transaction.find(query)
      .sort({ transactionDate: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('investmentId', 'amountRWF investmentDate');

    const total = await Transaction.countDocuments(query);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    logger.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
};

/**
 * Get current interest rates
 * GET /api/invest/rates
 */
exports.getRates = async (req, res) => {
  try {
    const rates = interestService.getCurrentRates();
    const apy = interestService.calculateAPY();

    res.json({
      success: true,
      data: {
        ...rates,
        apy: apy.apy
      }
    });

  } catch (error) {
    logger.error('Get rates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rates',
      error: error.message
    });
  }
};
