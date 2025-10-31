/**
 * Enhanced Authentication Controller - Fixed National ID validation
 * Handles user authentication with proper national ID enforcement
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const {
  Client,
  PrivateKey,
  AccountCreateTransaction,
  Hbar
} = require('@hashgraph/sdk');
const logger = require('../utils/logger');

/**
 * Validation helper for national ID format (Rwanda)
 * Rwanda National IDs are 16 digits
 */
const validateNationalId = (nationalId) => {
  if (!nationalId) return false;
  
  // Remove spaces and check if it's 16 digits
  const cleaned = nationalId.replace(/\s/g, '');
  return /^\d{16}$/.test(cleaned);
};

/**
 * Validation helper for Rwanda phone numbers
 * Format: +250XXXXXXXXX or 07XXXXXXXX or 250XXXXXXXXX
 */
const validatePhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return false;
  
  const cleaned = phoneNumber.replace(/[\s-]/g, '');
  
  // Check for valid Rwanda phone number formats
  return /^(\+?250|0)?7[2-9]\d{7}$/.test(cleaned);
};

/**
 * Normalize phone number to international format
 */
const normalizePhoneNumber = (phoneNumber) => {
  let cleaned = phoneNumber.replace(/[\s-]/g, '');
  
  // Add +250 if missing
  if (cleaned.startsWith('07')) {
    cleaned = '+25' + cleaned;
  } else if (cleaned.startsWith('7')) {
    cleaned = '+250' + cleaned;
  } else if (cleaned.startsWith('250')) {
    cleaned = '+' + cleaned;
  } else if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  
  return cleaned;
};

/**
 * Register new user
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      nationalId,
      password
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phoneNumber || !nationalId || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required (firstName, lastName, email, phoneNumber, nationalId, password)'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate national ID format
    if (!validateNationalId(nationalId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid national ID format. National ID must be 16 digits (e.g., 1199780012345678)'
      });
    }

    // Validate phone number format
    if (!validatePhoneNumber(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Use format: +250XXXXXXXXX or 07XXXXXXXX'
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const cleanedNationalId = nationalId.replace(/\s/g, '');

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { phoneNumber: normalizedPhone },
        { nationalId: cleanedNationalId }
      ]
    });

    if (existingUser) {
      // Provide specific error message
      if (existingUser.email === email.toLowerCase()) {
        return res.status(400).json({
          success: false,
          message: 'An account with this email already exists'
        });
      } else if (existingUser.phoneNumber === normalizedPhone) {
        return res.status(400).json({
          success: false,
          message: 'An account with this phone number already exists'
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'An account with this national ID already exists'
        });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      phoneNumber: normalizedPhone,
      nationalId: cleanedNationalId,
      password: hashedPassword,
      role: 'investor'
    });

    await user.save();

    logger.info(`New user registered: ${user.email} (National ID: ${cleanedNationalId.substring(0, 4)}****)`);

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber
        },
        token
      }
    });

  } catch (error) {
    logger.error('Registration error:', error);
    
    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `An account with this ${field} already exists`
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

/**
 * Login user
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    logger.info(`User logged in: ${user.email}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          hederaAccountId: user.hederaAccountId,
          tokenAssociated: user.tokenAssociated,
          role: user.role,
          kycStatus: user.kycStatus
        },
        token
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * Get current user profile
 * GET /api/auth/profile
 */
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        nationalId: user.nationalId,
        hederaAccountId: user.hederaAccountId,
        hederaPublicKey: user.hederaPublicKey,
        tokenAssociated: user.tokenAssociated,
        isVerified: user.isVerified,
        kycStatus: user.kycStatus,
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });

  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message
    });
  }
};

/**
 * Create Hedera account for user
 * POST /api/auth/create-hedera-account
 */
exports.createHederaAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user already has Hedera account
    if (user.hederaAccountId) {
      return res.status(400).json({
        success: false,
        message: 'User already has a Hedera account'
      });
    }

    // Initialize Hedera client
    const network = process.env.HEDERA_NETWORK || 'testnet';
    const client = network === 'mainnet' 
      ? Client.forMainnet()
      : Client.forTestnet();

    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;
    client.setOperator(operatorId, operatorKey);

    logger.info(`Creating Hedera account for user: ${user.email}`);

    // Generate new key pair for user
    const newAccountPrivateKey = PrivateKey.generateED25519();
    const newAccountPublicKey = newAccountPrivateKey.publicKey;

    // Create new account
    const newAccount = await new AccountCreateTransaction()
      .setKey(newAccountPublicKey)
      .setInitialBalance(Hbar.fromTinybars(0))
      .execute(client);

    // Get the new account ID
    const getReceipt = await newAccount.getReceipt(client);
    const newAccountId = getReceipt.accountId;

    logger.info(`Hedera account created: ${newAccountId.toString()}`);

    // Update user with Hedera account info
    user.hederaAccountId = newAccountId.toString();
    user.hederaPrivateKey = newAccountPrivateKey.toString();
    user.hederaPublicKey = newAccountPublicKey.toString();
    await user.save();

    res.json({
      success: true,
      message: 'Hedera account created successfully',
      data: {
        accountId: newAccountId.toString(),
        publicKey: newAccountPublicKey.toString()
      }
    });

  } catch (error) {
    logger.error('Create Hedera account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create Hedera account',
      error: error.message
    });
  }
};

/**
 * Change password
 * POST /api/auth/change-password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current and new passwords are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    logger.info(`Password changed for user: ${user.email}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message
    });
  }
};