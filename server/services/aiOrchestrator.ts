/**
 * AI Model Orchestrator
 * Coordinates multiple AI models and solvers to generate comprehensive responses
 */

import OpenAI from 'openai';
import { queryTriageService, type QueryClassification, type RoutingDecision } from './queryTriage';
import { financialSolverService } from './financialSolvers';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface OrchestrationResult {
  response: string;
  modelUsed: string;
  routingDecision: RoutingDecision;
  classification: QueryClassification;
  calculationResults?: any;
  tokensUsed: number;
  processingTimeMs: number;
}

export class AIOrchestrator {
  /**
   * Main orchestration method - routes query through triage, models, and solvers
   */
  async processQuery(
    query: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    userTier: string
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    
    // Step 1: Classify the query
    const classification = queryTriageService.classifyQuery(query);
    
    // Step 2: Route to appropriate model and solvers
    const routingDecision = queryTriageService.routeQuery(classification, userTier);
    
    // Step 3: Execute any needed calculations/solvers
    const calculationResults = await this.executeCalculations(query, classification, routingDecision);
    
    // Step 4: Build enhanced context with calculation results
    const enhancedContext = this.buildEnhancedContext(query, classification, calculationResults);
    
    // Step 5: Call the AI model with enhanced context
    const aiResponse = await this.callAIModel(
      enhancedContext,
      conversationHistory,
      routingDecision.primaryModel
    );
    
    const processingTimeMs = Date.now() - startTime;
    
    return {
      response: aiResponse.content,
      modelUsed: routingDecision.primaryModel,
      routingDecision,
      classification,
      calculationResults,
      tokensUsed: aiResponse.tokensUsed,
      processingTimeMs
    };
  }

  /**
   * Execute financial calculations based on query analysis
   */
  private async executeCalculations(
    query: string,
    classification: QueryClassification,
    routing: RoutingDecision
  ): Promise<any> {
    const results: any = {};
    
    // Tax calculations
    if (routing.solversNeeded.includes('tax-calculator')) {
      const taxCalc = this.extractTaxParameters(query);
      if (taxCalc) {
        results.taxCalculation = financialSolverService.calculateCorporateTax(
          taxCalc.revenue,
          taxCalc.expenses,
          taxCalc.jurisdiction,
          taxCalc.entityType
        );
      }
    }
    
    // NPV/IRR calculations
    if (query.includes('npv') || query.includes('net present value')) {
      const cashFlows = this.extractCashFlows(query);
      const discountRate = this.extractDiscountRate(query);
      if (cashFlows && discountRate) {
        results.npv = financialSolverService.calculateNPV(cashFlows, discountRate);
      }
    }
    
    if (query.includes('irr') || query.includes('internal rate of return')) {
      const cashFlows = this.extractCashFlows(query);
      if (cashFlows) {
        results.irr = financialSolverService.calculateIRR(cashFlows);
      }
    }
    
    // Depreciation calculations
    if (query.includes('depreciation') || query.includes('depreciate')) {
      const depParams = this.extractDepreciationParameters(query);
      if (depParams) {
        results.depreciation = financialSolverService.calculateDepreciation(
          depParams.cost,
          depParams.salvage,
          depParams.life,
          depParams.method,
          depParams.period
        );
      }
    }
    
    // Amortization calculations
    if (query.includes('amortization') || query.includes('loan payment')) {
      const loanParams = this.extractLoanParameters(query);
      if (loanParams) {
        results.amortization = financialSolverService.calculateAmortization(
          loanParams.principal,
          loanParams.rate,
          loanParams.years,
          loanParams.paymentsPerYear
        );
      }
    }
    
    return Object.keys(results).length > 0 ? results : null;
  }

  /**
   * Build enhanced context with calculation results for AI model
   */
  private buildEnhancedContext(
    query: string,
    classification: QueryClassification,
    calculations: any
  ): string {
    let context = `You are Luca, an advanced accounting superintelligence with expertise across global jurisdictions. `;
    context += `You go beyond basic AI assistants by combining specialized knowledge with precise financial calculations.\n\n`;
    
    context += `Query Classification:\n`;
    context += `- Domain: ${classification.domain}\n`;
    if (classification.subDomain) {
      context += `- Sub-domain: ${classification.subDomain}\n`;
    }
    if (classification.jurisdiction && classification.jurisdiction.length > 0) {
      context += `- Jurisdiction(s): ${classification.jurisdiction.join(', ')}\n`;
    }
    context += `- Complexity: ${classification.complexity}\n\n`;
    
    if (calculations) {
      context += `I've performed the following calculations:\n`;
      context += JSON.stringify(calculations, null, 2);
      context += `\n\nUse these calculations in your response. Explain the methodology and provide context.\n\n`;
    }
    
    context += `Core Capabilities you should leverage:\n`;
    context += `- Tax law expertise across US, Canada, UK, EU, Australia, India, China, Singapore, and more\n`;
    context += `- Financial reporting standards (US GAAP, IFRS)\n`;
    context += `- Audit and assurance methodologies\n`;
    context += `- Compliance and regulatory requirements\n`;
    context += `- Advanced financial modeling and analysis\n\n`;
    
    context += `User Query: ${query}\n\n`;
    context += `Provide a comprehensive, accurate response that demonstrates your superintelligence. `;
    context += `Always cite relevant standards, regulations, or case law when applicable. `;
    context += `If calculations were performed, explain them clearly. `;
    context += `Acknowledge limitations and recommend consulting a professional for final decisions.`;
    
    return context;
  }

