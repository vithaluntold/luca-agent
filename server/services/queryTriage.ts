/**
 * Intelligent Query Triage System
 * Classifies accounting queries by domain and complexity to route to optimal models and providers
 */

import { AIProviderName } from './aiProviders';

export interface QueryClassification {
  domain: 'tax' | 'audit' | 'financial_reporting' | 'compliance' | 'general_accounting' | 'advisory';
  subDomain?: string;
  jurisdiction?: string[];
  complexity: 'simple' | 'moderate' | 'complex' | 'expert';
  requiresCalculation: boolean;
  requiresResearch: boolean;
  requiresDocumentAnalysis: boolean;
  requiresRealTimeData: boolean;
  requiresDeepReasoning: boolean;
  keywords: string[];
  confidence: number;
}

export interface RoutingDecision {
  primaryModel: string;
  preferredProvider: AIProviderName;
  fallbackProviders: AIProviderName[];
  fallbackModels: string[];
  solversNeeded: string[];
  estimatedTokens: number;
  reasoning: string;
}

export class QueryTriageService {
  /**
   * Classifies a user query into accounting domain and complexity
   */
  classifyQuery(query: string): QueryClassification {
    const lowerQuery = query.toLowerCase();
    
    // Domain classification
    const domain = this.detectDomain(lowerQuery);
    const subDomain = this.detectSubDomain(lowerQuery, domain);
    const jurisdiction = this.detectJurisdiction(lowerQuery);
    const complexity = this.assessComplexity(lowerQuery);
    const requiresCalculation = this.needsCalculation(lowerQuery);
    const requiresResearch = this.needsResearch(lowerQuery);
    const requiresDocumentAnalysis = this.needsDocumentAnalysis(lowerQuery);
    const requiresRealTimeData = this.needsRealTimeData(lowerQuery);
    const requiresDeepReasoning = this.needsDeepReasoning(lowerQuery, complexity);
    const keywords = this.extractKeywords(lowerQuery);
    
    return {
      domain,
      subDomain,
      jurisdiction,
      complexity,
      requiresCalculation,
      requiresResearch,
      requiresDocumentAnalysis,
      requiresRealTimeData,
      requiresDeepReasoning,
      keywords,
      confidence: this.calculateConfidence(lowerQuery, domain)
    };
  }

  /**
   * Routes query to optimal model and provider based on classification
   */
  routeQuery(classification: QueryClassification, userTier: string): RoutingDecision {
    let primaryModel = 'gpt-4o';
    let preferredProvider: AIProviderName = AIProviderName.OPENAI;
    const fallbackProviders: AIProviderName[] = [];
    const fallbackModels: string[] = [];
    const solversNeeded: string[] = [];
    
    // Provider selection based on query characteristics
    if (classification.requiresDocumentAnalysis) {
      // Azure Document Intelligence for document parsing
      preferredProvider = AIProviderName.AZURE_DOCUMENT_INTELLIGENCE;
      fallbackProviders.push(AIProviderName.OPENAI, AIProviderName.CLAUDE);
      solversNeeded.push('document-parser');
    } else if (classification.requiresRealTimeData || classification.requiresResearch) {
      // Perplexity AI for real-time research and current data
      preferredProvider = AIProviderName.PERPLEXITY;
      fallbackProviders.push(AIProviderName.OPENAI, AIProviderName.CLAUDE);
      if (classification.requiresResearch) {
        solversNeeded.push('tax-case-law-search');
      }
    } else if (classification.requiresDeepReasoning || classification.complexity === 'expert') {
      // Claude 3.5 Sonnet for deep reasoning and complex analysis
      preferredProvider = AIProviderName.CLAUDE;
      fallbackProviders.push(AIProviderName.OPENAI);
      primaryModel = 'claude-3-5-sonnet-20241022';
      fallbackModels.push('gpt-4o');
    } else if (classification.complexity === 'simple' || classification.complexity === 'moderate') {
      // Gemini 2.0 Flash for cost-effective queries
      preferredProvider = AIProviderName.GEMINI;
      fallbackProviders.push(AIProviderName.OPENAI);
      primaryModel = 'gemini-2.0-flash-exp';
      fallbackModels.push('gpt-4o-mini', 'gpt-4o');
    } else {
      // Default: OpenAI for general queries
      preferredProvider = AIProviderName.OPENAI;
      primaryModel = 'gpt-4o';
      fallbackProviders.push(AIProviderName.CLAUDE, AIProviderName.GEMINI);
    }
    
    // Domain-specific model selection (overrides for enterprise tier)
    if (classification.domain === 'tax') {
      primaryModel = userTier === 'enterprise' ? 'luca-tax-expert' : primaryModel;
      
      if (classification.subDomain?.includes('international')) {
        solversNeeded.push('multi-jurisdiction-tax');
      }
      if (classification.requiresCalculation) {
        solversNeeded.push('tax-calculator');
      }
    } else if (classification.domain === 'audit') {
      primaryModel = userTier === 'enterprise' ? 'luca-audit-expert' : primaryModel;
      solversNeeded.push('risk-assessment');
      if (classification.requiresCalculation) {
        solversNeeded.push('materiality-calculator');
      }
    } else if (classification.domain === 'financial_reporting') {
      if (classification.subDomain?.includes('gaap') || classification.subDomain?.includes('ifrs')) {
        solversNeeded.push('standards-lookup');
      }
      if (classification.requiresCalculation) {
        solversNeeded.push('financial-metrics');
      }
    } else if (classification.domain === 'compliance') {
      solversNeeded.push('regulatory-check');
      if (classification.jurisdiction) {
        solversNeeded.push('jurisdiction-rules');
      }
    }
    
    // Always add financial calculator for any calculation needs
    if (classification.requiresCalculation && !solversNeeded.includes('tax-calculator')) {
      solversNeeded.push('financial-calculator');
    }
    
    // Add fallback provider (always OpenAI for now)
    if (preferredProvider !== AIProviderName.OPENAI) {
      fallbackProviders.push(AIProviderName.OPENAI);
    }
    
    const estimatedTokens = this.estimateTokenUsage(classification, primaryModel);
    const reasoning = this.buildRoutingReason(classification, primaryModel, preferredProvider, solversNeeded);
    
    return {
      primaryModel,
      preferredProvider,
      fallbackProviders,
      fallbackModels,
      solversNeeded,
      estimatedTokens,
      reasoning
    };
  }

