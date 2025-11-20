/**
 * Calculation Output Formatter
 * Transforms raw financial calculations into professional, well-structured outputs
 * Provides consistent formatting for all computation types
 */

export interface FormattedCalculationOutput {
  title: string;
  sections: OutputSection[];
  summary: string;
  markdown: string;
}

export interface OutputSection {
  heading: string;
  subsections?: Array<{
    label: string;
    value: string | number;
    description?: string;
  }>;
  table?: {
    headers: string[];
    rows: Array<Array<string | number>>;
  };
  note?: string;
}

export class CalculationFormatter {
  /**
   * Format any calculation result with professional structure
   */
  formatCalculation(
    calculationType: string,
    calculationData: any,
    query: string
  ): FormattedCalculationOutput {
    switch (calculationType) {
      case 'currentRatio':
      case 'financialRatios':
        return this.formatFinancialRatios(calculationData, query);
      
      case 'taxCalculation':
        return this.formatTaxCalculation(calculationData, query);
      
      case 'npv':
        return this.formatNPV(calculationData, query);
      
      case 'irr':
        return this.formatIRR(calculationData, query);
      
      case 'depreciation':
        return this.formatDepreciation(calculationData, query);
      
      case 'amortization':
        return this.formatAmortization(calculationData, query);
      
      default:
        return this.formatGenericCalculation(calculationType, calculationData, query);
    }
  }

  /**
   * Format financial ratios (Current Ratio, Quick Ratio, etc.)
   */
  private formatFinancialRatios(data: any, query: string): FormattedCalculationOutput {
    const sections: OutputSection[] = [];

    // Section 1: Quick Summary
    sections.push({
      heading: '📊 Quick Summary',
      subsections: [
        {
          label: 'Current Ratio',
          value: data.currentRatio ? data.currentRatio.toFixed(2) : 'N/A',
          description: 'Ability to cover short-term obligations'
        },
        {
          label: 'Industry Benchmark',
          value: '1.5 - 3.0',
          description: 'Typical healthy range for most industries'
        },
        {
          label: 'Assessment',
          value: this.assessRatio(data.currentRatio, 1.5, 3.0),
          description: this.getRatioInterpretation(data.currentRatio, 1.5, 3.0)
        }
      ]
    });

    // Section 2: Detailed Calculation
    sections.push({
      heading: '🧮 Calculation Breakdown',
      table: {
        headers: ['Component', 'Amount', 'Description'],
        rows: [
          ['Current Assets', this.formatCurrency(data.currentAssets || 0), 'Cash, receivables, inventory, prepaid expenses'],
          ['Current Liabilities', this.formatCurrency(data.currentLiabilities || 0), 'Accounts payable, short-term debt, accrued expenses'],
          ['', '', ''],
          ['Current Ratio', (data.currentRatio || 0).toFixed(2), `${this.formatCurrency(data.currentAssets || 0)} ÷ ${this.formatCurrency(data.currentLiabilities || 0)}`]
        ]
      },
      note: 'Formula: Current Ratio = Current Assets ÷ Current Liabilities'
    });

    // Section 3: Related Ratios (if available)
    if (data.quickRatio !== undefined || data.debtToEquity !== undefined) {
      const relatedRows: Array<Array<string | number>> = [];
      
      if (data.quickRatio !== undefined) {
        relatedRows.push([
          'Quick Ratio',
          data.quickRatio.toFixed(2),
          this.assessRatio(data.quickRatio, 1.0, 2.0),
          'More conservative - excludes inventory'
        ]);
      }
      
      if (data.debtToEquity !== undefined) {
        relatedRows.push([
          'Debt-to-Equity',
          data.debtToEquity.toFixed(2),
          this.assessRatio(data.debtToEquity, 0, 1.5, true),
          'Measures financial leverage'
        ]);
      }

      sections.push({
        heading: '📈 Related Ratios',
        table: {
          headers: ['Ratio', 'Value', 'Status', 'Description'],
          rows: relatedRows
        }
      });
    }

    // Section 4: Trend Analysis (if historical data available)
    if (data.historicalData && data.historicalData.length > 0) {
      sections.push({
        heading: '📉 Trend Analysis',
        table: {
          headers: ['Period', 'Current Ratio', 'Change', 'Direction'],
          rows: this.buildTrendTable(data.historicalData, 'currentRatio')
        },
        note: 'Trend direction: 📈 Improving | 📊 Stable | 📉 Declining'
      });
    }

    // Section 5: Interpretation & Recommendations
    const interpretation = this.getDetailedInterpretation(data);
    sections.push({
      heading: '💡 Professional Interpretation',
      subsections: [
        {
          label: 'What This Means',
          value: interpretation.meaning,
        },
        {
          label: 'Key Considerations',
          value: interpretation.considerations,
        },
        {
          label: 'Recommendations',
          value: interpretation.recommendations,
        }
      ]
    });

    const markdown = this.sectionsToMarkdown(sections);
    const summary = this.generateSummary('Current Ratio Analysis', data.currentRatio);

    return {
      title: 'Current Ratio Analysis',
      sections,
      summary,
      markdown
    };
  }