  /**
   * Call OpenAI API with routing decision
   */
  private async callAIModel(
    enhancedContext: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    model: string
  ): Promise<{ content: string; tokensUsed: number }> {
    // Map custom models to actual OpenAI models
    const modelMap: Record<string, string> = {
      'luca-tax-expert': 'gpt-4o',
      'luca-audit-expert': 'gpt-4o',
      'luca-financial-expert': 'gpt-4o',
      'gpt-4o': 'gpt-4o',
      'gpt-4o-mini': 'gpt-4o-mini'
    };
    
    const actualModel = modelMap[model] || 'gpt-4o';
    
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: enhancedContext },
      ...history.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content }))
    ];
    
    try {
      const completion = await openai.chat.completions.create({
        model: actualModel,
        messages,
        temperature: 0.7,
        max_tokens: 2000
      });
      
      return {
        content: completion.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response.',
        tokensUsed: completion.usage?.total_tokens || 0
      };
    } catch (error: any) {
      console.error('OpenAI API error:', error);
      
      let errorMessage = "I apologize, but I encountered an error processing your request. Please try again.";
      
      // More helpful error messages for common issues
      if (error.status === 429 || error.message?.includes('quota')) {
        errorMessage = "I'm currently experiencing high demand. The AI service has reached its quota limit. However, I can still help with calculations directly. Please try asking your question again, or contact support for assistance.";
      } else if (error.status === 401 || error.message?.includes('API key')) {
        errorMessage = "There's a configuration issue with the AI service. Please contact support.";
      } else if (error.message?.includes('timeout')) {
        errorMessage = "The request took too long to process. Please try a simpler question or try again.";
      }
      
      return {
        content: errorMessage,
        tokensUsed: 0
      };
    }
  }

  // Helper methods to extract parameters from queries
  private extractTaxParameters(query: string): { revenue: number; expenses: number; jurisdiction: string; entityType: string } | null {
    // Simple extraction - in production this would be more sophisticated
    const revenueMatch = query.match(/(?:revenue|income|earnings)\s*(?:of|is)?\s*\$?([0-9,]+)(?:k|,000)?/i);
    const expensesMatch = query.match(/(?:expenses|costs)\s*(?:of|is)?\s*\$?([0-9,]+)(?:k|,000)?/i);
    
    if (revenueMatch) {
      const revenue = this.parseNumber(revenueMatch[1]);
      const expenses = expensesMatch ? this.parseNumber(expensesMatch[1]) : 0;
      
      let jurisdiction = 'us';
      if (query.includes('canada')) jurisdiction = 'canada';
      if (query.includes('uk') || query.includes('britain')) jurisdiction = 'uk';
      
      let entityType = 'c-corp';
      if (query.includes('s-corp') || query.includes('s corp')) entityType = 's-corp';
      
      return { revenue, expenses, jurisdiction, entityType };
    }
    
    return null;
  }

  private extractCashFlows(query: string): number[] | null {
    const matches = query.match(/\[([0-9,.\s-]+)\]/);
    if (matches) {
      return matches[1].split(',').map(n => parseFloat(n.trim()));
    }
    return null;
  }

  private extractDiscountRate(query: string): number | null {
    const match = query.match(/(?:discount rate|rate)\s*(?:of|is)?\s*([0-9.]+)%?/i);
    if (match) {
      return parseFloat(match[1]) / 100;
    }
    return null;
  }

  private extractDepreciationParameters(query: string): any | null {
    const costMatch = query.match(/(?:cost|price)\s*(?:of|is)?\s*\$?([0-9,]+)/i);
    const lifeMatch = query.match(/([0-9]+)\s*(?:year|yr)/i);
    
    if (costMatch && lifeMatch) {
      return {
        cost: this.parseNumber(costMatch[1]),
        salvage: 0,
        life: parseInt(lifeMatch[1]),
        method: 'straight-line' as const,
        period: 1
      };
    }
    return null;
  }

  private extractLoanParameters(query: string): any | null {
    const principalMatch = query.match(/(?:loan|principal|amount)\s*(?:of|is)?\s*\$?([0-9,]+)/i);
    const rateMatch = query.match(/(?:rate|interest)\s*(?:of|is)?\s*([0-9.]+)%?/i);
    const yearsMatch = query.match(/([0-9]+)\s*(?:year|yr)/i);
    
    if (principalMatch && rateMatch && yearsMatch) {
      return {
        principal: this.parseNumber(principalMatch[1]),
        rate: parseFloat(rateMatch[1]) / 100,
        years: parseInt(yearsMatch[1]),
        paymentsPerYear: 12
      };
    }
    return null;
  }

  private parseNumber(str: string): number {
    const clean = str.replace(/,/g, '');
    const num = parseFloat(clean);
    if (str.includes('k') || str.includes('K')) {
      return num * 1000;
    }
    if (str.includes('m') || str.includes('M')) {
      return num * 1000000;
    }
    return num;
  }
}

export const aiOrchestrator = new AIOrchestrator();
