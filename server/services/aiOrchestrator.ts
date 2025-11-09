/**
 * AI Model Orchestrator
 * Coordinates multiple AI models and solvers to generate comprehensive responses
 */

import { queryTriageService, type QueryClassification, type RoutingDecision } from './queryTriage';
import { financialSolverService } from './financialSolvers';
import { aiProviderRegistry, AIProviderName, ProviderError } from './aiProviders';

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
    
    // Step 5: Call the AI provider with enhanced context and provider routing
    const aiResponse = await this.callAIModel(
      enhancedContext,
      conversationHistory,
      routingDecision.primaryModel,
      routingDecision.preferredProvider,
      routingDecision.fallbackProviders
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
   * Call AI provider with routing decision (multi-provider architecture with fallback)
   */
  private async callAIModel(
    enhancedContext: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    model: string,
    preferredProvider?: AIProviderName,
    fallbackProviders?: AIProviderName[]
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
    
    const messages = [
      { role: 'system' as const, content: enhancedContext },
      ...history.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content }))
    ];
    
    // Build provider chain: preferred first, then fallbacks, then OpenAI as ultimate fallback
    const providerChain: AIProviderName[] = [];
    if (preferredProvider) {
      providerChain.push(preferredProvider);
    }
    if (fallbackProviders && fallbackProviders.length > 0) {
      providerChain.push(...fallbackProviders);
    }
    // Ensure OpenAI is always in the chain as ultimate fallback
    if (!providerChain.includes(AIProviderName.OPENAI)) {
      providerChain.push(AIProviderName.OPENAI);
    }
    
    // Try each provider in the chain
    for (let i = 0; i < providerChain.length; i++) {
      const providerName = providerChain[i];
      const isLastProvider = i === providerChain.length - 1;
      
      try {
        const provider = aiProviderRegistry.getProvider(providerName);
        
        console.log(`[AIOrchestrator] Attempting provider: ${providerName} (${i + 1}/${providerChain.length})`);
        
        const response = await provider.generateCompletion({
          messages,
          model: actualModel,
          temperature: 0.7,
          maxTokens: 2000,
        });
        
        console.log(`[AIOrchestrator] Success with provider: ${providerName}`);
        
        return {
          content: response.content,
          tokensUsed: response.tokensUsed.total
        };
      } catch (error: any) {
        // Log the error
        if (error instanceof ProviderError) {
          console.error(`[AIOrchestrator] ${error.provider} error: ${error.message}`);
          
          // If this is the last provider in the chain, return a user-friendly error
          if (isLastProvider) {
            return {
              content: this.buildFallbackErrorMessage(error),
              tokensUsed: 0
            };
          }
          
          // Otherwise, continue to next provider if error is retryable
          if (!error.retryable) {
            console.log(`[AIOrchestrator] Non-retryable error, trying next provider...`);
            continue;
          }
        } else {
          console.error(`[AIOrchestrator] Unexpected error with ${providerName}:`, error);
          
          // If this is the last provider, return generic error
          if (isLastProvider) {
            return {
              content: "I apologize, but I encountered an error processing your request. Please try again.",
              tokensUsed: 0
            };
          }
        }
        
        // Continue to next provider
        console.log(`[AIOrchestrator] Falling back to next provider...`);
      }
    }
    
    // This should never be reached, but just in case
    return {
      content: "I apologize, but all AI providers are currently unavailable. Please try again later.",
      tokensUsed: 0
    };
  }

  /**
   * Build user-friendly error message from ProviderError
   */
  private buildFallbackErrorMessage(error: ProviderError): string {
    if (error.code === 'RATE_LIMIT_EXCEEDED' || error.message.includes('quota')) {
      return "I'm currently experiencing high demand. The AI service has reached its quota limit. However, I can still help with calculations directly. Please try asking your question again, or contact support for assistance.";
    } else if (error.code === 'AUTHENTICATION_ERROR' || error.message.includes('API key')) {
      return "There's a configuration issue with the AI service. Please contact support.";
    } else if (error.code === 'TIMEOUT_ERROR' || error.message.includes('timeout')) {
      return "The request took too long to process. Please try a simpler question or try again.";
    }
    
    return "I apologize, but I encountered an error processing your request. Please try again.";
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