  /**
   * Format tax calculation results
   */
  private formatTaxCalculation(data: any, query: string): FormattedCalculationOutput {
    const sections: OutputSection[] = [];

    // Quick Summary
    sections.push({
      heading: '💰 Tax Calculation Summary',
      subsections: [
        { label: 'Jurisdiction', value: data.jurisdiction || 'N/A' },
        { label: 'Taxable Income', value: this.formatCurrency(data.taxableIncome || 0) },
        { label: 'Effective Tax Rate', value: this.formatPercent(data.effectiveRate || 0) },
        { label: 'Total Tax Liability', value: this.formatCurrency(data.totalTax || 0) }
      ]
    });

    // Tax Breakdown
    if (data.breakdown) {
      const breakdownRows: Array<Array<string | number>> = [];
      
      if (data.breakdown.federal) {
        breakdownRows.push(['Federal Tax', this.formatCurrency(data.breakdown.federal), this.formatPercent((data.breakdown.federal / data.taxableIncome) || 0)]);
      }
      if (data.breakdown.state) {
        breakdownRows.push(['State Tax', this.formatCurrency(data.breakdown.state), this.formatPercent((data.breakdown.state / data.taxableIncome) || 0)]);
      }
      if (data.breakdown.local) {
        breakdownRows.push(['Local Tax', this.formatCurrency(data.breakdown.local), this.formatPercent((data.breakdown.local / data.taxableIncome) || 0)]);
      }
      
      breakdownRows.push(['', '', '']);
      breakdownRows.push(['Total Tax', this.formatCurrency(data.totalTax), this.formatPercent(data.effectiveRate)]);

      sections.push({
        heading: '🧾 Tax Breakdown',
        table: {
          headers: ['Component', 'Amount', 'Rate'],
          rows: breakdownRows
        }
      });
    }

    // Important Notes
    if (data.notes && data.notes.length > 0) {
      sections.push({
        heading: '📝 Important Notes',
        note: data.notes.map((note: string, i: number) => `${i + 1}. ${note}`).join('\n')
      });
    }

    const markdown = this.sectionsToMarkdown(sections);
    const summary = `Tax liability calculated at ${this.formatPercent(data.effectiveRate)} effective rate`;

    return {
      title: 'Tax Calculation Results',
      sections,
      summary,
      markdown
    };
  }

  /**
   * Format NPV calculation
   */
  private formatNPV(data: any, query: string): FormattedCalculationOutput {
    const sections: OutputSection[] = [];

    sections.push({
      heading: '💵 Net Present Value (NPV) Analysis',
      subsections: [
        { label: 'NPV Result', value: this.formatCurrency(data.npv || 0), description: data.npv > 0 ? '✅ Positive - Investment recommended' : '❌ Negative - Investment not recommended' },
        { label: 'Discount Rate', value: this.formatPercent(data.discountRate || 0) },
        { label: 'Initial Investment', value: this.formatCurrency(data.initialInvestment || 0) },
        { label: 'Time Period', value: `${data.cashFlows?.length || 0} years` }
      ]
    });

    // Cash Flow Breakdown
    if (data.cashFlows && Array.isArray(data.cashFlows)) {
      const cashFlowRows = data.cashFlows.map((cf: number, i: number) => [
        `Year ${i}`,
        this.formatCurrency(cf),
        this.formatCurrency(cf / Math.pow(1 + (data.discountRate || 0), i)),
        this.formatPercent(1 / Math.pow(1 + (data.discountRate || 0), i))
      ]);

      sections.push({
        heading: '📊 Cash Flow Analysis',
        table: {
          headers: ['Period', 'Cash Flow', 'Present Value', 'Discount Factor'],
          rows: cashFlowRows
        },
        note: `Formula: PV = CF ÷ (1 + r)^t, where r = ${this.formatPercent(data.discountRate || 0)}`
      });
    }

    // Investment Decision
    sections.push({
      heading: '🎯 Investment Decision',
      subsections: [
        {
          label: 'Recommendation',
          value: data.npv > 0 ? 'ACCEPT' : 'REJECT',
          description: data.npv > 0 
            ? `This investment is expected to generate ${this.formatCurrency(Math.abs(data.npv))} in value above the required return.`
            : `This investment would destroy ${this.formatCurrency(Math.abs(data.npv))} in value relative to the required return.`
        }
      ]
    });

    const markdown = this.sectionsToMarkdown(sections);
    const summary = `NPV: ${this.formatCurrency(data.npv)} - ${data.npv > 0 ? 'Investment recommended' : 'Investment not recommended'}`;

    return {
      title: 'Net Present Value Analysis',
      sections,
      summary,
      markdown
    };
  }

