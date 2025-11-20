/**
 * Intelligent Prompt Builder
 * 
 * Solves the "prompt too long" problem by splitting context into tiers:
 * - Tier 1 (System): Minimal core identity
 * - Tier 2 (Instructions): Mode-specific guidance as first message
 * - Tier 3 (Context): Query-specific data appended to user message
 * 
 * Also enforces comprehensive, multi-page responses (not shallow 3-sentence answers)
 */

import type { QueryClassification } from './queryTriage';
import type { ClarificationAnalysis } from './requirementClarification';
import type { EnhancedRoutingDecision } from '../../shared/types/reasoning';

export interface PromptComponents {
  systemPrompt: string;          // Minimal core identity
  instructionsMessage: string;    // Detailed mode instructions
  contextSuffix: string;          // Appended to user query
}

export class PromptBuilder {
  /**
   * Build tiered prompts that avoid length limits while forcing comprehensive responses
   */
  buildPrompts(
    query: string,
    classification: QueryClassification,
    calculations: any,
    clarificationAnalysis: ClarificationAnalysis | undefined,
    chatMode: string | undefined,
    enhancedRouting: EnhancedRoutingDecision | null | undefined
  ): PromptComponents {
    // TIER 1: Minimal system prompt (stays small for Gemini compatibility)
    const systemPrompt = this.buildMinimalSystemPrompt();
    
    // TIER 2: Comprehensive instructions as first message
    const instructionsMessage = this.buildInstructionsMessage(
      classification,
      chatMode,
      clarificationAnalysis,
      calculations
    );
    
    // TIER 3: Context suffix appended to actual user query
    const contextSuffix = this.buildContextSuffix(
      classification,
      clarificationAnalysis,
      calculations
    );
    
    return {
      systemPrompt,
      instructionsMessage,
      contextSuffix
    };
  }

  /**
   * TIER 1: Minimal core identity for system prompt
   * Keeps it short to avoid provider limits
   */
  private buildMinimalSystemPrompt(): string {
    return `You are Luca, an expert CPA/CA advisor specializing in accounting, tax, audit, and financial analysis across all major jurisdictions.`;
  }

  /**
   * TIER 2: Comprehensive instructions as first message
   * This is where all the detailed guidance goes
   */
  private buildInstructionsMessage(
    classification: QueryClassification,
    chatMode: string | undefined,
    clarificationAnalysis: ClarificationAnalysis | undefined,
    calculations: any
  ): string {
    let instructions = `# Expert Guidance Framework\n\n`;
    
    // Core behavioral instructions
    instructions += `## Your Professional Approach\n`;
    instructions += `You provide **comprehensive, multi-page responses** with exceptional depth:\n`;
    instructions += `- Cover ALL relevant aspects thoroughly (aim for 1500-3000+ words for complex topics)\n`;
    instructions += `- Provide scenario-based advice with multiple possibilities\n`;
    instructions += `- Address jurisdiction-specific nuances that matter\n`;
    instructions += `- Include concrete examples, case studies, and real-world applications\n`;
    instructions += `- Cite specific regulations, tax codes, and standards\n`;
    instructions += `- Proactively identify edge cases and variations\n`;
    instructions += `- Structure with clear headings, tables, and bullet points\n\n`;
    
    instructions += `## Accessibility Standards\n`;
    instructions += `While maintaining expert-level depth:\n`;
    instructions += `1. Start with a plain-language executive summary\n`;
    instructions += `2. Define technical terms when first used\n`;
    instructions += `3. Use analogies to clarify complex concepts\n`;
    instructions += `4. Provide concrete examples for abstract principles\n`;
    instructions += `5. Highlight key takeaways and action items\n\n`;
    
    // Mode-specific instructions
    if (chatMode && chatMode !== 'standard') {
      instructions += this.getModeInstructions(chatMode);
    }
    
    // Calculation formatting if applicable
    if (calculations) {
      instructions += this.getCalculationFormatting();
    }
    
    // Clarification context if available
    if (clarificationAnalysis) {
      instructions += this.getClarificationContext(clarificationAnalysis);
    }
    
    // CRITICAL: Explicit length/depth requirement
    instructions += `\n## Response Depth Requirement\n`;
    instructions += `**IMPORTANT**: Provide a COMPREHENSIVE, DETAILED response (minimum 1000 words for standard queries, 2000+ for complex topics).\n`;
    instructions += `Do NOT provide shallow 3-4 sentence answers. Users expect professional-grade depth similar to a consulting report.\n`;
    instructions += `If the topic warrants it, your response should be multi-page with:\n`;
    instructions += `- Detailed analysis sections\n`;
    instructions += `- Multiple examples and scenarios\n`;
    instructions += `- Step-by-step breakdowns\n`;
    instructions += `- Comprehensive tables and frameworks\n`;
    instructions += `- Regulatory citations and references\n\n`;
    
    return instructions;
  }

