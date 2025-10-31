/**
 * Interest Service - Calculates interest accrual for money market fund
 * 
 * This service handles:
 * - Daily interest calculation
 * - Compound interest accrual
 * - Interest distribution logic
 * - Interest rate management
 */

const logger = require('../utils/logger');

class InterestService {
  constructor() {
    // Annual interest rate from environment (e.g., 8.5%)
    this.annualRate = parseFloat(process.env.FUND_ANNUAL_INTEREST_RATE || 8.5) / 100;
    
    // Interest compounds daily
    this.compoundingPeriodsPerYear = 365;
    
    // Daily interest rate
    this.dailyRate = this.annualRate / this.compoundingPeriodsPerYear;
  }

  /**
   * Calculate interest accrued for a given investment
   * Uses compound interest formula: A = P(1 + r/n)^(nt)
   * 
   * @param {number} principal - Initial investment amount in RWF
   * @param {Date} startDate - Date when investment started
   * @param {Date} endDate - Date to calculate interest up to (default: now)
   * @returns {Object} - Interest calculation details
   */
  calculateInterest(principal, startDate, endDate = new Date()) {
    try {
      // Convert to numbers if they're strings
      const principalAmount = parseFloat(principal);
      
      if (principalAmount <= 0) {
        return {
          principal: 0,
          interest: 0,
          totalValue: 0,
          days: 0,
          annualRate: this.annualRate * 100
        };
      }

      // Calculate days elapsed
      const start = new Date(startDate);
      const end = new Date(endDate);
      const millisecondsPerDay = 1000 * 60 * 60 * 24;
      const daysElapsed = Math.floor((end - start) / millisecondsPerDay);

      if (daysElapsed < 0) {
        throw new Error('End date cannot be before start date');
      }

      // Compound interest formula: A = P(1 + r/n)^(nt)
      // Where:
      // P = principal
      // r = annual rate
      // n = compounding periods per year (365 for daily)
      // t = time in years
      
      const timeInYears = daysElapsed / 365;
      const compoundFactor = Math.pow(
        (1 + this.dailyRate),
        daysElapsed
      );

      const totalValue = principalAmount * compoundFactor;
      const interestEarned = totalValue - principalAmount;

      return {
        principal: Math.round(principalAmount * 100) / 100, // Round to 2 decimals
        interest: Math.round(interestEarned * 100) / 100,
        totalValue: Math.round(totalValue * 100) / 100,
        days: daysElapsed,
        annualRate: Math.round(this.annualRate * 10000) / 100, // Percentage with 2 decimals
        dailyRate: Math.round(this.dailyRate * 1000000) / 10000, // Percentage with 4 decimals
        effectiveRate: Math.round(((totalValue / principalAmount - 1) / timeInYears) * 10000) / 100
      };

    } catch (error) {
      logger.error('Interest calculation failed:', error);
      throw new Error(`Failed to calculate interest: ${error.message}`);
    }
  }

