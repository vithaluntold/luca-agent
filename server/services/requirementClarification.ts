/**
 * Requirement Clarification Service
 * 
 * Analyzes user queries to identify missing context, ambiguities, and nuances
 * that a professional CPA/CA advisor would clarify before providing advice.
 * 
 * This makes Luca behave like an expert advisor who asks thoughtful questions
 * rather than jumping to generic answers like typical LLMs.
 */

export interface ClarificationContext {
  jurisdiction?: string;
  taxYear?: string;
  businessType?: string;
  filingStatus?: string;
  industrySpecific?: string;
  accountingMethod?: string;
  entityType?: string;
  stateProvince?: string;
}

export interface MissingContext {
  category: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  suggestedQuestion: string;
}

export interface ClarificationAnalysis {
  needsClarification: boolean;
  confidence: 'low' | 'medium' | 'high';
  missingContext: MissingContext[];
  ambiguities: string[];
  detectedNuances: string[];
  conversationContext: ClarificationContext;
  recommendedApproach: 'clarify' | 'answer' | 'partial_answer_then_clarify';
}

class RequirementClarificationService {
  /**
   * Main analysis entry point
   * Determines if query needs clarification before answering
   */
  analyzeQuery(
    query: string,
    conversationHistory: Array<{ role: string; content: string }> = []
  ): ClarificationAnalysis {
    const lowerQuery = query.toLowerCase();
    
    // Extract any context already provided in conversation
    const conversationContext = this.extractConversationContext(
      query,
      conversationHistory
    );
    
    // Detect missing critical context
    const missingContext = this.detectMissingContext(
      lowerQuery,
      conversationContext
    );
    
    // Identify ambiguities
    const ambiguities = this.detectAmbiguities(lowerQuery);
    
    // Detect accounting nuances
    const detectedNuances = this.detectNuances(lowerQuery);
    
    // Determine if we should ask questions or provide answer
    const { needsClarification, confidence, recommendedApproach } = 
      this.determineApproach(missingContext, ambiguities, lowerQuery);
    
    return {
      needsClarification,
      confidence,
      missingContext,
      ambiguities,
      detectedNuances,
      conversationContext,
      recommendedApproach
    };
  }
  
  /**
   * Extract context from previous conversation turns
   */
  private extractConversationContext(
    currentQuery: string,
    history: Array<{ role: string; content: string }>
  ): ClarificationContext {
    const context: ClarificationContext = {};
    const fullText = [
      ...history.map(h => h.content),
      currentQuery
    ].join(' ').toLowerCase();
    
    // Extract jurisdiction
    context.jurisdiction = this.extractJurisdiction(fullText);
    
    // Extract tax year
    context.taxYear = this.extractTaxYear(fullText);
    
    // Extract business type
    context.businessType = this.extractBusinessType(fullText);
    
    // Extract filing status
    context.filingStatus = this.extractFilingStatus(fullText);
    
    // Extract entity type
    context.entityType = this.extractEntityType(fullText);
    
    // Extract accounting method
    context.accountingMethod = this.extractAccountingMethod(fullText);
    
    return context;
  }
  
