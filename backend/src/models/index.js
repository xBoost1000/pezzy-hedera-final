/**
 * Database Models - MongoDB schemas for Pezzy platform
 */

const mongoose = require('mongoose');

/**
 * User Schema
 * Stores investor information and Hedera account details
 */
const userSchema = new mongoose.Schema({
  // Personal Information
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  nationalId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  
  // Authentication
  password: {
    type: String,
    required: true
  },
  
  // Hedera Account Information
  hederaAccountId: {
    type: String,
    unique: true,
    sparse: true
  },
  hederaPrivateKey: {
    type: String,
    select: false // Don't return by default for security
  },
  hederaPublicKey: {
    type: String
  },
  tokenAssociated: {
    type: Boolean,
    default: false
  },
  
  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  kycStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  
  // Role
  role: {
    type: String,
    enum: ['investor', 'manager', 'admin'],
    default: 'investor'
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true
});

/**
 * Investment Schema
 * Tracks individual investments by users
 */
const investmentSchema = new mongoose.Schema({
  // User Reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Investment Details
  amountRWF: {
    type: Number,
    required: true,
    min: 0
  },
  tokenAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Dates
  investmentDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  lastInterestCalculation: {
    type: Date,
    default: Date.now
  },
  
  // Interest Tracking
  interestAccrued: {
    type: Number,
    default: 0
  },
  interestRate: {
    type: Number,
    required: true // Store rate at time of investment
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'redeemed', 'pending'],
    default: 'active'
  },
  
  // Hedera Transaction Reference
  hederaTransactionId: {
    type: String,
    required: true
  },
  
  // Redemption Details (if redeemed)
  redemptionDate: {
    type: Date
  },
  redemptionAmount: {
    type: Number
  },
  redemptionTransactionId: {
    type: String
  }
}, {
  timestamps: true
});

/**
 * Transaction Schema
 * Records all transactions (deposits, withdrawals, interest payments)
 */
const transactionSchema = new mongoose.Schema({
  // User Reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Investment Reference (if applicable)
  investmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Investment'
  },
  
  // Transaction Details
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'interest_payment', 'fee'],
    required: true
  },
  amountRWF: {
    type: Number,
    required: true
  },
  tokenAmount: {
    type: Number
  },
  
  // Payment Method
  paymentMethod: {
    type: String,
    enum: ['mtn_momo', 'airtel_money', 'bank_transfer'],
    required: true
  },
  paymentReference: {
    type: String
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  
  // Hedera Transaction
  hederaTransactionId: {
    type: String
  },
  
  // Additional Info
  description: {
    type: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Timestamps
  transactionDate: {
    type: Date,
    default: Date.now
  },
  completedDate: {
    type: Date
  }
}, {
  timestamps: true
});

/**
 * Token Schema
 * Stores token configuration and metadata
 */
const tokenSchema = new mongoose.Schema({
  // Token Details
  tokenId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  decimals: {
    type: Number,
    required: true
  },
  
  // Supply Information
  totalSupply: {
    type: String,
    default: '0'
  },
  
  // Treasury
  treasuryAccountId: {
    type: String,
    required: true
  },
  
  // Manager Accounts
  manager1AccountId: {
    type: String,
    required: true
  },
  manager2AccountId: {
    type: String,
    required: true
  },
  
  // Creation Details
  creationTransactionId: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

/**
 * Multi-Sig Request Schema
 * Tracks multi-signature operations that need approval
 */
const multiSigRequestSchema = new mongoose.Schema({
  // Request Type
  requestType: {
    type: String,
    enum: ['token_creation', 'token_mint', 'token_burn', 'interest_distribution', 'rate_change'],
    required: true
  },
  
  // Request Details
  description: {
    type: String,
    required: true
  },
  requestData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Signatures
  requiredSignatures: {
    type: Number,
    default: 2
  },
  signatures: [{
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    managerAccountId: {
      type: String
    },
    signedAt: {
      type: Date,
      default: Date.now
    },
    signature: {
      type: String
    }
  }],
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'executed'],
    default: 'pending'
  },
  
  // Execution Details
  executedAt: {
    type: Date
  },
  executionTransactionId: {
    type: String
  },
  
  // Created By
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Expiry
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

// Create indexes for better query performance
userSchema.index({ email: 1 });
userSchema.index({ hederaAccountId: 1 });
investmentSchema.index({ userId: 1, status: 1 });
investmentSchema.index({ investmentDate: 1 });
transactionSchema.index({ userId: 1, transactionDate: -1 });
transactionSchema.index({ status: 1 });
multiSigRequestSchema.index({ status: 1, expiresAt: 1 });

// Create models
const User = mongoose.model('User', userSchema);
const Investment = mongoose.model('Investment', investmentSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Token = mongoose.model('Token', tokenSchema);
const MultiSigRequest = mongoose.model('MultiSigRequest', multiSigRequestSchema);

module.exports = {
  User,
  Investment,
  Transaction,
  Token,
  MultiSigRequest
};
