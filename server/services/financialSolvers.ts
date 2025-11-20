/**
 * Financial Calculation Solvers
 * Advanced algorithms for tax, financial metrics, and accounting calculations
 */

export interface TaxCalculationResult {
  jurisdiction: string;
  taxableIncome: number;
  effectiveRate: number;
  totalTax: number;
  breakdown: {
    federal?: number;
    state?: number;
    local?: number;
    other?: number;
  };
  deductions?: number;
  credits?: number;
  notes: string[];
}

export interface FinancialMetrics {
  npv?: number;
  irr?: number;
  paybackPeriod?: number;
  profitabilityIndex?: number;
  roe?: number;
  roa?: number;
  currentRatio?: number;
  quickRatio?: number;
  debtToEquity?: number;
}

export class FinancialSolverService {
  /**
   * Calculate corporate tax for various jurisdictions
   */
  calculateCorporateTax(
    revenue: number,
    expenses: number,
    jurisdiction: string,
    entityType: string = 'c-corp'
  ): TaxCalculationResult {
    const taxableIncome = revenue - expenses;
    
    switch (jurisdiction.toLowerCase()) {
      case 'us':
      case 'united states':
        return this.calculateUSTax(taxableIncome, entityType);
      case 'canada':
        return this.calculateCanadaTax(taxableIncome, 'federal');
      case 'uk':
        return this.calculateUKTax(taxableIncome);
      default:
        return this.calculateUSTax(taxableIncome, entityType);
    }
  }

  private calculateUSTax(taxableIncome: number, entityType: string): TaxCalculationResult {
    const federalRate = 0.21; // Post-TCJA flat rate
    const federalTax = taxableIncome * federalRate;
    
    // Note: State tax would vary by state, using average estimate
    const avgStateTax = taxableIncome * 0.06;
    
    return {
      jurisdiction: 'United States',
      taxableIncome,
      effectiveRate: 0.27,
      totalTax: federalTax + avgStateTax,
      breakdown: {
        federal: federalTax,
        state: avgStateTax
      },
      notes: [
        'Federal corporate tax rate: 21% (flat rate post-TCJA)',
        'State tax estimated at 6% (varies by state)',
        'Actual tax may vary based on deductions, credits, and state-specific rules'
      ]
    };
  }

  private calculateCanadaTax(taxableIncome: number, province: string): TaxCalculationResult {
    const federalRate = 0.15; // General federal rate
    const federalTax = taxableIncome * federalRate;
    const provincialTax = taxableIncome * 0.11; // Average provincial rate
    
    return {
      jurisdiction: 'Canada',
      taxableIncome,
      effectiveRate: 0.26,
      totalTax: federalTax + provincialTax,
      breakdown: {
        federal: federalTax,
        state: provincialTax
      },
      notes: [
        'Federal rate: 15% (general rate)',
        'Provincial rate varies by province (estimated 11%)',
        'Small business deduction may apply for CCPCs'
      ]
    };
  }

  private calculateUKTax(taxableIncome: number): TaxCalculationResult {
    const corporationTaxRate = 0.25; // Current UK main rate
    const totalTax = taxableIncome * corporationTaxRate;
    
    return {
      jurisdiction: 'United Kingdom',
      taxableIncome,
      effectiveRate: 0.25,
      totalTax,
      breakdown: {
        federal: totalTax
      },
      notes: [
        'Corporation Tax main rate: 25%',
        'Small profits rate (19%) may apply for profits under £50,000',
        'Marginal relief available for profits between £50,000 and £250,000'
      ]
    };
  }

  /**
   * Calculate Net Present Value (NPV)
   */
  calculateNPV(cashFlows: number[], discountRate: number): number {
    return cashFlows.reduce((npv, cashFlow, period) => {
      return npv + cashFlow / Math.pow(1 + discountRate, period);
    }, 0);
  }