  /**
   * Format IRR calculation
   */
  private formatIRR(data: any, query: string): FormattedCalculationOutput {
    const sections: OutputSection[] = [];

    sections.push({
      heading: '📈 Internal Rate of Return (IRR) Analysis',
      subsections: [
        { label: 'IRR Result', value: this.formatPercent(data.irr || 0) },
        { label: 'Required Return', value: this.formatPercent(data.requiredReturn || 0.10) },
        { label: 'Decision', value: (data.irr || 0) > (data.requiredReturn || 0.10) ? '✅ ACCEPT' : '❌ REJECT' },
        { label: 'Excess Return', value: this.formatPercent((data.irr || 0) - (data.requiredReturn || 0.10)) }
      ]
    });

    const markdown = this.sectionsToMarkdown(sections);
    const summary = `IRR: ${this.formatPercent(data.irr)} - ${(data.irr || 0) > (data.requiredReturn || 0.10) ? 'Above' : 'Below'} required return`;

    return {
      title: 'Internal Rate of Return Analysis',
      sections,
      summary,
      markdown
    };
  }

  /**
   * Format depreciation schedule
   */
  private formatDepreciation(data: any, query: string): FormattedCalculationOutput {
    const sections: OutputSection[] = [];

    sections.push({
      heading: '🏢 Depreciation Schedule',
      subsections: [
        { label: 'Asset Cost', value: this.formatCurrency(data.cost || 0) },
        { label: 'Salvage Value', value: this.formatCurrency(data.salvageValue || 0) },
        { label: 'Useful Life', value: `${data.usefulLife || 0} years` },
        { label: 'Method', value: data.method || 'Straight-Line' },
        { label: 'Annual Depreciation', value: this.formatCurrency(data.annualDepreciation || 0) }
      ]
    });

    if (data.schedule && Array.isArray(data.schedule)) {
      sections.push({
        heading: '📅 Year-by-Year Schedule',
        table: {
          headers: ['Year', 'Beginning Balance', 'Depreciation', 'Ending Balance', 'Accumulated'],
          rows: data.schedule.map((row: any) => [
            row.year,
            this.formatCurrency(row.beginningBalance),
            this.formatCurrency(row.depreciation),
            this.formatCurrency(row.endingBalance),
            this.formatCurrency(row.accumulated)
          ])
        }
      });
    }

    const markdown = this.sectionsToMarkdown(sections);
    const summary = `${data.method || 'Straight-Line'} depreciation: ${this.formatCurrency(data.annualDepreciation)} per year`;

    return {
      title: 'Depreciation Analysis',
      sections,
      summary,
      markdown
    };
  }

  /**
   * Format amortization schedule
   */
  private formatAmortization(data: any, query: string): FormattedCalculationOutput {
    const sections: OutputSection[] = [];

    sections.push({
      heading: '🏦 Loan Amortization Summary',
      subsections: [
        { label: 'Loan Amount', value: this.formatCurrency(data.principal || 0) },
        { label: 'Interest Rate', value: this.formatPercent(data.annualRate || 0) },
        { label: 'Term', value: `${data.years || 0} years` },
        { label: 'Monthly Payment', value: this.formatCurrency(data.payment || 0) },
        { label: 'Total Payments', value: this.formatCurrency((data.payment || 0) * (data.years || 0) * 12) },
        { label: 'Total Interest', value: this.formatCurrency(((data.payment || 0) * (data.years || 0) * 12) - (data.principal || 0)) }
      ]
    });

    if (data.schedule && Array.isArray(data.schedule) && data.schedule.length > 0) {
      // Show first 12 months
      const first12 = data.schedule.slice(0, 12);
      sections.push({
        heading: '📊 First Year Payment Breakdown',
        table: {
          headers: ['Month', 'Payment', 'Principal', 'Interest', 'Balance'],
          rows: first12.map((row: any) => [
            row.period,
            this.formatCurrency(row.payment),
            this.formatCurrency(row.principal),
            this.formatCurrency(row.interest),
            this.formatCurrency(row.balance)
          ])
        },
        note: `Full ${data.years}-year schedule available in downloadable format`
      });
    }

    const markdown = this.sectionsToMarkdown(sections);
    const summary = `${this.formatCurrency(data.payment)} monthly payment over ${data.years} years`;

    return {
      title: 'Loan Amortization Schedule',
      sections,
      summary,
      markdown
    };
  }

