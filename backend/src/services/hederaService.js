/**
 * Hedera Service - Manages all Hedera Hashgraph operations
 * 
 * This service handles:
 * - Token creation with multi-signature authorization
 * - Token minting and burning
 * - Interest distribution
 * - Account management
 * - Transaction queries
 */

const {
  Client,
  PrivateKey,
  AccountId,
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenBurnTransaction,
  TransferTransaction,
  TokenAssociateTransaction,
  TokenType,
  TokenSupplyType,
  AccountBalanceQuery,
  TokenInfoQuery,
  Hbar,
  KeyList,
  TransactionId,
  Status
} = require('@hashgraph/sdk');
const logger = require('../utils/logger');

class HederaService {
  constructor() {
    this.client = null;
    this.tokenId = null;
    this.treasuryId = null;
    this.manager1Key = null;
    this.manager2Key = null;
    this.manager1Id = null;
    this.manager2Id = null;
    this.initialized = false;
  }

  /**
   * Initialize Hedera client and load configuration
   */
  async initialize() {
    try {
      // Initialize client based on network
      const network = process.env.HEDERA_NETWORK || 'testnet';
      
      if (network === 'mainnet') {
        this.client = Client.forMainnet();
      } else {
        this.client = Client.forTestnet();
      }

      // Set operator account (Pezzy's main operational account)
      const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
      const operatorKey = PrivateKey.fromString(process.env.HEDERA_OPERATOR_KEY);
      this.client.setOperator(operatorId, operatorKey);

      // Load manager keys for multi-signature operations
      this.manager1Id = AccountId.fromString(process.env.MANAGER1_ACCOUNT_ID);
      this.manager1Key = PrivateKey.fromString(process.env.MANAGER1_PRIVATE_KEY);
      
      this.manager2Id = AccountId.fromString(process.env.MANAGER2_ACCOUNT_ID);
      this.manager2Key = PrivateKey.fromString(process.env.MANAGER2_PRIVATE_KEY);

      // Treasury account is the operator account
      this.treasuryId = operatorId;

      this.initialized = true;
      logger.info('Hedera service initialized successfully');
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to initialize Hedera service:', error);
      throw new Error(`Hedera initialization failed: ${error.message}`);
    }
  }