  private detectDomain(query: string): QueryClassification['domain'] {
    const taxKeywords = ['tax', 'deduction', 'credit', 'irs', 'cra', 'hmrc', 'vat', 'gst', 'income tax', 'corporate tax', 'withholding'];
    const auditKeywords = ['audit', 'assurance', 'verification', 'material', 'risk assessment', 'internal control'];
    const reportingKeywords = ['gaap', 'ifrs', 'financial statement', 'balance sheet', 'income statement', 'cash flow'];
    const complianceKeywords = ['compliance', 'regulation', 'sox', 'sec', 'filing', 'disclosure'];
    
    if (taxKeywords.some(kw => query.includes(kw))) return 'tax';
    if (auditKeywords.some(kw => query.includes(kw))) return 'audit';
    if (reportingKeywords.some(kw => query.includes(kw))) return 'financial_reporting';
    if (complianceKeywords.some(kw => query.includes(kw))) return 'compliance';
    
    return 'general_accounting';
  }

  private detectSubDomain(query: string, domain: string): string | undefined {
    if (domain === 'tax') {
      if (query.includes('international') || query.includes('transfer pricing') || query.includes('treaty')) {
        return 'international_tax';
      }
      if (query.includes('corporate') || query.includes('c-corp') || query.includes('s-corp')) {
        return 'corporate_tax';
      }
      if (query.includes('individual') || query.includes('personal')) {
        return 'individual_tax';
      }
      if (query.includes('sales tax') || query.includes('vat') || query.includes('gst')) {
        return 'indirect_tax';
      }
    }
    
    if (domain === 'financial_reporting') {
      if (query.includes('gaap')) return 'us_gaap';
      if (query.includes('ifrs')) return 'ifrs';
    }
    
    return undefined;
  }

  private detectJurisdiction(query: string): string[] {
    const jurisdictions: string[] = [];
    
    const jurisdictionMap: Record<string, string[]> = {
      'us': ['united states', 'usa', 'u.s.', 'irs', 'delaware', 'california', 'new york'],
      'canada': ['canada', 'canadian', 'cra'],
      'uk': ['uk', 'united kingdom', 'britain', 'hmrc'],
      'eu': ['eu', 'european union', 'europe'],
      'australia': ['australia', 'australian', 'ato'],
      'india': ['india', 'indian', 'gst india'],
      'china': ['china', 'chinese', 'prc'],
      'singapore': ['singapore'],
      'hong_kong': ['hong kong', 'hk']
    };
    
    for (const [jurisdiction, keywords] of Object.entries(jurisdictionMap)) {
      if (keywords.some(kw => query.includes(kw))) {
        jurisdictions.push(jurisdiction);
      }
    }
    
    return jurisdictions.length > 0 ? jurisdictions : ['us']; // Default to US
  }