  /**
   * Get mode-specific comprehensive instructions
   */
  private getModeInstructions(chatMode: string): string {
    let modeInstructions = `## Professional Mode: ${chatMode.toUpperCase().replace(/-/g, ' ')}\n\n`;
    
    switch (chatMode) {
      case 'deep-research':
        modeInstructions += `Conduct exhaustive, multi-source analysis:\n`;
        modeInstructions += `- Research ALL relevant regulations, standards, and case law\n`;
        modeInstructions += `- Compare approaches across jurisdictions\n`;
        modeInstructions += `- Analyze historical context and recent changes\n`;
        modeInstructions += `- Identify conflicting interpretations and provide analysis\n`;
        modeInstructions += `- Include extensive citations (IRS pubs, IFRS/GAAP standards, court cases)\n`;
        modeInstructions += `- Provide multi-page detailed report (aim for 2500+ words)\n\n`;
        break;
        
      case 'checklist':
        modeInstructions += `Create TWO comprehensive outputs:\n\n`;
        modeInstructions += `### DELIVERABLE (for download):\n`;
        modeInstructions += `Professional checklist with:\n`;
        modeInstructions += `- [ ] Task items with checkboxes\n`;
        modeInstructions += `- Priority: High/Medium/Low for each item\n`;
        modeInstructions += `- Detailed descriptions and sub-tasks\n`;
        modeInstructions += `- Deadlines and dependencies\n`;
        modeInstructions += `- Regulatory references where applicable\n`;
        modeInstructions += `- 30-50+ items for comprehensive coverage\n\n`;
        modeInstructions += `### REASONING (for chat):\n`;
        modeInstructions += `Extensive explanation (800+ words) covering:\n`;
        modeInstructions += `- Methodology and framework used\n`;
        modeInstructions += `- Why each major section was included\n`;
        modeInstructions += `- Priority determination rationale\n`;
        modeInstructions += `- Standards and best practices applied\n`;
        modeInstructions += `- Industry benchmarks and considerations\n\n`;
        modeInstructions += `Format:\n\`\`\`\n<DELIVERABLE>\n[checklist here]\n</DELIVERABLE>\n\n<REASONING>\n[detailed explanation here]\n</REASONING>\n\`\`\`\n\n`;
        break;
        
      case 'workflow':
        modeInstructions += `Create TWO comprehensive outputs:\n\n`;
        modeInstructions += `### DELIVERABLE (for visualization):\n`;
        modeInstructions += `Detailed workflow with 15-25+ steps:\n`;
        modeInstructions += `Step 1: [Title]\n- [Detailed substep]\n- [Another substep]\n- [Documentation required]\n\n`;
        modeInstructions += `Include decision points, approval gates, parallel processes\n\n`;
        modeInstructions += `### REASONING (for chat):\n`;
        modeInstructions += `Comprehensive explanation (800+ words) of:\n`;
        modeInstructions += `- Workflow design rationale\n`;
        modeInstructions += `- Control points and why they matter\n`;
        modeInstructions += `- Industry best practices applied\n`;
        modeInstructions += `- Alternative approaches considered\n\n`;
        modeInstructions += `Format:\n\`\`\`\n<DELIVERABLE>\n[workflow here]\n</DELIVERABLE>\n\n<REASONING>\n[detailed explanation here]\n</REASONING>\n\`\`\`\n\n`;
        break;
        
      case 'audit-plan':
        modeInstructions += `Create comprehensive audit plan (2000+ words) with:\n`;
        modeInstructions += `- Risk assessment matrix with detailed analysis\n`;
        modeInstructions += `- Materiality calculations and thresholds\n`;
        modeInstructions += `- Detailed audit procedures for each area\n`;
        modeInstructions += `- Testing strategies and sample sizes\n`;
        modeInstructions += `- Required documentation and evidence\n`;
        modeInstructions += `- Timeline with resource allocation\n`;
        modeInstructions += `- Relevant standards (GAAS, ISA, PCAOB)\n`;
        modeInstructions += `- Quality control procedures\n\n`;
        modeInstructions += `Format:\n\`\`\`\n<DELIVERABLE>\n[audit plan here]\n</DELIVERABLE>\n\n<REASONING>\n[methodology explanation here]\n</REASONING>\n\`\`\`\n\n`;
        break;
        
      case 'calculation':
        modeInstructions += `Provide comprehensive calculation analysis:\n`;
        modeInstructions += `- Detailed methodology explanation\n`;
        modeInstructions += `- Step-by-step calculations with formulas\n`;
        modeInstructions += `- Multiple scenarios and sensitivities\n`;
        modeInstructions += `- Benchmark comparisons\n`;
        modeInstructions += `- Professional interpretation of results\n`;
        modeInstructions += `- Recommendations and action items\n`;
        modeInstructions += `Note: Excel file with live formulas will be generated separately\n\n`;
        break;
    }
    
    return modeInstructions;
  }