  /**
   * Create token with multi-signature requirement
   * Requires signatures from both Manager 1 and Manager 2
   * 
   * @param {Object} tokenConfig - Token configuration
   * @returns {Object} - Token creation result with token ID
   */
  async createTokenWithMultiSig(tokenConfig = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      logger.info('Starting multi-signature token creation process');

      // Create a 2-of-2 multi-signature key list for treasury operations
      const multiSigKey = new KeyList([
        this.manager1Key.publicKey,
        this.manager2Key.publicKey
      ], 2); // Requires 2 signatures

      // Configure token properties
      const tokenName = tokenConfig.name || process.env.TOKEN_NAME || 'Pezzy Money Market Token';
      const tokenSymbol = tokenConfig.symbol || process.env.TOKEN_SYMBOL || 'PMKT';
      const decimals = parseInt(tokenConfig.decimals || process.env.TOKEN_DECIMALS || 2);
      const initialSupply = parseInt(tokenConfig.initialSupply || process.env.INITIAL_SUPPLY || 0);

      logger.info(`Creating token: ${tokenName} (${tokenSymbol})`);

      // Create the token creation transaction
      const tokenCreateTx = new TokenCreateTransaction()
        .setTokenName(tokenName)
        .setTokenSymbol(tokenSymbol)
        .setDecimals(decimals)
        .setInitialSupply(initialSupply)
        .setTreasuryAccountId(this.treasuryId)
        .setTokenType(TokenType.FungibleCommon)
        .setSupplyType(TokenSupplyType.Infinite) // Allow dynamic minting based on investments
        .setAdminKey(multiSigKey) // Multi-sig required for admin operations
        .setSupplyKey(multiSigKey) // Multi-sig required for minting/burning
        .setFreezeKey(multiSigKey) // Multi-sig required for freezing accounts
        .setWipeKey(multiSigKey) // Multi-sig required for wiping tokens
        .setMaxTransactionFee(new Hbar(30))
        .freezeWith(this.client);

      logger.info('Token transaction created, awaiting Manager 1 signature...');

      // Sign with Manager 1
      const signedByManager1 = await tokenCreateTx.sign(this.manager1Key);
      logger.info('Manager 1 signature obtained');

      // Sign with Manager 2
      const signedByManager2 = await signedByManager1.sign(this.manager2Key);
      logger.info('Manager 2 signature obtained');

      logger.info('Both signatures collected, submitting transaction to Hedera...');

      // Submit the transaction
      const txResponse = await signedByManager2.execute(this.client);

      // Get the receipt
      const receipt = await txResponse.getReceipt(this.client);

      // Get the token ID
      const tokenId = receipt.tokenId;
      this.tokenId = tokenId;

      logger.info(`Token created successfully! Token ID: ${tokenId.toString()}`);

      return {
        success: true,
        tokenId: tokenId.toString(),
        transactionId: txResponse.transactionId.toString(),
        name: tokenName,
        symbol: tokenSymbol,
        decimals: decimals,
        initialSupply: initialSupply,
        treasuryAccount: this.treasuryId.toString(),
        requiresMultiSig: true,
        managers: [
          this.manager1Id.toString(),
          this.manager2Id.toString()
        ]
      };

    } catch (error) {
      logger.error('Token creation failed:', error);
      throw new Error(`Failed to create token: ${error.message}`);
    }
  }

  /**
   * Mint new tokens (requires multi-sig)
   * Called when investors deposit RWF
   * 
   * @param {number} amount - Amount to mint (in smallest units based on decimals)
   * @returns {Object} - Minting result
   */
  async mintTokens(amount) {
    if (!this.tokenId) {
      throw new Error('Token ID not set. Create token first.');
    }

    try {
      logger.info(`Minting ${amount} tokens...`);

      const mintTx = new TokenMintTransaction()
        .setTokenId(this.tokenId)
        .setAmount(amount)
        .setMaxTransactionFee(new Hbar(20))
        .freezeWith(this.client);

      // Sign with both managers (multi-sig requirement)
      const signedByManager1 = await mintTx.sign(this.manager1Key);
      const signedByManager2 = await signedByManager1.sign(this.manager2Key);

      const txResponse = await signedByManager2.execute(this.client);
      const receipt = await txResponse.getReceipt(this.client);

      logger.info(`Minted ${amount} tokens successfully`);

      return {
        success: true,
        amount: amount,
        transactionId: txResponse.transactionId.toString(),
        status: receipt.status.toString()
      };

    } catch (error) {
      logger.error('Token minting failed:', error);
      throw new Error(`Failed to mint tokens: ${error.message}`);
    }
  }

  /**
   * Burn tokens (requires multi-sig)
   * Called when investors redeem their investment
   * 
   * @param {number} amount - Amount to burn
   * @returns {Object} - Burning result
   */
  async burnTokens(amount) {
    if (!this.tokenId) {
      throw new Error('Token ID not set. Create token first.');
    }

    try {
      logger.info(`Burning ${amount} tokens...`);

      const burnTx = new TokenBurnTransaction()
        .setTokenId(this.tokenId)
        .setAmount(amount)
        .setMaxTransactionFee(new Hbar(20))
        .freezeWith(this.client);

      // Sign with both managers (multi-sig requirement)
      const signedByManager1 = await burnTx.sign(this.manager1Key);
      const signedByManager2 = await signedByManager1.sign(this.manager2Key);

      const txResponse = await signedByManager2.execute(this.client);
      const receipt = await txResponse.getReceipt(this.client);

      logger.info(`Burned ${amount} tokens successfully`);

      return {
        success: true,
        amount: amount,
        transactionId: txResponse.transactionId.toString(),
        status: receipt.status.toString()
      };

    } catch (error) {
      logger.error('Token burning failed:', error);
      throw new Error(`Failed to burn tokens: ${error.message}`);
    }
  }

  /**
   * Transfer tokens from treasury to investor account
   * 
   * @param {string} recipientAccountId - Hedera account ID of recipient
   * @param {number} amount - Amount to transfer
   * @returns {Object} - Transfer result
   */
  async transferTokensToInvestor(recipientAccountId, amount) {
    if (!this.tokenId) {
      throw new Error('Token ID not set. Create token first.');
    }

    try {
      logger.info(`Transferring ${amount} tokens to ${recipientAccountId}...`);

      const recipientId = AccountId.fromString(recipientAccountId);

      // Transfer transaction
      const transferTx = await new TransferTransaction()
        .addTokenTransfer(this.tokenId, this.treasuryId, -amount)
        .addTokenTransfer(this.tokenId, recipientId, amount)
        .setMaxTransactionFee(new Hbar(10))
        .execute(this.client);

      const receipt = await transferTx.getReceipt(this.client);

      logger.info(`Transferred ${amount} tokens to ${recipientAccountId} successfully`);

      return {
        success: true,
        amount: amount,
        recipient: recipientAccountId,
        transactionId: transferTx.transactionId.toString(),
        status: receipt.status.toString()
      };

    } catch (error) {
      logger.error('Token transfer failed:', error);
      throw new Error(`Failed to transfer tokens: ${error.message}`);
    }
  }

  /**
   * Transfer tokens from investor back to treasury (for redemption)
   * 
   * @param {string} senderAccountId - Hedera account ID of sender
   * @param {string} senderPrivateKey - Private key of sender
   * @param {number} amount - Amount to transfer
   * @returns {Object} - Transfer result
   */
  async transferTokensFromInvestor(senderAccountId, senderPrivateKey, amount) {
    if (!this.tokenId) {
      throw new Error('Token ID not set. Create token first.');
    }

    try {
      logger.info(`Receiving ${amount} tokens from ${senderAccountId}...`);

      const senderId = AccountId.fromString(senderAccountId);
      const senderKey = PrivateKey.fromString(senderPrivateKey);

      // Transfer transaction (signed by investor)
      const transferTx = await new TransferTransaction()
        .addTokenTransfer(this.tokenId, senderId, -amount)
        .addTokenTransfer(this.tokenId, this.treasuryId, amount)
        .setMaxTransactionFee(new Hbar(10))
        .freezeWith(this.client)
        .sign(senderKey);

      const txResponse = await transferTx.execute(this.client);
      const receipt = await txResponse.getReceipt(this.client);

      logger.info(`Received ${amount} tokens from ${senderAccountId} successfully`);

      return {
        success: true,
        amount: amount,
        sender: senderAccountId,
        transactionId: txResponse.transactionId.toString(),
        status: receipt.status.toString()
      };

    } catch (error) {
      logger.error('Token transfer from investor failed:', error);
      throw new Error(`Failed to receive tokens: ${error.message}`);
    }
  }

  /**
   * Associate token with an investor's account
   * Required before they can receive tokens
   * 
   * @param {string} accountId - Account to associate token with
   * @param {string} accountPrivateKey - Private key of the account
   * @returns {Object} - Association result
   */
  async associateTokenToAccount(accountId, accountPrivateKey) {
    if (!this.tokenId) {
      throw new Error('Token ID not set. Create token first.');
    }

    try {
      logger.info(`Associating token with account ${accountId}...`);

      const accId = AccountId.fromString(accountId);
      const accKey = PrivateKey.fromString(accountPrivateKey);

      const associateTx = await new TokenAssociateTransaction()
        .setAccountId(accId)
        .setTokenIds([this.tokenId])
        .setMaxTransactionFee(new Hbar(5))
        .freezeWith(this.client)
        .sign(accKey);

      const txResponse = await associateTx.execute(this.client);
      const receipt = await txResponse.getReceipt(this.client);

      logger.info(`Token associated with account ${accountId} successfully`);

      return {
        success: true,
        accountId: accountId,
        tokenId: this.tokenId.toString(),
        transactionId: txResponse.transactionId.toString(),
        status: receipt.status.toString()
      };

    } catch (error) {
      logger.error('Token association failed:', error);
      throw new Error(`Failed to associate token: ${error.message}`);
    }
  }

  /**
   * Get token information
   * 
   * @returns {Object} - Token information
   */
  async getTokenInfo() {
    if (!this.tokenId) {
      throw new Error('Token ID not set. Create token first.');
    }

    try {
      const tokenInfo = await new TokenInfoQuery()
        .setTokenId(this.tokenId)
        .execute(this.client);

      return {
        tokenId: this.tokenId.toString(),
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        decimals: tokenInfo.decimals,
        totalSupply: tokenInfo.totalSupply.toString(),
        treasury: tokenInfo.treasuryAccountId.toString(),
        adminKey: tokenInfo.adminKey ? tokenInfo.adminKey.toString() : null,
        supplyKey: tokenInfo.supplyKey ? tokenInfo.supplyKey.toString() : null
      };

    } catch (error) {
      logger.error('Failed to get token info:', error);
      throw new Error(`Failed to get token info: ${error.message}`);
    }
  }

  /**
   * Get account token balance
   * 
   * @param {string} accountId - Account ID to check
   * @returns {Object} - Balance information
   */
  async getAccountBalance(accountId) {
    try {
      const accId = AccountId.fromString(accountId);
      const balance = await new AccountBalanceQuery()
        .setAccountId(accId)
        .execute(this.client);

      let tokenBalance = 0;
      if (this.tokenId && balance.tokens) {
        tokenBalance = balance.tokens.get(this.tokenId) || 0;
      }

      return {
        accountId: accountId,
        hbarBalance: balance.hbars.toString(),
        tokenBalance: tokenBalance.toString(),
        tokenId: this.tokenId ? this.tokenId.toString() : null
      };

    } catch (error) {
      logger.error('Failed to get account balance:', error);
      throw new Error(`Failed to get account balance: ${error.message}`);
    }
  }

  /**
   * Set token ID if already created
   * 
   * @param {string} tokenId - Token ID string
   */
  setTokenId(tokenId) {
    this.tokenId = tokenId;
    logger.info(`Token ID set to: ${tokenId}`);
  }
}

// Export singleton instance
module.exports = new HederaService();
