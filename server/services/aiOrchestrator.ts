/**
 * AI Model Orchestrator
 * Coordinates multiple AI models and solvers to generate comprehensive responses
 */

import { queryTriageService, type QueryClassification, type RoutingDecision } from './queryTriage';
import { financialSolverService } from './financialSolvers';
import { aiProviderRegistry, AIProviderName, ProviderError, providerHealthMonitor } from './aiProviders';
import { requirementClarificationService, type ClarificationAnalysis } from './requirementClarification';
import { documentAnalyzerAgent } from './agents/documentAnalyzer';

export type ResponseType = 'research' | 'analysis' | 'document' | 'calculation' | 'visualization' | 'export' | 'general';

export interface ResponseMetadata {
  responseType: ResponseType;
  showInOutputPane: boolean;
  hasDocument?: boolean;
  hasVisualization?: boolean;
  hasCalculation?: boolean;
  hasExport?: boolean;
  hasResearch?: boolean;
  classification: QueryClassification;
  calculationResults?: any;
}

export interface OrchestrationResult {
  response: string;
  modelUsed: string;
  routingDecision: RoutingDecision;
  classification: QueryClassification;
  calculationResults?: any;
  metadata: ResponseMetadata;
  clarificationAnalysis?: ClarificationAnalysis;
  needsClarification?: boolean;
  tokensUsed: number;
  processingTimeMs: number;
}

export interface ProcessQueryOptions {
  attachment?: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    documentType?: string;
  };
  chatMode?: string;
}

