import { db } from "../db";
import { scenarioRuns, scenarioMetrics, scenarioComparisons, scenarioVariants } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * ScenarioSolver - Runs financial simulations for tax and audit scenarios
 * 
 * This service performs sophisticated tax calculations comparing different entity structures,
 * deduction strategies, and jurisdictions to help CPAs advise clients on optimal tax positions.
 */
export class ScenarioSolver {
  /**
   * Run a complete simulation comparing baseline scenario against variants
   */
  static async runSimulation(playbook: any, variantIds: string[]) {
    const runId = crypto.randomUUID();
    
    try {
      // Create run record
      const [run] = await db.insert(scenarioRuns).values({
        playbookId: playbook.id,
        status: 'running',
        startedAt: new Date()
      }).returning();
      
      // Calculate baseline metrics
      const baselineMetrics = await this.calculateTaxMetrics(playbook.baselineConfig);
      
      // Store baseline metrics
      await db.insert(scenarioMetrics).values({
        runId: run.id,
        variantId: null, // null = baseline
        metricName: 'tax_liability',
        metricValue: baselineMetrics.taxLiability,
        unit: 'usd'
      });
      
      await db.insert(scenarioMetrics).values({
        runId: run.id,
        variantId: null,
        metricName: 'effective_tax_rate',
        metricValue: baselineMetrics.effectiveTaxRate,
        unit: 'percentage'
      });
      
      await db.insert(scenarioMetrics).values({
        runId: run.id,
        variantId: null,
        metricName: 'qbi_deduction',
        metricValue: baselineMetrics.qbiDeduction,
        unit: 'usd'
      });
      
      await db.insert(scenarioMetrics).values({
        runId: run.id,
        variantId: null,
        metricName: 'audit_risk_score',
        metricValue: baselineMetrics.auditRiskScore,
        unit: 'score'
      });
      
      // Calculate each variant
      const variantResults = [];
      
      if (variantIds.length > 0) {
        const variants = await db
          .select()
          .from(scenarioVariants)
          .where(eq(scenarioVariants.playbookId, playbook.id));
        
        for (const variant of variants) {
          if (variantIds.includes(variant.id)) {
            const variantMetrics = await this.calculateTaxMetrics({
              ...playbook.baselineConfig,
              ...variant.alternativeAssumptions
            });
            
            // Store variant metrics
            await db.insert(scenarioMetrics).values({
              runId: run.id,
              variantId: variant.id,
              metricName: 'tax_liability',
              metricValue: variantMetrics.taxLiability,
              unit: 'usd'
            });
            
            await db.insert(scenarioMetrics).values({
              runId: run.id,
              variantId: variant.id,
              metricName: 'effective_tax_rate',
              metricValue: variantMetrics.effectiveTaxRate,
              unit: 'percentage'
            });
            
            await db.insert(scenarioMetrics).values({
              runId: run.id,
              variantId: variant.id,
              metricName: 'qbi_deduction',
              metricValue: variantMetrics.qbiDeduction,
              unit: 'usd'
            });
            
            await db.insert(scenarioMetrics).values({
              runId: run.id,
              variantId: variant.id,
              metricName: 'audit_risk_score',
              metricValue: variantMetrics.auditRiskScore,
              unit: 'score'
            });
            
            // Create comparison
            const savings = baselineMetrics.taxLiability - variantMetrics.taxLiability;
            const recommendation = savings > 0 
              ? `${variant.name} saves $${savings.toLocaleString()} annually compared to baseline`
              : `Baseline is more favorable by $${Math.abs(savings).toLocaleString()}`;
            
            await db.insert(scenarioComparisons).values({
              runId: run.id,
              baselineVariantId: null,
              comparisonVariantId: variant.id,
              differences: {
                taxLiability: variantMetrics.taxLiability - baselineMetrics.taxLiability,
                effectiveTaxRate: variantMetrics.effectiveTaxRate - baselineMetrics.effectiveTaxRate,
                qbiDeduction: variantMetrics.qbiDeduction - baselineMetrics.qbiDeduction,
                auditRiskScore: variantMetrics.auditRiskScore - baselineMetrics.auditRiskScore
              },
              recommendation
            });
            
            variantResults.push({
              variant,
              metrics: variantMetrics,
              savings
            });
          }
        }
      }
      
      // Mark run as completed
      await db.update(scenarioRuns)
        .set({ 
          status: 'completed',
          completedAt: new Date()
        })
        .where(eq(scenarioRuns.id, run.id));
      
      return {
        runId: run.id,
        baseline: baselineMetrics,
        variants: variantResults
      };
    } catch (error) {
      // Mark run as failed
      await db.update(scenarioRuns)
        .set({ 
          status: 'failed',
          completedAt: new Date()
        })
        .where(eq(scenarioRuns.id, runId));
      
      throw error;
    }
  }
  