  /**
   * Format generic calculation
   */
  private formatGenericCalculation(type: string, data: any, query: string): FormattedCalculationOutput {
    const sections: OutputSection[] = [];

    sections.push({
      heading: `📊 ${this.humanizeCalculationType(type)}`,
      subsections: Object.entries(data).map(([key, value]) => ({
        label: this.humanizeKey(key),
        value: typeof value === 'number' ? this.formatNumber(value) : String(value)
      }))
    });

    const markdown = this.sectionsToMarkdown(sections);
    const summary = `${this.humanizeCalculationType(type)} completed`;

    return {
      title: this.humanizeCalculationType(type),
      sections,
      summary,
      markdown
    };
  }

  // === Helper Methods ===

  private assessRatio(value: number | undefined, min: number, max: number, reverse: boolean = false): string {
    if (value === undefined) return '⚪ N/A';
    
    if (!reverse) {
      if (value >= min && value <= max) return '🟢 Healthy';
      if (value < min) return '🔴 Low';
      return '🟡 High';
    } else {
      if (value <= max) return '🟢 Healthy';
      return '🔴 High';
    }
  }

  private getRatioInterpretation(value: number | undefined, min: number, max: number): string {
    if (value === undefined) return 'Insufficient data';
    
    if (value >= min && value <= max) {
      return 'Company can comfortably meet short-term obligations';
    } else if (value < min) {
      return 'May struggle to meet short-term obligations';
    } else {
      return 'Strong liquidity, but may indicate inefficient asset use';
    }
  }

  private getDetailedInterpretation(data: any): {
    meaning: string;
    considerations: string;
    recommendations: string;
  } {
    const ratio = data.currentRatio || 0;
    
    let meaning = '';
    let considerations = '';
    let recommendations = '';

    if (ratio < 1.0) {
      meaning = 'The company has fewer current assets than current liabilities, indicating potential liquidity issues.';
      considerations = 'This could signal financial distress, working capital problems, or aggressive growth strategies.';
      recommendations = 'Consider improving cash flow, negotiating extended payment terms, or securing additional financing.';
    } else if (ratio >= 1.0 && ratio < 1.5) {
      meaning = 'The company can cover current liabilities, but has limited buffer for unexpected expenses.';
      considerations = 'Monitor cash flow closely. Industry-specific factors may affect interpretation.';
      recommendations = 'Build cash reserves, optimize inventory management, and improve collection processes.';
    } else if (ratio >= 1.5 && ratio <= 3.0) {
      meaning = 'The company has a healthy cushion to meet short-term obligations.';
      considerations = 'This is generally considered optimal liquidity for most industries.';
      recommendations = 'Maintain current working capital management practices.';
    } else {
      meaning = 'The company has significant excess liquidity.';
      considerations = 'While safe, this may indicate underutilized assets that could be deployed more productively.';
      recommendations = 'Consider investing excess cash, paying down debt, or returning capital to shareholders.';
    }

    return { meaning, considerations, recommendations };
  }

  private buildTrendTable(historicalData: any[], metric: string): Array<Array<string | number>> {
    const rows: Array<Array<string | number>> = [];
    
    for (let i = 0; i < historicalData.length; i++) {
      const current = historicalData[i][metric];
      const previous = i > 0 ? historicalData[i - 1][metric] : null;
      
      let change = 'N/A';
      let direction = '—';
      
      if (previous !== null && current !== undefined) {
        const diff = current - previous;
        const pct = (diff / previous) * 100;
        change = `${diff >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
        direction = diff > 0 ? '📈' : diff < 0 ? '📉' : '📊';
      }
      
      rows.push([
        historicalData[i].period || `Period ${i + 1}`,
        current?.toFixed(2) || 'N/A',
        change,
        direction
      ]);
    }
    
    return rows;
  }

  private sectionsToMarkdown(sections: OutputSection[]): string {
    let md = '';
    
    for (const section of sections) {
      md += `## ${section.heading}\n\n`;
      
      if (section.subsections) {
        for (const sub of section.subsections) {
          md += `**${sub.label}:** ${sub.value}`;
          if (sub.description) md += `  \n*${sub.description}*`;
          md += '\n\n';
        }
      }
      
      if (section.table) {
        // Create markdown table
        md += '| ' + section.table.headers.join(' | ') + ' |\n';
        md += '| ' + section.table.headers.map(() => '---').join(' | ') + ' |\n';
        for (const row of section.table.rows) {
          md += '| ' + row.join(' | ') + ' |\n';
        }
        md += '\n';
      }
      
      if (section.note) {
        md += `*${section.note}*\n\n`;
      }
      
      md += '---\n\n';
    }
    
    return md;
  }

  private generateSummary(title: string, primaryValue: any): string {
    return `${title} completed. Primary result: ${this.formatNumber(primaryValue)}`;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  private formatPercent(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(value);
  }

  private formatNumber(value: any): string {
    if (typeof value === 'number') {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    }
    return String(value);
  }

  private humanizeCalculationType(type: string): string {
    return type
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  private humanizeKey(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }
}

export const calculationFormatter = new CalculationFormatter();