export class AIOrchestrator {
  /**
   * Main orchestration method - routes query through triage, models, and solvers
   * 
   * Now includes professional requirement clarification phase:
   * - Analyzes queries for missing context before providing answers
   * - Asks thoughtful clarifying questions like a real CPA/CA advisor
   * - Only provides answers when sufficient context is available
   */
  async processQuery(
    query: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    userTier: string,
    options?: ProcessQueryOptions
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    
    // CRITICAL DEBUGGING: Log attachment status immediately
    console.log(`[Orchestrator] processQuery called with attachment:`, options?.attachment ? `YES (${options.attachment.filename})` : 'NO');
    
    // Step 1: Classify the query (with document attachment hint)
    const context = options?.attachment ? {
      hasDocument: true,
      documentType: options.attachment.documentType
    } : undefined;
    const classification = queryTriageService.classifyQuery(query, context);
    
    // Step 2: Route to appropriate model and solvers
    const routingDecision = queryTriageService.routeQuery(classification, userTier);
    
    // PHASE 0: Requirement Clarification Analysis
    // CRITICAL: Skip clarification if document is attached - the answer is IN the document!
    // Only run clarification for general advice queries without attachments
    let clarificationAnalysis: ClarificationAnalysis | undefined;
    
    if (!options?.attachment) {
      // Only analyze for clarification when NO document is attached
      clarificationAnalysis = requirementClarificationService.analyzeQuery(
        query,
        conversationHistory
      );
      
      // If clarification is needed (critical context missing), ask questions instead of answering
      if (clarificationAnalysis.recommendedApproach === 'clarify' && 
          clarificationAnalysis.needsClarification) {
        const questions = requirementClarificationService.generateClarifyingQuestions(
          clarificationAnalysis
        );
        
        const clarificationResponse = this.buildClarificationResponse(
          questions,
          clarificationAnalysis
        );
        
        const processingTimeMs = Date.now() - startTime;
        
        return {
          response: clarificationResponse,
          modelUsed: 'clarification',
          routingDecision,
          classification,
          metadata: {
            responseType: 'general',
            showInOutputPane: false,
            classification,
            calculationResults: undefined
          },
          clarificationAnalysis,
          needsClarification: true,
          tokensUsed: 0,
          processingTimeMs
        };
      }
    }
    
    // PHASE 1: Document Analysis (if attachment present)
    // Extract text from attached documents and enrich the query
    let enrichedQuery = query;
    let documentAnalysis: any = null;
    
    if (options?.attachment) {
      console.log(`[Orchestrator] Analyzing attached document: ${options.attachment.filename}`);
      
      try {
        const analysisResult = await documentAnalyzerAgent.analyzeDocument(
          options.attachment.buffer,
          options.attachment.filename,
          options.attachment.mimeType
        );
        
        if (analysisResult.success && analysisResult.analysis.extractedText) {
          documentAnalysis = analysisResult.analysis;
          
          // Enrich the query with extracted document text
          enrichedQuery = `${query}\n\n--- Document Content (${options.attachment.filename}) ---\n${analysisResult.analysis.extractedText}`;
          
          console.log(`[Orchestrator] Document analyzed successfully. Extracted ${analysisResult.analysis.extractedText.length} characters`);
        } else {
          console.warn(`[Orchestrator] Document analysis failed or returned no text:`, analysisResult.error);
        }
      } catch (error) {
        console.error('[Orchestrator] Error analyzing document:', error);
        // Continue without document analysis - fallback to original query
      }
    }
    
    // Step 3: Execute any needed calculations/solvers
    const calculationResults = await this.executeCalculations(enrichedQuery, classification, routingDecision);
    
    // Step 4: Build enhanced context with calculation results, clarification insights, and chat mode
    const enhancedContext = this.buildEnhancedContext(
      enrichedQuery,
      classification,
      calculationResults,
      clarificationAnalysis,
      options?.chatMode
    );
    
    // Step 5: Call the AI provider with enhanced context and provider routing
    // Use enrichedQuery (includes document text) instead of original query
    // CRITICAL: Don't pass attachment to AI model - we've already extracted the text
    // and added it to enrichedQuery. Passing the attachment causes providers to
    // respond with "I can't view files" instead of using the extracted content.
    const aiResponse = await this.callAIModel(
      enrichedQuery,
      enhancedContext,
      conversationHistory,
      routingDecision.primaryModel,
      routingDecision.preferredProvider,
      routingDecision.fallbackProviders,
      undefined // Don't pass attachment - content already in enrichedQuery
    );
    
    let finalResponse = aiResponse.content;
    
    // CRITICAL ENFORCEMENT: For partial_answer_then_clarify, ALWAYS append clarifying questions
    // This ensures the advisor behavior is guaranteed regardless of model compliance
    // Check for generated questions (handles both missing context AND ambiguities)
    // Skip if document is attached - we don't ask questions when analyzing documents
    if (clarificationAnalysis?.recommendedApproach === 'partial_answer_then_clarify') {
      const questions = requirementClarificationService.generateClarifyingQuestions(
        clarificationAnalysis
      );
      
      // Only append if there are actual questions to ask
      if (questions.length > 0) {
        // Append clarifying questions to response
        finalResponse += `\n\n**To provide more specific, tailored advice, I need a bit more information:**\n\n`;
        questions.forEach((question, index) => {
          finalResponse += `${index + 1}. ${question}\n`;
        });
        
        if (clarificationAnalysis.detectedNuances.length > 0) {
          finalResponse += `\n**Important considerations to keep in mind:**\n`;
          clarificationAnalysis.detectedNuances.slice(0, 2).forEach(nuance => {
            finalResponse += `- ${nuance}\n`;
          });
        }
      }
    }
    
    const processingTimeMs = Date.now() - startTime;
    
    // Build response metadata
    const metadata = this.buildResponseMetadata(
      query,
      classification,
      routingDecision,
      calculationResults,
      options?.attachment
    );
    
    return {
      response: finalResponse,
      modelUsed: routingDecision.primaryModel,
      routingDecision,
      classification,
      calculationResults,
      metadata,
      clarificationAnalysis,
      needsClarification: clarificationAnalysis?.recommendedApproach === 'partial_answer_then_clarify',
      tokensUsed: aiResponse.tokensUsed,
      processingTimeMs
    };
  }

  /**
   * Build response metadata to control output pane display
   */
  private buildResponseMetadata(
    query: string,
    classification: QueryClassification,
    routing: RoutingDecision,
    calculations: any,
    attachment?: ProcessQueryOptions['attachment']
  ): ResponseMetadata {
    const lowerQuery = query.toLowerCase();
    
    // Detect visualization requests
    const hasVisualization = this.detectVisualizationRequest(lowerQuery);
    
    // Detect export requests
    const hasExport = this.detectExportRequest(lowerQuery);
    
    // Determine response type based on classification and routing
    let responseType: ResponseType = 'general';
    
    if (classification.requiresDocumentAnalysis || attachment) {
      responseType = 'document';
    } else if (hasVisualization) {
      responseType = 'visualization';
    } else if (hasExport) {
      responseType = 'export';
    } else if (calculations && Object.keys(calculations).length > 0) {
      responseType = 'calculation';
    } else if (classification.requiresResearch || classification.requiresRealTimeData) {
      responseType = 'research';
    } else if (classification.requiresDeepReasoning || classification.complexity === 'expert') {
      responseType = 'analysis';
    }
    
    // Determine if output pane should show this response
    // Show in output pane for: document, visualization, export, calculation
    // Hide for: research, analysis, general (these stay in main chat)
    const showInOutputPane = 
      responseType === 'document' ||
      responseType === 'visualization' ||
      responseType === 'export' ||
      (responseType === 'calculation' && calculations);
    
    return {
      responseType,
      showInOutputPane,
      hasDocument: !!attachment || classification.requiresDocumentAnalysis,
      hasVisualization,
      hasExport,
      hasCalculation: !!calculations && Object.keys(calculations).length > 0,
      hasResearch: classification.requiresResearch || classification.requiresRealTimeData,
      classification,
      calculationResults: calculations
    };
  }