  /**
   * Calculation formatting instructions
   */
  private getCalculationFormatting(): string {
    return `## Calculation Presentation Format\n\n` +
      `Use this professional structure:\n` +
      `1. **Quick Summary** - Key results with benchmarks\n` +
      `2. **Detailed Breakdown** - Tables with step-by-step formulas\n` +
      `3. **Related Metrics** - Complementary calculations\n` +
      `4. **Trend Analysis** - Period-over-period if applicable\n` +
      `5. **Interpretation** - What it means + recommendations\n\n`;
  }

  /**
   * Clarification context formatting
   */
  private getClarificationContext(clarificationAnalysis: ClarificationAnalysis): string {
    let context = '';
    
    if (clarificationAnalysis.conversationContext) {
      const ctx = clarificationAnalysis.conversationContext;
      context += `## Detected Context\n`;
      if (ctx.jurisdiction) context += `- Jurisdiction: ${ctx.jurisdiction}\n`;
      if (ctx.taxYear) context += `- Tax Year: ${ctx.taxYear}\n`;
      if (ctx.businessType) context += `- Business Type: ${ctx.businessType}\n`;
      if (ctx.entityType) context += `- Entity Type: ${ctx.entityType}\n`;
      if (ctx.filingStatus) context += `- Filing Status: ${ctx.filingStatus}\n`;
      if (ctx.accountingMethod) context += `- Accounting Method: ${ctx.accountingMethod}\n`;
      context += `\n`;
    }
    
    if (clarificationAnalysis.missingContext && clarificationAnalysis.missingContext.length > 0) {
      context += `## Missing Context to Address\n`;
      clarificationAnalysis.missingContext
        .filter(m => m.importance === 'high' || m.importance === 'critical')
        .forEach(missing => {
          context += `- ${missing.category}: ${missing.reason}\n`;
          context += `  Ask: "${missing.suggestedQuestion}"\n`;
        });
      context += `\n`;
    }
    
    if (clarificationAnalysis.detectedNuances && clarificationAnalysis.detectedNuances.length > 0) {
      context += `## Key Nuances to Address\n`;
      clarificationAnalysis.detectedNuances.forEach(nuance => {
        context += `- ${nuance}\n`;
      });
      context += `\n`;
    }
    
    return context;
  }

  /**
   * TIER 3: Context suffix appended to user query
   */
  private buildContextSuffix(
    classification: QueryClassification,
    clarificationAnalysis: ClarificationAnalysis | undefined,
    calculations: any
  ): string {
    let suffix = `\n\n---\n**Classification**: ${classification.domain}`;
    if (classification.subDomain) suffix += ` › ${classification.subDomain}`;
    if (classification.jurisdiction?.length) {
      suffix += ` | Jurisdiction: ${classification.jurisdiction.join(', ')}`;
    }
    suffix += ` | Complexity: ${classification.complexity}`;
    
    if (calculations) {
      suffix += `\n**Calculations Available**: Ready to generate Excel with formulas`;
    }
    
    return suffix;
  }
}

export const promptBuilder = new PromptBuilder();
