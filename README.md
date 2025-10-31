# Pezzy Money Market Fund - Hedera Tokenization Platform

## Overview

Pezzy is a platform that enables small-scale investors in Rwanda to invest in a large money market fund through tokenization on the Hedera network. The platform acts as an intermediary, managing millions of small investors while the large money market fund only deals with Pezzy.

## Key Features

- **Hedera Token Service (HTS)** integration for tokenizing fund shares
- **Multi-signature authorization** requiring two Pezzy managers to approve token creation
- **1:1 RWF value pegging** - Each token equals 1 Rwanda Franc
- **Real-time interest accrual** tracking and display
- **Instant liquidity** - Investors can liquidate tokens anytime
- **Binance-like UI** - Clean, focused interface showing holdings and interest
- **Secure backend** with Node.js and Express
- **Modern frontend** with Angular 19

## Architecture

### Backend (Node.js)
- Express.js REST API
- Hedera SDK integration
- Multi-signature token creation workflow
- Interest calculation engine
- User authentication & authorization
- Transaction management

### Frontend (Angular 19)
- Responsive, Binance-inspired design
- Real-time portfolio dashboard
- Token purchase/redemption interface
- Interest accrual visualization
- Transaction history

## Hedera Integration

### Token Design
- **Token Type**: Fungible Token (HTS)
- **Symbol**: PMKT (Pezzy Money Market Token)
- **Decimals**: 2 (representing RWF cents)
- **Value**: 1 PMKT = 1 RWF
- **Supply Management**: Dynamic supply based on fund investments
- **Treasury**: Managed by Pezzy with multi-sig controls

### Multi-Signature Setup
- Requires 2 out of 2 Pezzy manager signatures for:
  - Token creation
  - Treasury management
  - Major fund operations
  - Interest distribution

## Installation

### Prerequisites
- Node.js 18+ and npm
- Angular CLI 19
- Hedera Testnet accounts (for development)
- MongoDB (for user data)

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Configure your .env file with Hedera credentials
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
ng serve
```

## Environment Variables

```
# Hedera Configuration
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ID=0.0.xxxxx
HEDERA_OPERATOR_KEY=302e...
MANAGER1_ACCOUNT_ID=0.0.xxxxx
MANAGER1_PRIVATE_KEY=302e...
MANAGER2_ACCOUNT_ID=0.0.xxxxx
MANAGER2_PRIVATE_KEY=302e...

# Fund Configuration
FUND_ANNUAL_INTEREST_RATE=8.5
TOKEN_SYMBOL=PMKT
TOKEN_NAME=Pezzy Money Market Token
TOKEN_DECIMALS=2

# Database
MONGODB_URI=mongodb://localhost:27017/pezzy
JWT_SECRET=your-secret-key

# API
PORT=3000
FRONTEND_URL=http://localhost:4200
```

## API Endpoints

### Token Management
- `POST /api/tokens/create` - Create token (requires 2 manager signatures)
- `GET /api/tokens/info` - Get token information
- `GET /api/tokens/supply` - Get current token supply

### Investment Operations
- `POST /api/invest/buy` - Purchase tokens (deposit RWF)
- `POST /api/invest/redeem` - Liquidate tokens (withdraw RWF)
- `GET /api/invest/portfolio` - Get user portfolio
- `GET /api/invest/interest` - Calculate current interest accrued

### User Management
- `POST /api/auth/register` - Register new investor
- `POST /api/auth/login` - Login
- `GET /api/users/profile` - Get user profile
- `GET /api/users/transactions` - Get transaction history

### Manager Operations
- `POST /api/manager/sign-token-creation` - Sign token creation request
- `GET /api/manager/pending-actions` - Get pending multi-sig actions
- `POST /api/manager/distribute-interest` - Distribute interest to holders

## Security Considerations

1. **Private Key Management**: Never commit private keys to version control
2. **Multi-Signature**: All critical operations require 2 manager approvals
3. **Rate Limiting**: API endpoints are rate-limited to prevent abuse
4. **JWT Authentication**: Secure user sessions with JWT tokens
5. **Input Validation**: All inputs are validated and sanitized
6. **Audit Logging**: All transactions are logged for compliance

## Development Workflow

1. **Token Creation Flow**:
   - Manager 1 initiates token creation request
   - Manager 2 reviews and signs the request
   - Token is created on Hedera with multi-sig treasury
   - Token ID is stored in database

2. **Investment Flow**:
   - Investor deposits RWF via mobile money/bank
   - Backend verifies payment
   - Tokens are minted and transferred to investor's account
   - Interest accrual begins immediately

3. **Redemption Flow**:
   - Investor requests redemption
   - Tokens are burned from investor's account
   - RWF amount (principal + interest) is calculated
   - Payment is processed via mobile money/bank

## Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
ng e2e
```

## Production Deployment

1. Switch to Hedera Mainnet
2. Update environment variables
3. Implement proper KYC/AML procedures
4. Set up monitoring and alerting
5. Configure backup strategies
6. Enable SSL/TLS

## License

none

## Support

For support, contact: devis@pezzy.app