  /**
   * Calculate tax metrics for a given scenario configuration
   */
  private static async calculateTaxMetrics(config: any) {
    const { 
      jurisdiction, 
      entityType, 
      taxYear, 
      grossIncome, 
      deductions,
      homeOfficeMethod 
    } = config;
    
    // Base federal tax calculation
    let taxableIncome = grossIncome - deductions;
    
    // QBI Deduction (20% for pass-through entities)
    let qbiDeduction = 0;
    if (['llc', 's-corp', 'partnership'].includes(entityType.toLowerCase())) {
      qbiDeduction = Math.min(taxableIncome * 0.20, 50000); // Simplified
    }
    
    taxableIncome -= qbiDeduction;
    
    // Federal tax brackets (2024 simplified)
    let federalTax = 0;
    if (taxableIncome <= 11600) {
      federalTax = taxableIncome * 0.10;
    } else if (taxableIncome <= 47150) {
      federalTax = 1160 + (taxableIncome - 11600) * 0.12;
    } else if (taxableIncome <= 100525) {
      federalTax = 5426 + (taxableIncome - 47150) * 0.22;
    } else if (taxableIncome <= 191950) {
      federalTax = 17168.50 + (taxableIncome - 100525) * 0.24;
    } else if (taxableIncome <= 243725) {
      federalTax = 39110.50 + (taxableIncome - 191950) * 0.32;
    } else if (taxableIncome <= 609350) {
      federalTax = 55678.50 + (taxableIncome - 243725) * 0.35;
    } else {
      federalTax = 183647.25 + (taxableIncome - 609350) * 0.37;
    }
    
    // State tax (simplified by jurisdiction)
    const stateTaxRates: Record<string, number> = {
      'california': 0.093,
      'delaware': 0.066,
      'texas': 0,
      'new-york': 0.0685,
      'florida': 0
    };
    
    const stateTax = taxableIncome * (stateTaxRates[jurisdiction.toLowerCase()] || 0);
    
    // Self-employment tax for certain entities
    let selfEmploymentTax = 0;
    if (['llc', 'sole-proprietorship'].includes(entityType.toLowerCase())) {
      selfEmploymentTax = grossIncome * 0.1413; // 14.13% simplified
    }
    
    const totalTax = federalTax + stateTax + selfEmploymentTax;
    const effectiveTaxRate = (totalTax / grossIncome) * 100;
    
    // Audit risk scoring (simplified heuristic)
    let auditRiskScore = 0;
    
    // Higher deduction percentage increases risk
    const deductionPercentage = (deductions / grossIncome) * 100;
    if (deductionPercentage > 50) auditRiskScore += 30;
    else if (deductionPercentage > 30) auditRiskScore += 15;
    
    // Home office deduction adds risk
    if (homeOfficeMethod === 'actual') auditRiskScore += 20;
    else if (homeOfficeMethod === 'simplified') auditRiskScore += 10;
    
    // High QBI deduction adds scrutiny
    if (qbiDeduction > 30000) auditRiskScore += 15;
    
    // Entity type risk factors
    if (entityType.toLowerCase() === 's-corp') auditRiskScore += 10; // IRS watches S-corp salary distributions
    if (entityType.toLowerCase() === 'c-corp') auditRiskScore += 5;
    
    return {
      taxLiability: Math.round(totalTax),
      effectiveTaxRate: Math.round(effectiveTaxRate * 100) / 100,
      qbiDeduction: Math.round(qbiDeduction),
      auditRiskScore: Math.min(auditRiskScore, 100) // Cap at 100
    };
  }
}