  /**
   * Detect if user is requesting a visualization/chart
   */
  private detectVisualizationRequest(query: string): boolean {
    const visualizationKeywords = [
      'chart', 'graph', 'plot', 'visualize', 'visualization', 'diagram',
      'show me', 'display', 'draw', 'create a chart', 'create a graph',
      'bar chart', 'line chart', 'pie chart', 'scatter plot', 'histogram'
    ];
    return visualizationKeywords.some(kw => query.includes(kw));
  }

  /**
   * Detect if user is requesting an export
   */
  private detectExportRequest(query: string): boolean {
    const exportKeywords = [
      'export', 'download', 'save as', 'generate pdf', 'generate csv',
      'export to', 'download as', 'create pdf', 'create csv',
      'excel', 'spreadsheet', '.pdf', '.csv', '.xlsx'
    ];
    return exportKeywords.some(kw => query.includes(kw));
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
   * Build clarification response when critical context is missing
   */
  private buildClarificationResponse(
    questions: string[],
    analysis: ClarificationAnalysis
  ): string {
    let response = `I want to provide you with the most accurate and tailored advice possible. To ensure I give you expert guidance specific to your situation, I need to understand a few more details:\n\n`;
    
    questions.forEach((question, index) => {
      response += `${index + 1}. ${question}\n`;
    });
    
    response += `\nOnce I have this information, I'll be able to provide precise, jurisdiction-specific advice that accounts for all relevant rules, deadlines, and nuances.`;
    
    // Add detected nuances as helpful context
    if (analysis.detectedNuances.length > 0) {
      response += `\n\n**Important Considerations:**\n`;
      analysis.detectedNuances.slice(0, 3).forEach(nuance => {
        response += `- ${nuance}\n`;
      });
    }
    
    return response;
  }

  /**
   * Build enhanced context with calculation results, clarification insights, and chat mode for AI model
   */
  private buildEnhancedContext(
    query: string,
    classification: QueryClassification,
    calculations: any,
    clarificationAnalysis?: ClarificationAnalysis,
    chatMode?: string
  ): string {
    let context = `You are Luca, a pan-global accounting superintelligence and expert CPA/CA advisor. `;
    context += `You are NOT a generic text generation machine. You are a thoughtful, detail-oriented professional who:\n`;
    context += `- Considers jurisdiction-specific nuances that other LLMs miss\n`;
    context += `- Identifies subtle details that matter in accounting and tax (filing status, entity type, accounting method)\n`;
    context += `- Provides tailored, precise advice rather than generic information\n`;
    context += `- Asks clarifying questions when critical context is missing\n`;
    context += `- Acknowledges when additional context would improve your advice\n\n`;
    
    // Add chat mode-specific instructions
    if (chatMode && chatMode !== 'standard') {
      context += `**PROFESSIONAL MODE SELECTED: ${chatMode.toUpperCase().replace(/-/g, ' ')}**\n\n`;
      
      switch (chatMode) {
        case 'deep-research':
          context += `INSTRUCTIONS FOR DEEP RESEARCH MODE:\n`;
          context += `- Conduct comprehensive, multi-source analysis\n`;
          context += `- Cite specific regulations, tax codes, and accounting standards\n`;
          context += `- Compare approaches across different jurisdictions when relevant\n`;
          context += `- Identify edge cases and alternative interpretations\n`;
          context += `- Provide detailed explanations with supporting evidence\n`;
          context += `- Include references to authoritative sources (IRS publications, IFRS standards, etc.)\n\n`;
          break;
        case 'checklist':
          context += `INSTRUCTIONS FOR CHECKLIST MODE:\n`;
          context += `- Create a structured, actionable checklist\n`;
          context += `- Organize tasks in logical order with clear steps\n`;
          context += `- Include deadlines and dependencies where applicable\n`;
          context += `- Add brief explanations for each checklist item\n`;
          context += `- Prioritize critical tasks at the top\n`;
          context += `- Format as numbered list with sub-items where needed\n\n`;
          break;
        case 'workflow':
          context += `INSTRUCTIONS FOR WORKFLOW VISUALIZATION MODE:\n`;
          context += `- Describe the process as a clear, step-by-step workflow\n`;
          context += `- Identify decision points and branching paths\n`;
          context += `- Note dependencies between steps\n`;
          context += `- Include roles/responsibilities for each step\n`;
          context += `- Highlight critical milestones and approval gates\n`;
          context += `- Use clear visual formatting (numbered steps, indentation for sub-processes)\n\n`;
          break;
        case 'audit-plan':
          context += `INSTRUCTIONS FOR AUDIT PLAN MODE:\n`;
          context += `- Develop a comprehensive audit approach\n`;
          context += `- Identify key risk areas and materiality thresholds\n`;
          context += `- Outline specific audit procedures and tests\n`;
          context += `- Specify required documentation and evidence\n`;
          context += `- Include timing considerations and resource requirements\n`;
          context += `- Address relevant auditing standards (GAAS, ISA, etc.)\n\n`;
          break;
        case 'calculation':
          context += `INSTRUCTIONS FOR FINANCIAL CALCULATION MODE:\n`;
          context += `- Perform detailed calculations step-by-step\n`;
          context += `- Show all formulas and methodology clearly\n`;
          context += `- Explain assumptions and variables used\n`;
          context += `- Present results in formatted tables when appropriate\n`;
          context += `- Include relevant tax brackets, rates, and thresholds\n`;
          context += `- Verify calculations and note any limitations\n\n`;
          break;
      }
    }
    
    context += `Query Classification:\n`;
    context += `- Domain: ${classification.domain}\n`;
    if (classification.subDomain) {
      context += `- Sub-domain: ${classification.subDomain}\n`;
    }
    if (classification.jurisdiction && classification.jurisdiction.length > 0) {
      context += `- Jurisdiction(s): ${classification.jurisdiction.join(', ')}\n`;
    }
    context += `- Complexity: ${classification.complexity}\n\n`;
    
    // Add clarification context if available
    if (clarificationAnalysis?.conversationContext) {
      const ctx = clarificationAnalysis.conversationContext;
      context += `Detected Context from Conversation:\n`;
      if (ctx.jurisdiction) context += `- Jurisdiction: ${ctx.jurisdiction}\n`;
      if (ctx.taxYear) context += `- Tax Year: ${ctx.taxYear}\n`;
      if (ctx.businessType) context += `- Business Type: ${ctx.businessType}\n`;
      if (ctx.entityType) context += `- Entity Type: ${ctx.entityType}\n`;
      if (ctx.filingStatus) context += `- Filing Status: ${ctx.filingStatus}\n`;
      if (ctx.accountingMethod) context += `- Accounting Method: ${ctx.accountingMethod}\n`;
      context += `\n`;
    }
    
    // CRITICAL: Add missing context information to instruct model to ask questions
    if (clarificationAnalysis?.missingContext && clarificationAnalysis.missingContext.length > 0) {
      context += `MISSING CONTEXT - Important Details to Address:\n`;
      clarificationAnalysis.missingContext
        .filter(m => m.importance === 'high' || m.importance === 'critical')
        .forEach(missing => {
          context += `- ${missing.category} (${missing.importance}): ${missing.reason}\n`;
          context += `  Suggested clarification: "${missing.suggestedQuestion}"\n`;
        });
      context += `\n`;
      
      // Explicit instruction based on recommended approach
      if (clarificationAnalysis.recommendedApproach === 'partial_answer_then_clarify') {
        context += `INSTRUCTION: Provide a brief, general answer to help the user, then ASK for the missing details above. `;
        context += `Format your response as: [General guidance] + "To provide more specific advice, I need to know: [list the questions]"\n\n`;
      }
    }
    
    // Add nuances detected
    if (clarificationAnalysis?.detectedNuances && clarificationAnalysis.detectedNuances.length > 0) {
      context += `Key Nuances to Address in Your Response:\n`;
      clarificationAnalysis.detectedNuances.forEach(nuance => {
        context += `- ${nuance}\n`;
      });
      context += `\n`;
    }
    
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
    context += `Provide a comprehensive, expert-level response that:\n`;
    context += `- Addresses jurisdiction-specific rules and deadlines\n`;
    context += `- Considers all detected nuances and contextual factors\n`;
    context += `- Goes deeper than typical LLM responses by identifying subtle implications\n`;
    context += `- Cites relevant standards, regulations, tax code sections, or case law when applicable\n`;
    context += `- Explains calculations clearly with methodology\n`;
    context += `- ASK for missing context when instructed above (partial_answer_then_clarify)\n`;
    context += `- Acknowledges limitations and recommends consulting a licensed professional for final decisions\n`;
    context += `- Proactively identifies additional considerations the user should be aware of\n\n`;
    context += `Remember: You are an expert advisor, not a generic chatbot. Demonstrate deep expertise through nuanced, tailored advice.`;
    
    return context;
  }

  /**
   * Call AI provider with health-aware routing and automatic failover
   */
  private async callAIModel(
    userQuery: string,
    enhancedContext: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    model: string,
    preferredProvider?: AIProviderName,
    fallbackProviders?: AIProviderName[],
    attachment?: ProcessQueryOptions['attachment']
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
      ...history.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content })),
      { role: 'user' as const, content: userQuery }
    ];
    
    // Build initial provider list from triage decision
    const candidateProviders: AIProviderName[] = [];
    if (preferredProvider) {
      candidateProviders.push(preferredProvider);
    }
    if (fallbackProviders && fallbackProviders.length > 0) {
      candidateProviders.push(...fallbackProviders.filter(p => !candidateProviders.includes(p)));
    }
    
    // Filter out unhealthy providers (unless it's the only option)
    let healthyProviders = candidateProviders.filter(p => providerHealthMonitor.isProviderHealthy(p));
    
    // If all providers are unhealthy, keep the original list (still try them)
    if (healthyProviders.length === 0) {
      console.warn('[AIOrchestrator] All candidate providers are unhealthy - attempting anyway');
      healthyProviders = candidateProviders;
    }
    
    // Sort by health score (descending) - healthier providers first
    healthyProviders.sort((a, b) => 
      providerHealthMonitor.getHealthScore(b) - providerHealthMonitor.getHealthScore(a)
    );
    
    // Ensure Azure OpenAI and OpenAI are in the fallback chain
    if (!healthyProviders.includes(AIProviderName.AZURE_OPENAI)) {
      healthyProviders.push(AIProviderName.AZURE_OPENAI);
    }
    if (!healthyProviders.includes(AIProviderName.OPENAI)) {
      healthyProviders.push(AIProviderName.OPENAI);
    }
    
    console.log('[AIOrchestrator] Provider chain (by health):', 
      healthyProviders.map(p => `${p}(${providerHealthMonitor.getHealthScore(p)})`).join(' → ')
    );
    
    let lastError: any = null;
    
    // Try each provider in the health-ordered chain
    for (let i = 0; i < healthyProviders.length; i++) {
      const providerName = healthyProviders[i];
      const isLastProvider = i === healthyProviders.length - 1;
      
      // Check if provider is in cooldown
      const metrics = providerHealthMonitor.getHealthMetrics(providerName);
      if (metrics.rateLimitUntil && new Date() < metrics.rateLimitUntil) {
        console.log(`[AIOrchestrator] Skipping ${providerName} - in cooldown until ${metrics.rateLimitUntil.toISOString()}`);
        continue;
      }
      
      try {
        const provider = aiProviderRegistry.getProvider(providerName);
        
        console.log(`[AIOrchestrator] Attempting ${providerName} (health: ${metrics.healthScore}) [${i + 1}/${healthyProviders.length}]`);
        
        const response = await provider.generateCompletion({
          messages,
          model: actualModel,
          temperature: 0.7,
          maxTokens: 2000,
          attachment: attachment ? {
            buffer: attachment.buffer,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            documentType: attachment.documentType
          } : undefined
        });
        
        // Record success with health monitor
        providerHealthMonitor.recordSuccess(providerName);
        
        console.log(`[AIOrchestrator] ✓ Success with ${providerName}`);
        
        return {
          content: response.content,
          tokensUsed: response.tokensUsed.total
        };
      } catch (error: any) {
        // Record failure with health monitor
        providerHealthMonitor.recordFailure(providerName, error);
        
        lastError = error;
        
        // Log the error
        if (error instanceof ProviderError) {
          console.error(`[AIOrchestrator] ✗ ${error.provider} error: ${error.message}`);
          
          // If this is the last provider in the chain, return a user-friendly error
          if (isLastProvider) {
            return {
              content: this.buildFallbackErrorMessage(error),
              tokensUsed: 0
            };
          }
        } else {
          console.error(`[AIOrchestrator] ✗ ${providerName} error:`, error?.message || error);
          
          // If this is the last provider, return generic error
          if (isLastProvider) {
            return {
              content: "I apologize, but I encountered an error processing your request. Please try again.",
              tokensUsed: 0
            };
          }
        }
        
        // Continue to next provider
        console.log(`[AIOrchestrator] → Failing over to next provider...`);
      }
    }
    
    // All providers failed - return most relevant error
    if (lastError instanceof ProviderError) {
      return {
        content: this.buildFallbackErrorMessage(lastError),
        tokensUsed: 0
      };
    }
    
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
