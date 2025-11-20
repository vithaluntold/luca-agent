/**
 * Excel Orchestrator Service
 * Comprehensive Excel integration for calculation mode
 * Enables AI-driven spreadsheet operations, formula management, and dynamic table creation
 */

import ExcelJS from 'exceljs';
import { FinancialSolverService } from './financialSolvers';

export interface SpreadsheetRequest {
  operation: 'create' | 'modify' | 'calculate' | 'analyze';
  data?: any[][];
  formulas?: FormulaDefinition[];
  tables?: TableDefinition[];
  charts?: ChartDefinition[];
  formatting?: FormattingOptions;
  calculations?: CalculationRequest[];
}

export interface FormulaDefinition {
  cell: string;
  formula: string;
  description?: string;
}

export interface TableDefinition {
  name: string;
  range: string;
  headers: string[];
  data: any[][];
  totals?: boolean;
  style?: 'light' | 'medium' | 'dark';
}

export interface ChartDefinition {
  type: 'line' | 'bar' | 'pie' | 'scatter' | 'area';
  title: string;
  dataRange: string;
  position?: { col: number; row: number };
}

export interface FormattingOptions {
  numberFormat?: string;
  currency?: string;
  dateFormat?: string;
  conditionalFormatting?: ConditionalFormat[];
}

export interface ConditionalFormat {
  range: string;
  rule: 'greaterThan' | 'lessThan' | 'between' | 'dataBar' | 'colorScale';
  values?: number[];
  colors?: string[];
}

export interface CalculationRequest {
  type: 'tax' | 'npv' | 'irr' | 'depreciation' | 'amortization' | 'loan' | 'custom';
  inputs: Record<string, number | string>;
  outputLocation?: string;
}

export interface ExcelOperationResult {
  workbook: ExcelJS.Workbook;
  buffer: Buffer;
  summary: string;
  formulasUsed: FormulaDefinition[];
  tablesCreated: string[];
}

export class ExcelOrchestrator {
  private financialSolver: FinancialSolverService;

  constructor() {
    this.financialSolver = new FinancialSolverService();
  }

  /**
   * Parse natural language request and convert to spreadsheet operations
   */
  async parseUserRequest(userQuery: string, uploadedData?: any[][]): Promise<SpreadsheetRequest> {
    // AI will analyze the query and determine what operations are needed
    const request: SpreadsheetRequest = {
      operation: 'create',
      data: uploadedData,
      tables: [],
      formulas: [],
      calculations: []
    };

    // Extract calculation requirements from query
    if (userQuery.toLowerCase().includes('tax')) {
      request.calculations?.push({
        type: 'tax',
        inputs: {},
        outputLocation: 'B10'
      });
    }

    if (userQuery.toLowerCase().includes('npv') || userQuery.toLowerCase().includes('net present value')) {
      request.calculations?.push({
        type: 'npv',
        inputs: {},
        outputLocation: 'B15'
      });
    }

    return request;
  }