  /**
   * Detect missing critical context based on query type
   */
  private detectMissingContext(
    query: string,
    context: ClarificationContext
  ): MissingContext[] {
    const missing: MissingContext[] = [];
    
    // Tax-related queries
    if (this.isTaxQuery(query)) {
      if (!context.jurisdiction) {
        missing.push({
          category: 'jurisdiction',
          importance: 'critical',
          reason: 'Tax rules vary significantly by country, state, and province',
          suggestedQuestion: 'Which jurisdiction are you asking about? (e.g., US Federal, California, Canada, UK, etc.)'
        });
      }
      
      if (!context.taxYear) {
        missing.push({
          category: 'tax_year',
          importance: 'high',
          reason: 'Tax laws change annually and vary by fiscal year',
          suggestedQuestion: 'Which tax year are you planning for? (e.g., 2024, 2025)'
        });
      }
      
      if (!context.filingStatus && this.isPersonalTaxQuery(query)) {
        missing.push({
          category: 'filing_status',
          importance: 'high',
          reason: 'Filing status affects deductions, credits, and tax brackets',
          suggestedQuestion: 'What\'s your filing status? (Single, Married Filing Jointly, Head of Household, etc.)'
        });
      }
    }
    
    // Business-related queries
    if (this.isBusinessQuery(query)) {
      if (!context.entityType) {
        missing.push({
          category: 'entity_type',
          importance: 'critical',
          reason: 'Tax treatment differs dramatically between entity types',
          suggestedQuestion: 'What type of business entity? (Sole Proprietorship, LLC, S-Corp, C-Corp, Partnership, etc.)'
        });
      }
      
      if (!context.businessType) {
        missing.push({
          category: 'business_type',
          importance: 'medium',
          reason: 'Industry-specific rules may apply',
          suggestedQuestion: 'What industry is the business in?'
        });
      }
      
      if (!context.accountingMethod && this.isFinancialReportingQuery(query)) {
        missing.push({
          category: 'accounting_method',
          importance: 'high',
          reason: 'Cash vs accrual accounting significantly impacts reporting',
          suggestedQuestion: 'Which accounting method do you use? (Cash basis or Accrual basis)'
        });
      }
    }
    
    // Deduction/credit queries
    if (this.isDeductionQuery(query)) {
      if (!context.jurisdiction) {
        missing.push({
          category: 'jurisdiction',
          importance: 'critical',
          reason: 'Deduction eligibility and limits vary by jurisdiction',
          suggestedQuestion: 'Which tax jurisdiction? Deduction rules vary significantly.'
        });
      }
    }
    
    // Compliance/deadline queries
    if (this.isComplianceQuery(query)) {
      if (!context.jurisdiction) {
        missing.push({
          category: 'jurisdiction',
          importance: 'critical',
          reason: 'Filing deadlines and requirements are jurisdiction-specific',
          suggestedQuestion: 'Which jurisdiction\'s compliance requirements?'
        });
      }
      
      if (!context.entityType) {
        missing.push({
          category: 'entity_type',
          importance: 'high',
          reason: 'Compliance requirements differ by entity type',
          suggestedQuestion: 'What type of entity? (Individual, Corporation, Partnership, etc.)'
        });
      }
    }
    
    return missing;
  }
  
  /**
   * Detect ambiguities that need clarification
   */
  private detectAmbiguities(query: string): string[] {
    const ambiguities: string[] = [];
    
    // Vague terms
    if (query.includes('recently') || query.includes('soon')) {
      ambiguities.push('Timeframe is vague - specific dates/years matter for tax purposes');
    }
    
    if (query.includes('significant') || query.includes('large') || query.includes('substantial')) {
      ambiguities.push('Amount/threshold matters - specific dollar amounts determine tax treatment');
    }
    
    if (query.includes('my business') && !this.hasEntityTypeIndicators(query)) {
      ambiguities.push('Business structure unclear - tax treatment varies by entity type');
    }
    
    if (query.includes('deduct') && !query.includes('personal') && !query.includes('business')) {
      ambiguities.push('Personal vs business deduction unclear - rules differ significantly');
    }
    
    if (query.includes('income') && !this.hasIncomeTypeIndicators(query)) {
      ambiguities.push('Type of income unclear - ordinary income, capital gains, passive income have different tax treatments');
    }
    
    return ambiguities;
  }
  
  /**
   * Detect nuances that professional advisors would consider
   */
  private detectNuances(query: string): string[] {
    const nuances: string[] = [];
    
    // Home office deduction nuances
    if (query.includes('home office')) {
      nuances.push('Exclusive and regular use requirement for home office deduction');
      nuances.push('Simplified vs actual expense method options');
    }
    
    // Depreciation nuances
    if (query.includes('depreciat')) {
      nuances.push('Section 179 vs bonus depreciation vs regular MACRS considerations');
      nuances.push('Depreciation recapture implications on future sale');
    }
    
    // Stock/equity nuances
    if (query.includes('stock') || query.includes('equity') || query.includes('shares')) {
      nuances.push('Holding period affects long-term vs short-term capital gains rates');
      nuances.push('Wash sale rules may apply if selling at a loss');
      nuances.push('ISO vs NSO stock options have different tax treatment');
    }
    
    // Retirement account nuances
    if (query.includes('401k') || query.includes('ira') || query.includes('roth')) {
      nuances.push('Contribution limits vary by age (50+ catch-up contributions)');
      nuances.push('Income phase-outs may limit deductibility or eligibility');
    }
    
    // Real estate nuances
    if (query.includes('rental') || query.includes('real estate')) {
      nuances.push('Passive activity loss limitations may apply');
      nuances.push('Real estate professional status has specific requirements');
      nuances.push('1031 exchange timing requirements are strict (45/180 days)');
    }
    
    // International nuances
    if (query.includes('foreign') || query.includes('international') || query.includes('overseas')) {
      nuances.push('FBAR and FATCA reporting requirements for foreign accounts');
      nuances.push('Foreign tax credit vs deduction election');
      nuances.push('Treaty provisions may override general rules');
    }
    
    // Estimated tax nuances
    if (query.includes('estimated') || query.includes('quarterly')) {
      nuances.push('Safe harbor rules to avoid underpayment penalties');
      nuances.push('Annualized income method may reduce required payments');
    }
    
    return nuances;
  }
  