  /**
   * Calculate Internal Rate of Return (IRR)
   * Using Newton-Raphson method
   */
  calculateIRR(cashFlows: number[], guess: number = 0.1): number | null {
    const maxIterations = 100;
    const tolerance = 0.00001;
    let rate = guess;
    
    for (let i = 0; i < maxIterations; i++) {
      const npv = this.calculateNPV(cashFlows, rate);
      const dnpv = this.calculateNPVDerivative(cashFlows, rate);
      
      if (Math.abs(npv) < tolerance) {
        return rate;
      }
      
      if (dnpv === 0) return null;
      
      rate = rate - npv / dnpv;
    }
    
    return null; // Failed to converge
  }

  private calculateNPVDerivative(cashFlows: number[], rate: number): number {
    return cashFlows.reduce((sum, cashFlow, period) => {
      if (period === 0) return sum;
      return sum - (period * cashFlow) / Math.pow(1 + rate, period + 1);
    }, 0);
  }

  /**
   * Calculate depreciation using various methods
   */
  calculateDepreciation(
    cost: number,
    salvageValue: number,
    usefulLife: number,
    method: 'straight-line' | 'declining-balance' | 'sum-of-years',
    period: number
  ): number {
    switch (method) {
      case 'straight-line':
        return (cost - salvageValue) / usefulLife;
      
      case 'declining-balance':
        const rate = 2 / usefulLife; // Double declining balance
        let bookValue = cost;
        for (let i = 1; i < period; i++) {
          bookValue -= bookValue * rate;
        }
        return Math.max(bookValue * rate, bookValue - salvageValue);
      
      case 'sum-of-years':
        const sumOfYears = (usefulLife * (usefulLife + 1)) / 2;
        const yearsRemaining = usefulLife - period + 1;
        return ((cost - salvageValue) * yearsRemaining) / sumOfYears;
      
      default:
        return (cost - salvageValue) / usefulLife;
    }
  }

  /**
   * Calculate financial ratios with full context for formatting
   */
  calculateFinancialRatios(
    currentAssets: number,
    currentLiabilities: number,
    totalAssets: number,
    totalLiabilities: number,
    inventory: number,
    netIncome: number,
    equity: number,
    historicalData?: Array<{ period: string; currentRatio: number }>
  ): FinancialMetrics & {
    currentAssets?: number;
    currentLiabilities?: number;
    totalAssets?: number;
    totalLiabilities?: number;
    inventory?: number;
    netIncome?: number;
    equity?: number;
    historicalData?: Array<{ period: string; currentRatio: number }>;
  } {
    return {
      currentRatio: currentLiabilities > 0 ? currentAssets / currentLiabilities : 0,
      quickRatio: currentLiabilities > 0 
        ? (currentAssets - inventory) / currentLiabilities 
        : 0,
      debtToEquity: equity > 0 ? totalLiabilities / equity : 0,
      roe: equity > 0 ? netIncome / equity : 0,
      roa: totalAssets > 0 ? netIncome / totalAssets : 0,
      // Include raw data for formatter
      currentAssets,
      currentLiabilities,
      totalAssets,
      totalLiabilities,
      inventory,
      netIncome,
      equity,
      historicalData
    };
  }

  /**
   * Calculate amortization schedule for loans
   */
  calculateAmortization(
    principal: number,
    annualRate: number,
    years: number,
    paymentsPerYear: number = 12
  ): { payment: number; schedule: Array<{ period: number; payment: number; principal: number; interest: number; balance: number }> } {
    const periodicRate = annualRate / paymentsPerYear;
    const totalPayments = years * paymentsPerYear;
    
    const payment = principal * 
      (periodicRate * Math.pow(1 + periodicRate, totalPayments)) /
      (Math.pow(1 + periodicRate, totalPayments) - 1);
    
    const schedule = [];
    let balance = principal;
    
    for (let period = 1; period <= totalPayments; period++) {
      const interest = balance * periodicRate;
      const principalPayment = payment - interest;
      balance -= principalPayment;
      
      schedule.push({
        period,
        payment,
        principal: principalPayment,
        interest,
        balance: Math.max(0, balance)
      });
    }
    
    return { payment, schedule };
  }
}

export const financialSolverService = new FinancialSolverService();