  /**
   * Create comprehensive Excel workbook with calculations
   */
  async createCalculationWorkbook(request: SpreadsheetRequest): Promise<ExcelOperationResult> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Calculations', {
      properties: { tabColor: { argb: 'FF0066CC' } }
    });

    const formulasUsed: FormulaDefinition[] = [];
    const tablesCreated: string[] = [];
    let currentRow = 2;

    // Add company/user branding
    this.addHeader(sheet);

    // Process calculations
    if (request.calculations) {
      for (const calc of request.calculations) {
        const result = await this.executeCalculation(calc, sheet, currentRow);
        formulasUsed.push(...result.formulas);
        currentRow = result.nextRow;
      }
    }

    // Process tables
    if (request.tables) {
      for (const table of request.tables) {
        this.createTable(sheet, table, currentRow);
        tablesCreated.push(table.name);
        currentRow += table.data.length + 4;
      }
    }

    // Process raw data if provided
    if (request.data && request.data.length > 0) {
      this.addDataWithHeaders(sheet, request.data, currentRow);
      currentRow += request.data.length + 3;
    }

    // Apply formatting
    this.applyStandardFormatting(sheet, request.formatting);

    const workbookBuffer = await workbook.xlsx.writeBuffer();

    return {
      workbook,
      buffer: Buffer.from(workbookBuffer),
      summary: this.generateSummary(formulasUsed, tablesCreated, request),
      formulasUsed,
      tablesCreated
    };
  }

  /**
   * Execute specific calculation and add to worksheet
   */
  private async executeCalculation(
    calc: CalculationRequest,
    sheet: ExcelJS.Worksheet,
    startRow: number
  ): Promise<{ formulas: FormulaDefinition[]; nextRow: number }> {
    const formulas: FormulaDefinition[] = [];
    let currentRow = startRow;

    switch (calc.type) {
      case 'tax':
        return this.addTaxCalculation(sheet, calc.inputs, currentRow);
      case 'npv':
        return this.addNPVCalculation(sheet, calc.inputs, currentRow);
      case 'irr':
        return this.addIRRCalculation(sheet, calc.inputs, currentRow);
      case 'depreciation':
        return this.addDepreciationSchedule(sheet, calc.inputs, currentRow);
      case 'amortization':
        return this.addAmortizationSchedule(sheet, calc.inputs, currentRow);
      case 'loan':
        return this.addLoanCalculation(sheet, calc.inputs, currentRow);
      default:
        return { formulas, nextRow: currentRow };
    }
  }

  /**
   * Add tax calculation with formulas
   */
  private addTaxCalculation(
    sheet: ExcelJS.Worksheet,
    inputs: Record<string, any>,
    startRow: number
  ): { formulas: FormulaDefinition[]; nextRow: number } {
    const formulas: FormulaDefinition[] = [];
    let row = startRow;

    // Title
    const titleCell = sheet.getCell(`A${row}`);
    titleCell.value = 'Tax Calculation';
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF0066CC' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F0FF' }
    };
    row += 2;

    // Revenue
    sheet.getCell(`A${row}`).value = 'Revenue';
    sheet.getCell(`B${row}`).value = inputs.revenue || 1000000;
    sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
    row++;

    // Expenses
    sheet.getCell(`A${row}`).value = 'Expenses';
    sheet.getCell(`B${row}`).value = inputs.expenses || 600000;
    sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
    row++;

    // Taxable Income Formula
    sheet.getCell(`A${row}`).value = 'Taxable Income';
    sheet.getCell(`B${row}`).value = { formula: `B${startRow + 2}-B${startRow + 3}` };
    sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
    formulas.push({
      cell: `B${row}`,
      formula: `B${startRow + 2}-B${startRow + 3}`,
      description: 'Revenue minus Expenses'
    });
    row++;

    // Federal Tax Rate
    sheet.getCell(`A${row}`).value = 'Federal Tax Rate';
    sheet.getCell(`B${row}`).value = 0.21;
    sheet.getCell(`B${row}`).numFmt = '0.00%';
    row++;

    // State Tax Rate
    sheet.getCell(`A${row}`).value = 'State Tax Rate (Avg)';
    sheet.getCell(`B${row}`).value = 0.06;
    sheet.getCell(`B${row}`).numFmt = '0.00%';
    row++;

    // Federal Tax Calculated
    sheet.getCell(`A${row}`).value = 'Federal Tax';
    sheet.getCell(`B${row}`).value = { formula: `B${row - 2}*B${row - 1}` };
    sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
    formulas.push({
      cell: `B${row}`,
      formula: `B${row - 2}*B${row - 1}`,
      description: 'Taxable Income × Federal Rate'
    });
    row++;

    // State Tax Calculated
    sheet.getCell(`A${row}`).value = 'State Tax';
    sheet.getCell(`B${row}`).value = { formula: `B${row - 3}*B${row - 2}` };
    sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
    formulas.push({
      cell: `B${row}`,
      formula: `B${row - 3}*B${row - 2}`,
      description: 'Taxable Income × State Rate'
    });
    row++;

    // Total Tax
    sheet.getCell(`A${row}`).value = 'Total Tax';
    sheet.getCell(`A${row}`).font = { bold: true };
    sheet.getCell(`B${row}`).value = { formula: `B${row - 1}+B${row - 2}` };
    sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
    sheet.getCell(`B${row}`).font = { bold: true };
    sheet.getCell(`B${row}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFEB3B' }
    };
    formulas.push({
      cell: `B${row}`,
      formula: `B${row - 1}+B${row - 2}`,
      description: 'Federal Tax + State Tax'
    });
    row++;

    // Effective Tax Rate
    sheet.getCell(`A${row}`).value = 'Effective Tax Rate';
    sheet.getCell(`B${row}`).value = { formula: `B${row - 1}/B${row - 5}` };
    sheet.getCell(`B${row}`).numFmt = '0.00%';
    formulas.push({
      cell: `B${row}`,
      formula: `B${row - 1}/B${row - 5}`,
      description: 'Total Tax ÷ Taxable Income'
    });

    return { formulas, nextRow: row + 3 };
  }

  /**
   * Add NPV calculation
   */
  private addNPVCalculation(
    sheet: ExcelJS.Worksheet,
    inputs: Record<string, any>,
    startRow: number
  ): { formulas: FormulaDefinition[]; nextRow: number } {
    const formulas: FormulaDefinition[] = [];
    let row = startRow;

    // Title
    const titleCell = sheet.getCell(`A${row}`);
    titleCell.value = 'Net Present Value (NPV) Calculation';
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF0066CC' } };
    row += 2;

    // Discount Rate
    sheet.getCell(`A${row}`).value = 'Discount Rate';
    sheet.getCell(`B${row}`).value = inputs.discountRate || 0.10;
    sheet.getCell(`B${row}`).numFmt = '0.00%';
    const discountRow = row;
    row++;

    // Initial Investment
    sheet.getCell(`A${row}`).value = 'Initial Investment';
    sheet.getCell(`B${row}`).value = inputs.initialInvestment || -100000;
    sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
    row += 2;

    // Cash Flows
    sheet.getCell(`A${row}`).value = 'Year';
    sheet.getCell(`B${row}`).value = 'Cash Flow';
    sheet.getCell(`C${row}`).value = 'Present Value';
    row++;

    const cashFlows = inputs.cashFlows || [30000, 35000, 40000, 45000, 50000];
    const cashFlowStartRow = row;
    
    for (let year = 0; year < cashFlows.length; year++) {
      sheet.getCell(`A${row}`).value = year + 1;
      sheet.getCell(`B${row}`).value = cashFlows[year];
      sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
      
      // PV formula: CF / (1 + r)^year
      const pvFormula = `B${row}/(1+$B$${discountRow})^A${row}`;
      sheet.getCell(`C${row}`).value = { formula: pvFormula };
      sheet.getCell(`C${row}`).numFmt = '$#,##0.00';
      formulas.push({
        cell: `C${row}`,
        formula: pvFormula,
        description: `Present Value of Year ${year + 1} cash flow`
      });
      row++;
    }

    row++;
    // NPV Formula
    sheet.getCell(`A${row}`).value = 'Net Present Value';
    sheet.getCell(`A${row}`).font = { bold: true };
    const npvFormula = `B${discountRow + 1}+SUM(C${cashFlowStartRow}:C${row - 1})`;
    sheet.getCell(`B${row}`).value = { formula: npvFormula };
    sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
    sheet.getCell(`B${row}`).font = { bold: true };
    sheet.getCell(`B${row}`).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4CAF50' }
    };
    formulas.push({
      cell: `B${row}`,
      formula: npvFormula,
      description: 'Initial Investment + Sum of Present Values'
    });

    return { formulas, nextRow: row + 3 };
  }

  /**
   * Add IRR calculation
   */
  private addIRRCalculation(
    sheet: ExcelJS.Worksheet,
    inputs: Record<string, any>,
    startRow: number
  ): { formulas: FormulaDefinition[]; nextRow: number } {
    const formulas: FormulaDefinition[] = [];
    let row = startRow;

    // Title
    sheet.getCell(`A${row}`).value = 'Internal Rate of Return (IRR)';
    sheet.getCell(`A${row}`).font = { bold: true, size: 14 };
    row += 2;

    // Cash flows
    sheet.getCell(`A${row}`).value = 'Period';
    sheet.getCell(`B${row}`).value = 'Cash Flow';
    row++;

    const cashFlows = inputs.cashFlows || [-100000, 30000, 35000, 40000, 45000];
    const cashFlowStartRow = row;
    
    for (let i = 0; i < cashFlows.length; i++) {
      sheet.getCell(`A${row}`).value = i;
      sheet.getCell(`B${row}`).value = cashFlows[i];
      sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
      row++;
    }

    row++;
    // IRR Formula
    sheet.getCell(`A${row}`).value = 'IRR';
    sheet.getCell(`A${row}`).font = { bold: true };
    const irrFormula = `IRR(B${cashFlowStartRow}:B${row - 2})`;
    sheet.getCell(`B${row}`).value = { formula: irrFormula };
    sheet.getCell(`B${row}`).numFmt = '0.00%';
    sheet.getCell(`B${row}`).font = { bold: true };
    formulas.push({
      cell: `B${row}`,
      formula: irrFormula,
      description: 'Internal Rate of Return'
    });

    return { formulas, nextRow: row + 3 };
  }

  /**
   * Add depreciation schedule
   */
  private addDepreciationSchedule(
    sheet: ExcelJS.Worksheet,
    inputs: Record<string, any>,
    startRow: number
  ): { formulas: FormulaDefinition[]; nextRow: number } {
    const formulas: FormulaDefinition[] = [];
    let row = startRow;

    const assetCost = inputs.assetCost || 100000;
    const salvageValue = inputs.salvageValue || 10000;
    const usefulLife = inputs.usefulLife || 5;
    const method = inputs.method || 'straight-line';

    // Title
    sheet.getCell(`A${row}`).value = `Depreciation Schedule (${method})`;
    sheet.getCell(`A${row}`).font = { bold: true, size: 14 };
    row += 2;

    // Inputs
    sheet.getCell(`A${row}`).value = 'Asset Cost';
    sheet.getCell(`B${row}`).value = assetCost;
    sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
    const costRow = row;
    row++;

    sheet.getCell(`A${row}`).value = 'Salvage Value';
    sheet.getCell(`B${row}`).value = salvageValue;
    sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
    const salvageRow = row;
    row++;

    sheet.getCell(`A${row}`).value = 'Useful Life (years)';
    sheet.getCell(`B${row}`).value = usefulLife;
    const lifeRow = row;
    row += 2;

    // Schedule headers
    sheet.getCell(`A${row}`).value = 'Year';
    sheet.getCell(`B${row}`).value = 'Beginning Balance';
    sheet.getCell(`C${row}`).value = 'Depreciation';
    sheet.getCell(`D${row}`).value = 'Ending Balance';
    sheet.getCell(`E${row}`).value = 'Accumulated Dep.';
    row++;

    const scheduleStartRow = row;
    
    for (let year = 1; year <= usefulLife; year++) {
      sheet.getCell(`A${row}`).value = year;
      
      // Beginning Balance
      if (year === 1) {
        sheet.getCell(`B${row}`).value = { formula: `B${costRow}` };
      } else {
        sheet.getCell(`B${row}`).value = { formula: `D${row - 1}` };
      }
      sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
      
      // Depreciation (straight-line)
      const depFormula = `(B${costRow}-B${salvageRow})/B${lifeRow}`;
      sheet.getCell(`C${row}`).value = { formula: depFormula };
      sheet.getCell(`C${row}`).numFmt = '$#,##0.00';
      
      // Ending Balance
      sheet.getCell(`D${row}`).value = { formula: `B${row}-C${row}` };
      sheet.getCell(`D${row}`).numFmt = '$#,##0.00';
      
      // Accumulated Depreciation
      if (year === 1) {
        sheet.getCell(`E${row}`).value = { formula: `C${row}` };
      } else {
        sheet.getCell(`E${row}`).value = { formula: `E${row - 1}+C${row}` };
      }
      sheet.getCell(`E${row}`).numFmt = '$#,##0.00';
      
      row++;
    }

    formulas.push({
      cell: `C${scheduleStartRow}`,
      formula: `(B${costRow}-B${salvageRow})/B${lifeRow}`,
      description: 'Straight-line depreciation per year'
    });

    return { formulas, nextRow: row + 3 };
  }

  /**
   * Add amortization schedule
   */
  private addAmortizationSchedule(
    sheet: ExcelJS.Worksheet,
    inputs: Record<string, any>,
    startRow: number
  ): { formulas: FormulaDefinition[]; nextRow: number } {
    const formulas: FormulaDefinition[] = [];
    let row = startRow;

    const principal = inputs.loanAmount || 200000;
    const annualRate = inputs.interestRate || 0.05;
    const years = inputs.term || 30;
    const monthlyRate = annualRate / 12;
    const numPayments = years * 12;

    // Title
    sheet.getCell(`A${row}`).value = 'Loan Amortization Schedule';
    sheet.getCell(`A${row}`).font = { bold: true, size: 14 };
    row += 2;

    // Loan details
    sheet.getCell(`A${row}`).value = 'Loan Amount';
    sheet.getCell(`B${row}`).value = principal;
    sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
    const principalRow = row;
    row++;

    sheet.getCell(`A${row}`).value = 'Annual Interest Rate';
    sheet.getCell(`B${row}`).value = annualRate;
    sheet.getCell(`B${row}`).numFmt = '0.00%';
    const rateRow = row;
    row++;

    sheet.getCell(`A${row}`).value = 'Loan Term (years)';
    sheet.getCell(`B${row}`).value = years;
    const termRow = row;
    row++;

    sheet.getCell(`A${row}`).value = 'Monthly Payment';
    const pmtFormula = `PMT(B${rateRow}/12,B${termRow}*12,-B${principalRow})`;
    sheet.getCell(`B${row}`).value = { formula: pmtFormula };
    sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
    sheet.getCell(`B${row}`).font = { bold: true };
    const pmtRow = row;
    formulas.push({
      cell: `B${row}`,
      formula: pmtFormula,
      description: 'Monthly payment calculation using PMT function'
    });
    row += 2;

    // Schedule headers (first 12 months)
    sheet.getCell(`A${row}`).value = 'Month';
    sheet.getCell(`B${row}`).value = 'Beginning Balance';
    sheet.getCell(`C${row}`).value = 'Payment';
    sheet.getCell(`D${row}`).value = 'Principal';
    sheet.getCell(`E${row}`).value = 'Interest';
    sheet.getCell(`F${row}`).value = 'Ending Balance';
    row++;

    const scheduleStart = row;
    
    // Show first 12 months
    for (let month = 1; month <= Math.min(12, numPayments); month++) {
      sheet.getCell(`A${row}`).value = month;
      
      // Beginning Balance
      if (month === 1) {
        sheet.getCell(`B${row}`).value = { formula: `B${principalRow}` };
      } else {
        sheet.getCell(`B${row}`).value = { formula: `F${row - 1}` };
      }
      sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
      
      // Payment
      sheet.getCell(`C${row}`).value = { formula: `B${pmtRow}` };
      sheet.getCell(`C${row}`).numFmt = '$#,##0.00';
      
      // Interest
      sheet.getCell(`E${row}`).value = { formula: `B${row}*(B${rateRow}/12)` };
      sheet.getCell(`E${row}`).numFmt = '$#,##0.00';
      
      // Principal
      sheet.getCell(`D${row}`).value = { formula: `C${row}-E${row}` };
      sheet.getCell(`D${row}`).numFmt = '$#,##0.00';
      
      // Ending Balance
      sheet.getCell(`F${row}`).value = { formula: `B${row}-D${row}` };
      sheet.getCell(`F${row}`).numFmt = '$#,##0.00';
      
      row++;
    }

    return { formulas, nextRow: row + 3 };
  }

  /**
   * Add loan calculation
   */
  private addLoanCalculation(
    sheet: ExcelJS.Worksheet,
    inputs: Record<string, any>,
    startRow: number
  ): { formulas: FormulaDefinition[]; nextRow: number } {
    return this.addAmortizationSchedule(sheet, inputs, startRow);
  }

  /**
   * Create formatted table
   */
  private createTable(sheet: ExcelJS.Worksheet, table: TableDefinition, startRow: number) {
    let row = startRow;

    // Table name
    sheet.getCell(`A${row}`).value = table.name;
    sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    row += 2;

    // Headers
    table.headers.forEach((header, col) => {
      const cell = sheet.getCell(row, col + 1);
      cell.value = header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0066CC' }
      };
      cell.alignment = { horizontal: 'center' };
    });
    row++;

    // Data
    table.data.forEach((rowData) => {
      rowData.forEach((value, col) => {
        sheet.getCell(row, col + 1).value = value;
      });
      row++;
    });

    // Totals if requested
    if (table.totals) {
      table.headers.forEach((_, col) => {
        const cell = sheet.getCell(row, col + 1);
        if (col === 0) {
          cell.value = 'TOTAL';
          cell.font = { bold: true };
        } else {
          // Try to sum numeric columns
          const startDataRow = startRow + 3;
          cell.value = { formula: `SUM(${this.getColumnLetter(col + 1)}${startDataRow}:${this.getColumnLetter(col + 1)}${row - 1})` };
          cell.font = { bold: true };
        }
      });
    }
  }

  /**
   * Add raw data with automatic header detection
   */
  private addDataWithHeaders(sheet: ExcelJS.Worksheet, data: any[][], startRow: number) {
    let row = startRow;

    // Title
    sheet.getCell(`A${row}`).value = 'Uploaded Data';
    sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    row += 2;

    // Add data
    data.forEach((rowData, rowIndex) => {
      rowData.forEach((value, colIndex) => {
        const cell = sheet.getCell(row, colIndex + 1);
        cell.value = value;
        
        // Header styling for first row
        if (rowIndex === 0) {
          cell.font = { bold: true };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
          };
        }
      });
      row++;
    });
  }

  /**
   * Apply standard formatting
   */
  private applyStandardFormatting(sheet: ExcelJS.Worksheet, formatting?: FormattingOptions) {
    // Auto-fit columns
    sheet.columns.forEach((column) => {
      if (column && column.values) {
        let maxLength = 10;
        column.values.forEach((value) => {
          if (value) {
            const length = value.toString().length;
            if (length > maxLength) maxLength = length;
          }
        });
        column.width = Math.min(maxLength + 2, 50);
      }
    });

    // Apply borders to all cells with content
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value) {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
            right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
          };
        }
      });
    });
  }

  /**
   * Add header to worksheet
   */
  private addHeader(sheet: ExcelJS.Worksheet) {
    const headerCell = sheet.getCell('A1');
    headerCell.value = 'LucaAgent Financial Calculations';
    headerCell.font = { bold: true, size: 16, color: { argb: 'FF0066CC' } };
    headerCell.alignment = { horizontal: 'left', vertical: 'middle' };
    
    sheet.mergeCells('A1:F1');
    sheet.getRow(1).height = 30;
  }

  /**
   * Generate summary text
   */
  private generateSummary(
    formulas: FormulaDefinition[],
    tables: string[],
    request: SpreadsheetRequest
  ): string {
    let summary = 'Excel workbook created successfully.\n\n';
    
    if (formulas.length > 0) {
      summary += `Formulas used (${formulas.length}):\n`;
      formulas.forEach((f) => {
        summary += `  • ${f.cell}: ${f.formula}${f.description ? ` - ${f.description}` : ''}\n`;
      });
      summary += '\n';
    }
    
    if (tables.length > 0) {
      summary += `Tables created: ${tables.join(', ')}\n\n`;
    }
    
    summary += 'All formulas are preserved and editable in Excel.';
    return summary;
  }

  /**
   * Convert column number to letter
   */
  private getColumnLetter(col: number): string {
    let letter = '';
    while (col > 0) {
      const mod = (col - 1) % 26;
      letter = String.fromCharCode(65 + mod) + letter;
      col = Math.floor((col - mod) / 26);
    }
    return letter;
  }

  /**
   * Parse uploaded Excel file
   */
  async parseUploadedExcel(fileBuffer: ArrayBuffer | Buffer): Promise<any[][]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);
    
    const sheet = workbook.worksheets[0];
    const data: any[][] = [];
    
    sheet.eachRow((row) => {
      const rowData: any[] = [];
      row.eachCell((cell) => {
        rowData.push(cell.value);
      });
      data.push(rowData);
    });
    
    return data;
  }
}

export const excelOrchestrator = new ExcelOrchestrator();