  /**
   * Determine whether to clarify, answer, or do both
   */
  private determineApproach(
    missingContext: MissingContext[],
    ambiguities: string[],
    query: string
  ): {
    needsClarification: boolean;
    confidence: 'low' | 'medium' | 'high';
    recommendedApproach: 'clarify' | 'answer' | 'partial_answer_then_clarify';
  } {
    const criticalMissing = missingContext.filter(m => m.importance === 'critical');
    const highMissing = missingContext.filter(m => m.importance === 'high');
    
    // Critical context missing - must clarify first
    if (criticalMissing.length > 0) {
      return {
        needsClarification: true,
        confidence: 'low',
        recommendedApproach: 'clarify'
      };
    }
    
    // High importance missing or significant ambiguities
    if (highMissing.length >= 2 || ambiguities.length >= 2) {
      return {
        needsClarification: true,
        confidence: 'low',
        recommendedApproach: 'clarify'
      };
    }
    
    // Some high importance missing - provide general answer then ask
    if (highMissing.length === 1 || ambiguities.length === 1) {
      return {
        needsClarification: true,
        confidence: 'medium',
        recommendedApproach: 'partial_answer_then_clarify'
      };
    }
    
    // General information query - can answer directly
    if (this.isGeneralInformationQuery(query)) {
      return {
        needsClarification: false,
        confidence: 'high',
        recommendedApproach: 'answer'
      };
    }
    
    // Sufficient context to answer
    return {
      needsClarification: false,
      confidence: 'high',
      recommendedApproach: 'answer'
    };
  }
  
  // Helper methods for query classification
  private isTaxQuery(query: string): boolean {
    return query.includes('tax') || query.includes('deduction') || 
           query.includes('credit') || query.includes('irs') ||
           query.includes('filing') || query.includes('return');
  }
  
  private isPersonalTaxQuery(query: string): boolean {
    return (query.includes('my') || query.includes('personal') || 
            query.includes('individual')) && this.isTaxQuery(query);
  }
  
  private isBusinessQuery(query: string): boolean {
    return query.includes('business') || query.includes('company') ||
           query.includes('corporation') || query.includes('llc') ||
           query.includes('partnership') || query.includes('entity');
  }
  
  private isDeductionQuery(query: string): boolean {
    return query.includes('deduct') || query.includes('write off') ||
           query.includes('expense') || query.includes('claim');
  }
  
  private isComplianceQuery(query: string): boolean {
    return query.includes('deadline') || query.includes('filing') ||
           query.includes('requirement') || query.includes('compliance') ||
           query.includes('report') || query.includes('disclosure');
  }
  
  private isFinancialReportingQuery(query: string): boolean {
    return query.includes('financial statement') || query.includes('balance sheet') ||
           query.includes('income statement') || query.includes('cash flow') ||
           query.includes('gaap') || query.includes('ifrs');
  }
  
  private isGeneralInformationQuery(query: string): boolean {
    const generalIndicators = [
      'what is', 'what are', 'explain', 'define', 'tell me about',
      'how does', 'difference between', 'compare'
    ];
    return generalIndicators.some(indicator => query.includes(indicator));
  }
  