  private assessComplexity(query: string): QueryClassification['complexity'] {
    let complexityScore = 0;
    
    // Length indicates complexity
    if (query.length > 200) complexityScore += 2;
    else if (query.length > 100) complexityScore += 1;
    
    // Multiple questions
    if ((query.match(/\?/g) || []).length > 1) complexityScore += 1;
    
    // Technical terms
    const technicalTerms = ['consolidation', 'derivative', 'hedge', 'impairment', 'amortization', 
      'depreciation', 'transfer pricing', 'treaty', 'apportionment'];
    if (technicalTerms.some(term => query.includes(term))) complexityScore += 2;
    
    // Multiple jurisdictions
    if ((query.match(/and|&/g) || []).length > 1) complexityScore += 1;
    
    if (complexityScore >= 5) return 'expert';
    if (complexityScore >= 3) return 'complex';
    if (complexityScore >= 1) return 'moderate';
    return 'simple';
  }

  private needsCalculation(query: string): boolean {
    const calcKeywords = ['calculate', 'compute', 'how much', 'what is the', 'rate', 'amount', 
      'total', 'sum', 'npv', 'irr', 'depreciation', 'amortization', 'payment'];
    return calcKeywords.some(kw => query.includes(kw));
  }

  private needsResearch(query: string): boolean {
    const researchKeywords = ['case law', 'precedent', 'ruling', 'regulation', 'standard', 
      'guidance', 'interpretation', 'comparison', 'difference between'];
    return researchKeywords.some(kw => query.includes(kw));
  }

  private needsDocumentAnalysis(query: string): boolean {
    const docKeywords = ['analyze', 'review', 'document', 'statement', 'receipt', 'invoice', 
      'contract', 'extract', 'parse'];
    return docKeywords.some(kw => query.includes(kw));
  }

  private needsRealTimeData(query: string): boolean {
    const realtimeKeywords = ['current', 'latest', 'recent', 'today', 'now', 'real-time', 
      'current rate', 'latest ruling', 'recent changes'];
    return realtimeKeywords.some(kw => query.includes(kw));
  }

  private needsDeepReasoning(query: string, complexity: QueryClassification['complexity']): boolean {
    // Expert complexity always needs deep reasoning
    if (complexity === 'expert' || complexity === 'complex') return true;
    
    // Multi-step problems need deep reasoning
    const reasoningKeywords = ['explain why', 'compare', 'evaluate', 'analyze the impact', 
      'what would happen if', 'should i', 'best approach', 'recommend', 'strategy'];
    return reasoningKeywords.some(kw => query.includes(kw));
  }

  private extractKeywords(query: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'is', 'are', 'was', 'were', 'what', 'how', 'can', 'could', 'should']);
    
    return query
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 10);
  }

  private calculateConfidence(query: string, domain: string): number {
    // Simple confidence based on keyword matches
    if (query.length < 10) return 0.4;
    if (domain === 'general_accounting') return 0.6;
    return 0.85;
  }

  private estimateTokenUsage(classification: QueryClassification, model: string): number {
    let baseTokens = 500;
    
    if (classification.complexity === 'expert') baseTokens = 2000;
    else if (classification.complexity === 'complex') baseTokens = 1200;
    else if (classification.complexity === 'moderate') baseTokens = 800;
    
    if (classification.requiresResearch) baseTokens += 500;
    if (classification.requiresDocumentAnalysis) baseTokens += 300;
    
    return baseTokens;
  }

  private buildRoutingReason(
    classification: QueryClassification, 
    model: string,
    provider: AIProviderName,
    solvers: string[]
  ): string {
    let reason = `Classified as ${classification.domain} query with ${classification.complexity} complexity. `;
    reason += `Using ${provider} provider with ${model} model for optimal domain expertise. `;
    
    if (solvers.length > 0) {
      reason += `Engaging ${solvers.join(', ')} for enhanced accuracy.`;
    }
    
    return reason;
  }
}

export const queryTriageService = new QueryTriageService();