  /**
   * Calculate projected interest for a future date
   * 
   * @param {number} principal - Investment amount
   * @param {number} daysAhead - Number of days in the future
   * @returns {Object} - Projected interest calculation
   */
  calculateProjectedInterest(principal, daysAhead) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    
    return this.calculateInterest(principal, new Date(), futureDate);
  }

  /**
   * Calculate interest for multiple investments (portfolio)
   * 
   * @param {Array} investments - Array of investment objects
   * @returns {Object} - Total portfolio interest calculation
   */
  calculatePortfolioInterest(investments) {
    try {
      let totalPrincipal = 0;
      let totalInterest = 0;
      let totalValue = 0;

      const investmentDetails = investments.map(investment => {
        const calculation = this.calculateInterest(
          investment.amount,
          investment.startDate
        );

        totalPrincipal += calculation.principal;
        totalInterest += calculation.interest;
        totalValue += calculation.totalValue;

        return {
          investmentId: investment.id,
          ...calculation
        };
      });

      return {
        totalPrincipal: Math.round(totalPrincipal * 100) / 100,
        totalInterest: Math.round(totalInterest * 100) / 100,
        totalValue: Math.round(totalValue * 100) / 100,
        numberOfInvestments: investments.length,
        annualRate: Math.round(this.annualRate * 10000) / 100,
        investments: investmentDetails
      };

    } catch (error) {
      logger.error('Portfolio interest calculation failed:', error);
      throw new Error(`Failed to calculate portfolio interest: ${error.message}`);
    }
  }

  /**
   * Calculate daily interest accrual for display purposes
   * Shows what the investor earns per day
   * 
   * @param {number} principal - Investment amount
   * @returns {Object} - Daily interest details
   */
  calculateDailyInterest(principal) {
    const principalAmount = parseFloat(principal);
    const dailyInterest = principalAmount * this.dailyRate;

    return {
      principal: principalAmount,
      dailyInterest: Math.round(dailyInterest * 100) / 100,
      monthlyInterest: Math.round(dailyInterest * 30 * 100) / 100,
      yearlyInterest: Math.round(dailyInterest * 365 * 100) / 100,
      dailyRate: Math.round(this.dailyRate * 1000000) / 10000,
      annualRate: Math.round(this.annualRate * 10000) / 100
    };
  }

  /**
   * Calculate interest for a specific number of days
   * Useful for showing estimated returns
   * 
   * @param {number} principal - Investment amount
   * @param {number} days - Number of days
   * @returns {Object} - Interest for specified period
   */
  calculateInterestForPeriod(principal, days) {
    const principalAmount = parseFloat(principal);
    const compoundFactor = Math.pow((1 + this.dailyRate), days);
    const totalValue = principalAmount * compoundFactor;
    const interestEarned = totalValue - principalAmount;

    return {
      principal: principalAmount,
      days: days,
      interest: Math.round(interestEarned * 100) / 100,
      totalValue: Math.round(totalValue * 100) / 100,
      annualRate: Math.round(this.annualRate * 10000) / 100
    };
  }

  /**
   * Calculate Annual Percentage Yield (APY) considering compound interest
   * APY = (1 + r/n)^n - 1
   * 
   * @returns {Object} - APY details
   */
  calculateAPY() {
    const apy = Math.pow((1 + this.dailyRate), 365) - 1;

    return {
      annualRate: Math.round(this.annualRate * 10000) / 100,
      apy: Math.round(apy * 10000) / 100,
      compoundingFrequency: 'Daily',
      periodsPerYear: this.compoundingPeriodsPerYear
    };
  }

  /**
   * Update annual interest rate (manager function)
   * 
   * @param {number} newRate - New annual rate as percentage (e.g., 8.5 for 8.5%)
   */
  updateInterestRate(newRate) {
    const rate = parseFloat(newRate);
    
    if (rate < 0 || rate > 100) {
      throw new Error('Interest rate must be between 0 and 100');
    }

    this.annualRate = rate / 100;
    this.dailyRate = this.annualRate / this.compoundingPeriodsPerYear;

    logger.info(`Interest rate updated to ${rate}%`);

    return {
      success: true,
      newAnnualRate: rate,
      newDailyRate: Math.round(this.dailyRate * 1000000) / 10000,
      apy: this.calculateAPY().apy
    };
  }

  /**
   * Get current interest rate information
   * 
   * @returns {Object} - Current rate details
   */
  getCurrentRates() {
    return {
      annualRate: Math.round(this.annualRate * 10000) / 100,
      dailyRate: Math.round(this.dailyRate * 1000000) / 10000,
      apy: this.calculateAPY().apy,
      compoundingFrequency: 'Daily'
    };
  }

  /**
   * Calculate break-even time (when interest equals fees, if any)
   * 
   * @param {number} principal - Investment amount
   * @param {number} fee - Fee amount to break even
   * @returns {Object} - Break-even calculation
   */
  calculateBreakEven(principal, fee) {
    if (fee <= 0) {
      return {
        days: 0,
        message: 'No fees to break even'
      };
    }

    // Calculate days needed: fee = principal * ((1 + dailyRate)^days - 1)
    // Solving for days: days = ln(1 + fee/principal) / ln(1 + dailyRate)
    const days = Math.ceil(
      Math.log(1 + fee / principal) / Math.log(1 + this.dailyRate)
    );

    return {
      principal: principal,
      fee: fee,
      days: days,
      months: Math.round((days / 30) * 10) / 10
    };
  }
}

// Export singleton instance
module.exports = new InterestService();