  private hasEntityTypeIndicators(query: string): boolean {
    const indicators = [
      'llc', 's-corp', 's corp', 'c-corp', 'c corp', 'corporation',
      'partnership', 'sole proprietor', 'proprietorship'
    ];
    return indicators.some(indicator => query.includes(indicator));
  }
  
  private hasIncomeTypeIndicators(query: string): boolean {
    const indicators = [
      'salary', 'wage', 'capital gain', 'dividend', 'interest',
      'rental', 'passive', 'active', 'ordinary', 'self-employment'
    ];
    return indicators.some(indicator => query.includes(indicator));
  }
  
  // Context extraction helpers
  private extractJurisdiction(text: string): string | undefined {
    const jurisdictions = [
      'us federal', 'california', 'new york', 'texas', 'florida',
      'canada', 'ontario', 'quebec', 'british columbia',
      'uk', 'united kingdom', 'australia', 'india'
    ];
    
    for (const jurisdiction of jurisdictions) {
      if (text.includes(jurisdiction)) {
        return jurisdiction;
      }
    }
    
    return undefined;
  }
  
  private extractTaxYear(text: string): string | undefined {
    const yearMatch = text.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      return yearMatch[1];
    }
    
    if (text.includes('this year') || text.includes('current year')) {
      return new Date().getFullYear().toString();
    }
    
    if (text.includes('next year')) {
      return (new Date().getFullYear() + 1).toString();
    }
    
    return undefined;
  }
  
  private extractBusinessType(text: string): string | undefined {
    const types = [
      'retail', 'restaurant', 'consulting', 'technology', 'manufacturing',
      'real estate', 'healthcare', 'construction', 'professional services'
    ];
    
    for (const type of types) {
      if (text.includes(type)) {
        return type;
      }
    }
    
    return undefined;
  }
  
  private extractFilingStatus(text: string): string | undefined {
    const statuses = [
      'single', 'married filing jointly', 'married filing separately',
      'head of household', 'qualifying widow'
    ];
    
    for (const status of statuses) {
      if (text.includes(status)) {
        return status;
      }
    }
    
    return undefined;
  }
  
  private extractEntityType(text: string): string | undefined {
    const entities = [
      's-corp', 's corp', 'c-corp', 'c corp', 'llc',
      'partnership', 'sole proprietorship', 'corporation'
    ];
    
    for (const entity of entities) {
      if (text.includes(entity)) {
        return entity;
      }
    }
    
    return undefined;
  }
  
  private extractAccountingMethod(text: string): string | undefined {
    if (text.includes('cash basis') || text.includes('cash method')) {
      return 'cash';
    }
    
    if (text.includes('accrual basis') || text.includes('accrual method')) {
      return 'accrual';
    }
    
    return undefined;
  }
  
  /**
   * Generate clarifying questions based on analysis
   * Handles both missing context AND ambiguities
   */
  generateClarifyingQuestions(analysis: ClarificationAnalysis): string[] {
    const questions: string[] = [];
    
    // Add questions for critical and high importance missing context
    analysis.missingContext
      .filter(m => m.importance === 'critical' || m.importance === 'high')
      .forEach(m => questions.push(m.suggestedQuestion));
    
    // Add questions for ambiguities (convert to clarifying questions)
    if (analysis.ambiguities && analysis.ambiguities.length > 0) {
      analysis.ambiguities.forEach(ambiguity => {
        // Convert ambiguity descriptions to questions
        if (ambiguity.includes('Timeframe is vague')) {
          questions.push('What specific timeframe or date are you referring to? (This matters for tax purposes)');
        } else if (ambiguity.includes('Amount/threshold matters')) {
          questions.push('What is the specific dollar amount or value involved?');
        } else if (ambiguity.includes('Business structure unclear')) {
          questions.push('What is your business structure? (Sole Proprietorship, LLC, S-Corp, C-Corp, Partnership, etc.)');
        } else if (ambiguity.includes('Personal vs business')) {
          questions.push('Is this for personal or business purposes?');
        } else if (ambiguity.includes('Type of income unclear')) {
          questions.push('What type of income is this? (Wages, capital gains, dividends, rental income, etc.)');
        }
      });
    }
    
    // Limit to 3 questions to avoid overwhelming
    return questions.slice(0, 3);
  }
}

export const requirementClarificationService = new RequirementClarificationService();
