/**
 * AI Model Orchestrator
 * Coordinates multiple AI models and solvers to generate comprehensive responses
 * 
 * Enhanced with Advanced Reasoning Capabilities:
 * - Chain-of-thought reasoning for complex queries
 * - Multi-agent orchestration for specialized analysis
 * - Cognitive monitoring for quality assurance
 * - Parallel reasoning streams for efficiency
 */

import { queryTriageService, type QueryClassification, type RoutingDecision } from './queryTriage';
import { financialSolverService } from './financialSolvers';
import { calculationFormatter } from './calculationFormatter';
import { excelOrchestrator } from './excelOrchestrator';
import { aiProviderRegistry, AIProviderName, ProviderError, providerHealthMonitor } from './aiProviders';
import { requirementClarificationService, type ClarificationAnalysis } from './requirementClarification';
import { documentAnalyzerAgent } from './agents/documentAnalyzer';
import { visualizationGenerator } from './visualizationGenerator';
import { promptBuilder } from './promptBuilder';
import type { VisualizationData } from '../../shared/types/visualization';
// Advanced Reasoning imports (feature-flagged)
import { reasoningGovernor } from './reasoningGovernor';
import { complianceSentinel } from './complianceSentinel';
import { validationAgent } from './validationAgent';
import { normalizeChatMode, isCotMode } from './chatModeNormalizer';
import type { 
  EnhancedRoutingDecision, 
  ReasoningMetadata,
  CognitiveMonitorResult 
} from '../../shared/types/reasoning';

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
  visualization?: VisualizationData;
  // Advanced reasoning metadata (feature-flagged)
  reasoning?: Partial<ReasoningMetadata>;
  cognitiveMonitoring?: CognitiveMonitorResult;
  qualityScore?: number;
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
  // New content separation fields
  deliverableContent?: string; // Structured content for output pane
  reasoningContent?: string;   // Thought process for chat interface
  // Excel workbook for calculation mode
  excelWorkbook?: {
    buffer: Buffer;
    filename: string;
    summary: string;
  };
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
    
    // CRITICAL: Normalize chat mode early to ensure consistent naming throughout
    const chatMode = normalizeChatMode(options?.chatMode);
    
    // CRITICAL DEBUGGING: Log attachment status immediately
    console.log(`[Orchestrator] processQuery called with attachment:`, options?.attachment ? `YES (${options.attachment.filename})` : 'NO');
    
    // Step 1: Classify the query (with document attachment hint)
    const context = options?.attachment ? {
      hasDocument: true,
      documentType: options.attachment.documentType
    } : undefined;
    const classification = queryTriageService.classifyQuery(query, context);
    
    // Step 2: Route to appropriate model and solvers
    const routingDecision = queryTriageService.routeQuery(classification, userTier, !!options?.attachment);
    
    // Step 2.5: ADVANCED REASONING - Enhance routing decision with reasoning profile
    // CRITICAL: CoT for Research/Calculate runs independently of full governor
    // This ensures quality improvement even when other features are disabled
    let enhancedRouting: EnhancedRoutingDecision | null = null;
    const cotMode = isCotMode(chatMode);
    
    if (reasoningGovernor.isEnabled() || cotMode) {
      enhancedRouting = reasoningGovernor.enhanceRoutingDecision(
        routingDecision,
        classification,
        chatMode,
        userTier
      );
      
      if (cotMode && !enhancedRouting.enableChainOfThought) {
        console.warn(`[AIOrchestrator] CoT expected for ${chatMode} but not enabled - check feature flags`);
      }
    }
    
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
    
    // Step 3.5: Generate Excel workbook for calculation mode
    let excelWorkbook: any = null;
    if (chatMode === 'calculation' && calculationResults && Object.keys(calculationResults).length > 0) {
      try {
        console.log('[Orchestrator] Generating Excel workbook for calculation mode...');
        const spreadsheetRequest = await excelOrchestrator.parseUserRequest(enrichedQuery, undefined);
        
        // Add detected calculations to the request
        if (calculationResults.taxCalculation) {
          spreadsheetRequest.calculations?.push({
            type: 'tax',
            inputs: calculationResults.taxCalculation,
            outputLocation: 'B2'
          });
        }
        if (calculationResults.npv !== undefined) {
          spreadsheetRequest.calculations?.push({
            type: 'npv',
            inputs: calculationResults,
            outputLocation: 'B20'
          });
        }
        if (calculationResults.irr !== undefined) {
          spreadsheetRequest.calculations?.push({
            type: 'irr',
            inputs: calculationResults,
            outputLocation: 'B35'
          });
        }
        if (calculationResults.depreciation) {
          spreadsheetRequest.calculations?.push({
            type: 'depreciation',
            inputs: calculationResults.depreciation,
            outputLocation: 'B50'
          });
        }
        if (calculationResults.amortization) {
          spreadsheetRequest.calculations?.push({
            type: 'amortization',
            inputs: calculationResults.amortization,
            outputLocation: 'B80'
          });
        }
        
        excelWorkbook = await excelOrchestrator.createCalculationWorkbook(spreadsheetRequest);
        console.log('[Orchestrator] Excel workbook generated with', excelWorkbook.formulasUsed.length, 'formulas');
      } catch (error) {
        console.error('[Orchestrator] Excel generation failed:', error);
        // Don't fail the request if Excel generation fails
      }
    }
    
    // Step 4: Build enhanced context with calculation results, clarification insights, and chat mode
    const enhancedContext = this.buildEnhancedContext(
      enrichedQuery,
      classification,
      calculationResults,
      clarificationAnalysis,
      chatMode,
      enhancedRouting // Pass enhanced routing for CoT prompt enhancement
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
    
    // Step 5.5: Format calculation results professionally if calculations were performed
    if (calculationResults && Object.keys(calculationResults).length > 0) {
      try {
        console.log('[Orchestrator] Formatting calculation results professionally...');
        
        // Format each calculation type
        const formattedOutputs: string[] = [];
        
        for (const [calcType, calcData] of Object.entries(calculationResults)) {
          if (calcData && typeof calcData === 'object') {
            const formatted = calculationFormatter.formatCalculation(
              calcType,
              calcData,
              enrichedQuery
            );
            
            // Append formatted markdown to response
            formattedOutputs.push(formatted.markdown);
          }
        }
        
        // If we have formatted outputs, prepend them to the AI response
        if (formattedOutputs.length > 0) {
          const calculationSection = `\n\n---\n\n# 📊 Calculation Results\n\n${formattedOutputs.join('\n\n')}\n\n---\n\n# 💬 Professional Analysis\n\n`;
          finalResponse = calculationSection + finalResponse;
          console.log('[Orchestrator] Professional calculation formatting applied');
        }
      } catch (error) {
        console.error('[Orchestrator] Calculation formatting failed:', error);
        // Don't fail request if formatting fails - AI response still valid
      }
    }
    
    // Step 5.6: ADVANCED REASONING - Cognitive Monitoring & Validation
    // CRITICAL: Monitoring runs independently of CoT - separate feature flags
    // This ensures quality checks even when advanced reasoning is disabled
    let cognitiveMonitoring: CognitiveMonitorResult | undefined;
    let validationResult: any | undefined;
    let qualityScore = 1.0;
    
    const shouldMonitor = enhancedRouting?.enableCognitiveMonitoring || 
                         (process.env.ENABLE_COMPLIANCE_MONITORING === 'true' || 
                          process.env.ENABLE_VALIDATION_AGENT === 'true');
    
    if (shouldMonitor) {
      try {
        console.log('[Orchestrator] Running compliance monitoring...');
        
        // Run compliance sentinel
        cognitiveMonitoring = await complianceSentinel.validateResponse(
          query,
          finalResponse,
          {
            chatMode,
            uploadedDocuments: options?.attachment ? [options.attachment] : undefined,
            previousMessages: conversationHistory
          }
        );
        
        // Run validation agent
        validationResult = await validationAgent.validate(
          query,
          finalResponse,
          {
            calculationResults,
            uploadedDocuments: options?.attachment ? [options.attachment] : undefined
          }
        );
        
        // Calculate overall quality score
        const complianceScore = cognitiveMonitoring.overallStatus === 'pass' ? 1.0 : 
                               cognitiveMonitoring.overallStatus === 'warning' ? 0.8 : 0.5;
        qualityScore = (complianceScore + validationResult.confidence) / 2;
        
        console.log(`[Orchestrator] Quality score: ${(qualityScore * 100).toFixed(0)}%`);
        
        // Auto-repair if quality is low but not failed
        if (cognitiveMonitoring.overallStatus === 'warning' && qualityScore > 0.6) {
          console.log('[Orchestrator] Low quality detected - auto-repair could be attempted');
          // TODO: Implement auto-repair loop in future phase
        }
        
        // Log if human review required
        if (cognitiveMonitoring.requiresHumanReview) {
          console.warn('[Orchestrator] Response requires human review - flagging for attention');
        }
        
      } catch (error) {
        console.error('[Orchestrator] Cognitive monitoring failed:', error);
        // Don't fail request if monitoring fails - it's a quality check, not critical path
      }
    }
    
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
    
    // PHASE 5: Generate visualization if response contains financial data OR workflow
    let visualization: VisualizationData | null = null;
    try {
      // For workflow mode, generate workflow diagram; for others, generate charts
      if (chatMode === 'workflow') {
        const { WorkflowGenerator } = await import('./workflowGenerator');
        visualization = await WorkflowGenerator.generateWorkflowVisualization(finalResponse, chatMode);
      } else {
        visualization = visualizationGenerator.generateVisualization({
          query,
          response: finalResponse,
          classification
        });
      }
      
      if (visualization) {
        console.log(`[Orchestrator] Generated ${visualization.type} visualization`);
      }
    } catch (error) {
      console.error('[Orchestrator] Visualization generation failed:', error);
      // Don't fail the request if visualization fails
    }
    
    // Build response metadata (now includes reasoning metadata)
    const metadata = this.buildResponseMetadata(
      query,
      classification,
      routingDecision,
      calculationResults,
      options?.attachment,
      visualization,
      chatMode,
      enhancedRouting,
      cognitiveMonitoring,
      qualityScore,
      processingTimeMs
    );

    // Parse separated content for professional modes
    let deliverableContent: string | undefined;
    let reasoningContent: string | undefined;
    let mainResponse = finalResponse;

    if (chatMode && ['checklist', 'workflow', 'audit-plan'].includes(chatMode)) {
      const { deliverable, reasoning, remainingContent } = this.parseSeparatedContent(finalResponse);
      if (deliverable && reasoning) {
        deliverableContent = deliverable;
        reasoningContent = reasoning;
        mainResponse = remainingContent || reasoning; // Chat shows reasoning
      }
    }

    return {
      response: mainResponse,
      deliverableContent,
      reasoningContent,
      modelUsed: routingDecision.primaryModel,
      routingDecision,
      classification,
      calculationResults,
      metadata,
      clarificationAnalysis,
      needsClarification: clarificationAnalysis?.recommendedApproach === 'partial_answer_then_clarify',
      tokensUsed: aiResponse.tokensUsed,
      processingTimeMs,
      excelWorkbook: excelWorkbook ? {
        buffer: excelWorkbook.buffer,
        filename: `LucaAgent_Calculations_${Date.now()}.xlsx`,
        summary: excelWorkbook.summary
      } : undefined
    };
  }

  /**
   * Build response metadata to control output pane display
   * Now includes advanced reasoning metadata
   */
  private buildResponseMetadata(
    query: string,
    classification: QueryClassification,
    routing: RoutingDecision,
    calculations: any,
    attachment?: ProcessQueryOptions['attachment'],
    visualization?: VisualizationData | null,
    chatMode?: string,
    enhancedRouting?: EnhancedRoutingDecision | null,
    cognitiveMonitoring?: CognitiveMonitorResult,
    qualityScore?: number,
    processingTimeMs?: number
  ): ResponseMetadata {
    const lowerQuery = query.toLowerCase();
    
    // Check if visualization was generated
    const hasVisualization = !!visualization || this.detectVisualizationRequest(lowerQuery);
    
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
    
    // CRITICAL: Determine if output pane should show this response
    // Professional modes ALWAYS show in Output Pane:
    // - deep-research: Research results and findings
    // - checklist: Generated checklists
    // - workflow: Workflow descriptions/diagrams
    // - audit-plan: Audit plans and procedures
    // - calculation: Financial calculations
    // Standard chat stays in main chat area only
    const professionalModes = ['deep-research', 'checklist', 'workflow', 'audit-plan', 'calculation'];
    const isProfessionalMode = chatMode && professionalModes.includes(chatMode);
    
    const showInOutputPane = 
      isProfessionalMode ||  // All professional modes → Output Pane
      responseType === 'document' ||
      responseType === 'visualization' ||
      responseType === 'export' ||
      (responseType === 'calculation' && calculations);
    
    // Build reasoning metadata if advanced features were used
    let reasoningMetadata: Partial<ReasoningMetadata> | undefined;
    if (enhancedRouting) {
      reasoningMetadata = {
        profile: enhancedRouting.reasoningProfile,
        governorDecisions: [
          `Reasoning profile: ${enhancedRouting.reasoningProfile}`,
          enhancedRouting.enableChainOfThought ? 'Chain-of-thought enabled' : null,
          enhancedRouting.enableCognitiveMonitoring ? 'Cognitive monitoring enabled' : null,
          enhancedRouting.enableMultiAgent ? 'Multi-agent enabled' : null
        ].filter(Boolean) as string[],
        totalProcessingTimeMs: processingTimeMs || 0,
        totalTokensUsed: 0, // Will be filled by caller
      };
      
      // Add cognitive monitoring results if available
      if (cognitiveMonitoring) {
        reasoningMetadata.cognitiveMonitoring = cognitiveMonitoring;
      }
    }
    
    return {
      responseType,
      showInOutputPane,
      hasDocument: !!attachment || classification.requiresDocumentAnalysis,
      hasVisualization,
      hasExport,
      hasCalculation: !!calculations && Object.keys(calculations).length > 0,
      hasResearch: classification.requiresResearch || classification.requiresRealTimeData,
      classification,
      calculationResults: calculations,
      visualization: visualization || undefined,
      reasoning: reasoningMetadata,
      cognitiveMonitoring,
      qualityScore
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
    
    // Financial Ratio calculations (Current Ratio, Quick Ratio, etc.)
    if (query.toLowerCase().includes('current ratio') || 
        query.toLowerCase().includes('quick ratio') ||
        query.toLowerCase().includes('liquidity ratio')) {
      const ratioParams = this.extractFinancialRatioParameters(query);
      if (ratioParams) {
        results.financialRatios = financialSolverService.calculateFinancialRatios(
          ratioParams.currentAssets,
          ratioParams.currentLiabilities,
          ratioParams.totalAssets || ratioParams.currentAssets,
          ratioParams.totalLiabilities || ratioParams.currentLiabilities,
          ratioParams.inventory || 0,
          ratioParams.netIncome || 0,
          ratioParams.equity || 0,
          ratioParams.historicalData
        );
      }
    }
    
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
        const npv = financialSolverService.calculateNPV(cashFlows, discountRate);
        results.npv = {
          npv,
          cashFlows,
          discountRate,
          initialInvestment: cashFlows[0] || 0
        };
      }
    }
    
    if (query.includes('irr') || query.includes('internal rate of return')) {
      const cashFlows = this.extractCashFlows(query);
      if (cashFlows) {
        const irr = financialSolverService.calculateIRR(cashFlows);
        results.irr = {
          irr,
          cashFlows,
          requiredReturn: 0.10 // Default required return
        };
      }
    }
    
    // Depreciation calculations
    if (query.includes('depreciation') || query.includes('depreciate')) {
      const depParams = this.extractDepreciationParameters(query);
      if (depParams) {
        const annualDepreciation = financialSolverService.calculateDepreciation(
          depParams.cost,
          depParams.salvage,
          depParams.life,
          depParams.method,
          depParams.period
        );
        
        // Build schedule
        const schedule = [];
        let balance = depParams.cost;
        let accumulated = 0;
        
        for (let year = 1; year <= depParams.life; year++) {
          const depreciation = financialSolverService.calculateDepreciation(
            depParams.cost,
            depParams.salvage,
            depParams.life,
            depParams.method,
            year
          );
          accumulated += depreciation;
          const endingBalance = balance - depreciation;
          
          schedule.push({
            year,
            beginningBalance: balance,
            depreciation,
            endingBalance,
            accumulated
          });
          
          balance = endingBalance;
        }
        
        results.depreciation = {
          cost: depParams.cost,
          salvageValue: depParams.salvage,
          usefulLife: depParams.life,
          method: depParams.method,
          annualDepreciation,
          schedule
        };
      }
    }
    
    // Amortization calculations
    if (query.includes('amortization') || query.includes('loan payment')) {
      const loanParams = this.extractLoanParameters(query);
      if (loanParams) {
        const amortizationData = financialSolverService.calculateAmortization(
          loanParams.principal,
          loanParams.rate,
          loanParams.years,
          loanParams.paymentsPerYear
        );
        
        results.amortization = {
          principal: loanParams.principal,
          annualRate: loanParams.rate,
          years: loanParams.years,
          payment: amortizationData.payment,
          schedule: amortizationData.schedule
        };
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
   * Now includes Chain-of-Thought prompt enhancement when enabled
   */
  private buildEnhancedContext(
    query: string,
    classification: QueryClassification,
    calculations: any,
    clarificationAnalysis?: ClarificationAnalysis,
    chatMode?: string,
    enhancedRouting?: EnhancedRoutingDecision | null
  ): string {
    let context = `You are Luca, a pan-global accounting superintelligence and expert CPA/CA advisor. `;
    context += `You are NOT a generic text generation machine. You are a thoughtful, detail-oriented professional who:\n`;
    context += `- Provides comprehensive, scenario-based advice covering multiple possibilities when specific details aren't provided\n`;
    context += `- Considers jurisdiction-specific nuances that other LLMs miss\n`;
    context += `- Identifies subtle details that matter in accounting and tax (filing status, entity type, accounting method)\n`;
    context += `- Gives thorough answers with examples for different scenarios instead of asking obvious questions\n`;
    context += `- ONLY asks questions when information is CRITICAL and impossible to answer without it (very rare)\n`;
    context += `- Demonstrates expertise by addressing potential variations and edge cases proactively\n\n`;
    
    context += `**CRITICAL: Balance Expert Depth with Accessibility**\n`;
    context += `While maintaining professional-grade quality, make your responses accessible:\n`;
    context += `1. **Layer Your Explanations**: Start with simple, clear summaries before diving into technical details\n`;
    context += `   - Open with a plain-language answer anyone can understand\n`;
    context += `   - Then provide the expert-level technical depth and nuances\n`;
    context += `2. **Define Technical Terms**: When using specialized terminology, briefly explain it in parentheses or a following sentence\n`;
    context += `   - Example: "This qualifies for Section 179 deduction (immediate expensing of equipment purchases)"\n`;
    context += `3. **Use Analogies**: Where helpful, relate complex concepts to everyday situations\n`;
    context += `4. **Provide Concrete Examples**: Illustrate abstract principles with real-world scenarios\n`;
    context += `5. **Structure for Clarity**: Use headings, bullet points, and numbered lists to organize information\n`;
    context += `6. **Highlight Key Takeaways**: Emphasize the most important points so they're easy to spot\n\n`;
    
    context += `Think of your audience as intelligent but not necessarily accounting experts. Your goal is to educate while you advise.\n\n`;
    
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
          context += `You need to provide TWO separate outputs:\n\n`;
          context += `1. DELIVERABLE (for output pane download):\n`;
          context += `Create a professional, structured checklist with:\n`;
          context += `- Clear task items with checkboxes [ ]\n`;
          context += `- Priority levels (High/Medium/Low)\n`;
          context += `- Deadlines and dependencies\n`;
          context += `- Brief descriptions for each item\n`;
          context += `- Organized in logical sections\n\n`;
          context += `2. REASONING (for chat interface):\n`;
          context += `Explain your thought process:\n`;
          context += `- Why you included specific items\n`;
          context += `- How you determined priorities\n`;
          context += `- Sources or standards you considered\n`;
          context += `- Ask for user feedback on your reasoning\n\n`;
          context += `Format your response as:\n`;
          context += `<DELIVERABLE>\n[checklist content here]\n</DELIVERABLE>\n\n`;
          context += `<REASONING>\n[your thought process here]\n</REASONING>\n\n`;
          break;
        case 'workflow':
          context += `INSTRUCTIONS FOR WORKFLOW VISUALIZATION MODE:\n`;
          context += `You need to provide TWO separate outputs:\n\n`;
          context += `1. DELIVERABLE (for output pane visualization):\n`;
          context += `Create a clear, structured workflow using this format:\n`;
          context += `Step 1: [Title]\n- [Substep description]\n- [Another substep]\n\n`;
          context += `Step 2: [Next Title]\n- [Substep description]\n\n`;
          context += `This will generate an interactive flowchart diagram.\n\n`;
          context += `FORMAT OPTIONS you can mention:\n`;
          context += `- "Linear Process" - Sequential steps (default)\n`;
          context += `- "Decision Tree" - Include decision points with Yes/No branches\n`;
          context += `- "Parallel Workflow" - Multiple simultaneous paths\n`;
          context += `- "Approval Workflow" - Include approval gates and review steps\n\n`;
          context += `2. REASONING (for chat interface):\n`;
          context += `Explain your thought process:\n`;
          context += `- Why you structured the workflow this way\n`;
          context += `- Key considerations for each step\n`;
          context += `- Industry best practices applied\n`;
          context += `- Ask user: "Would you prefer a different format (decision tree, parallel workflow, etc.)?"\n\n`;
          context += `Format your response as:\n`;
          context += `<DELIVERABLE>\n[workflow content here]\n</DELIVERABLE>\n\n`;
          context += `<REASONING>\n[your thought process here]\n</REASONING>\n\n`;
          break;
        case 'audit-plan':
          context += `INSTRUCTIONS FOR AUDIT PLAN MODE:\n`;
          context += `You need to provide TWO separate outputs:\n\n`;
          context += `1. DELIVERABLE (for output pane download):\n`;
          context += `Create a comprehensive audit plan with:\n`;
          context += `- Risk assessment and materiality thresholds\n`;
          context += `- Specific audit procedures and tests\n`;
          context += `- Required documentation and evidence\n`;
          context += `- Timing considerations and resource requirements\n`;
          context += `- Relevant auditing standards (GAAS, ISA, etc.)\n\n`;
          context += `2. REASONING (for chat interface):\n`;
          context += `Explain your thought process:\n`;
          context += `- How you assessed the risk areas\n`;
          context += `- Why you selected specific procedures\n`;
          context += `- Standards and regulations considered\n`;
          context += `- Ask for user feedback on the audit approach\n\n`;
          context += `Format your response as:\n`;
          context += `<DELIVERABLE>\n[audit plan content here]\n</DELIVERABLE>\n\n`;
          context += `<REASONING>\n[your thought process here]\n</REASONING>\n\n`;
          break;
        case 'calculation':
          context += `INSTRUCTIONS FOR FINANCIAL CALCULATION MODE:\n`;
          context += `You are integrated with a full Excel orchestration engine. You can:\n`;
          context += `1. Create Excel workbooks with live formulas (not just static values)\n`;
          context += `2. Build calculation tables with preserved formulas\n`;
          context += `3. Generate depreciation/amortization schedules\n`;
          context += `4. Create tax calculations with breakdown formulas\n`;
          context += `5. Calculate NPV, IRR, and other financial metrics with formulas\n`;
          context += `6. Parse and modify uploaded Excel files\n\n`;
          context += `When responding:\n`;
          context += `- Identify what calculations the user needs\n`;
          context += `- Specify the Excel structure (tables, formulas, charts)\n`;
          context += `- Show formulas that will be created (e.g., "=B2*B3")\n`;
          context += `- Explain your methodology clearly\n`;
          context += `- Note: The system will generate a downloadable Excel file with working formulas\n\n`;
          context += `Available calculation types:\n`;
          context += `- tax: Corporate/personal tax calculations\n`;
          context += `- npv: Net present value with discount rate\n`;
          context += `- irr: Internal rate of return\n`;
          context += `- depreciation: Asset depreciation schedules\n`;
          context += `- amortization: Loan payment schedules\n`;
          context += `- loan: Loan calculations with amortization\n`;
          context += `- custom: Any financial calculation with formulas\n\n`;
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
    
    // Add calculation formatting instructions if calculations were performed
    if (calculations) {
      context += `\n**CALCULATION OUTPUT FORMATTING INSTRUCTIONS:**\n`;
      context += `When presenting financial calculations, use this professional structure:\n\n`;
      context += `1. **Quick Summary Section**\n`;
      context += `   - Lead with key results in plain language\n`;
      context += `   - Use emojis for visual clarity (📊 📈 💰 🎯)\n`;
      context += `   - Include benchmark comparisons where relevant\n\n`;
      context += `2. **Detailed Calculation Breakdown**\n`;
      context += `   - Present data in markdown tables\n`;
      context += `   - Show step-by-step formulas\n`;
      context += `   - Include component descriptions\n\n`;
      context += `3. **Related Metrics** (if applicable)\n`;
      context += `   - Show complementary calculations\n`;
      context += `   - Compare with industry standards\n\n`;
      context += `4. **Trend Analysis** (when historical data exists)\n`;
      context += `   - Show period-over-period changes\n`;
      context += `   - Use trend indicators: 📈 Improving | 📊 Stable | 📉 Declining\n\n`;
      context += `5. **Professional Interpretation**\n`;
      context += `   - Explain what the numbers mean\n`;
      context += `   - Highlight key considerations\n`;
      context += `   - Provide actionable recommendations\n\n`;
      context += `Use clear section headings, bullet points, and tables to organize information professionally.\n\n`;
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
    context += `- **Starts with a simple, clear answer** that anyone can understand, then layers in technical depth\n`;
    context += `- Addresses jurisdiction-specific rules and deadlines (with plain-language explanations)\n`;
    context += `- Considers all detected nuances and contextual factors\n`;
    context += `- Goes deeper than typical LLM responses by identifying subtle implications\n`;
    context += `- Cites relevant standards, regulations, tax code sections, or case law when applicable\n`;
    context += `- **Defines technical terms** when first used to maintain accessibility\n`;
    context += `- Explains calculations clearly with methodology (showing both formulas AND what they mean)\n`;
    context += `- Uses concrete examples and analogies to clarify complex concepts\n`;
    context += `- Structures information with clear headings and bullet points for easy scanning\n`;
    context += `- ASK for missing context when instructed above (partial_answer_then_clarify)\n`;
    context += `- Acknowledges limitations and recommends consulting a licensed professional for final decisions\n`;
    context += `- Proactively identifies additional considerations the user should be aware of\n\n`;
    context += `Remember: You are an expert advisor educating intelligent non-experts. Balance deep expertise with accessibility. Make complex topics understandable without sacrificing accuracy or depth.`;
    
    // ADVANCED REASONING: Add Chain-of-Thought prompt enhancement if enabled
    if (enhancedRouting?.enableChainOfThought && chatMode) {
      const cotEnhancement = reasoningGovernor.getCoTPromptEnhancement(chatMode);
      context += cotEnhancement;
      console.log('[Orchestrator] Chain-of-thought reasoning enabled for', chatMode);
    }
    
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
    
    // NEW: Use intelligent prompt builder to avoid length limits
    const prompts = promptBuilder.buildPrompts(
      userQuery,
      classification,
      calculations,
      clarificationAnalysis,
      chatMode,
      enhancedRouting
    );
    
    // Build messages with tiered prompts
    const messages = [
      // Tier 1: Minimal system prompt
      { role: 'system' as const, content: prompts.systemPrompt },
      // Tier 2: Comprehensive instructions as first message
      { role: 'system' as const, content: prompts.instructionsMessage },
      // Conversation history
      ...history.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content })),
      // Tier 3: User query + context suffix
      { role: 'user' as const, content: userQuery + prompts.contextSuffix }
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
          maxTokens: 8000, // INCREASED: Allow comprehensive multi-page responses (was 2000)
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
  private extractFinancialRatioParameters(query: string): any | null {
    // Extract financial data from query
    const currentAssetsMatch = query.match(/(?:current assets?|CA)\s*(?:of|is|=|:)?\s*\$?([0-9,]+)(?:k|m)?/i);
    const currentLiabilitiesMatch = query.match(/(?:current liabilities?|CL)\s*(?:of|is|=|:)?\s*\$?([0-9,]+)(?:k|m)?/i);
    const inventoryMatch = query.match(/(?:inventory)\s*(?:of|is|=|:)?\s*\$?([0-9,]+)(?:k|m)?/i);
    
    if (currentAssetsMatch && currentLiabilitiesMatch) {
      return {
        currentAssets: this.parseNumber(currentAssetsMatch[1]),
        currentLiabilities: this.parseNumber(currentLiabilitiesMatch[1]),
        totalAssets: this.parseNumber(currentAssetsMatch[1]),
        totalLiabilities: this.parseNumber(currentLiabilitiesMatch[1]),
        inventory: inventoryMatch ? this.parseNumber(inventoryMatch[1]) : 0,
        netIncome: 0,
        equity: 0,
        historicalData: undefined
      };
    }
    
    return null;
  }
  
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

  /**
   * Parse separated content from professional modes
   * Extracts deliverable content and reasoning content
   */
  private parseSeparatedContent(response: string): {
    deliverable: string | null;
    reasoning: string | null;
    remainingContent: string | null;
  } {
    const deliverableMatch = response.match(/<DELIVERABLE>([\s\S]*?)<\/DELIVERABLE>/i);
    const reasoningMatch = response.match(/<REASONING>([\s\S]*?)<\/REASONING>/i);

    if (deliverableMatch && reasoningMatch) {
      return {
        deliverable: deliverableMatch[1].trim(),
        reasoning: reasoningMatch[1].trim(),
        remainingContent: null
      };
    }

    // Fallback: if no tags found, return original content
    return {
      deliverable: null,
      reasoning: null,
      remainingContent: response
    };
  }
}

export const aiOrchestrator = new AIOrchestrator();
