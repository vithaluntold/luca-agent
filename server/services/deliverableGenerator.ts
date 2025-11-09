import { db } from "../db";
import { deliverableTemplates } from "@shared/schema";
import { eq } from "drizzle-orm";
import { aiOrchestrator } from "./aiOrchestrator";

/**
 * DeliverableGenerator - Generates professional accounting documents using AI
 * 
 * This service creates expert-level deliverables (audit plans, tax memos, checklists)
 * by combining template structures with AI-generated content and real-world citations.
 */
export class DeliverableGenerator {
  /**
   * Generate a professional deliverable from a template
   */
  static async generate(templateId: string, variables: Record<string, any>, userId: string) {
    // Fetch template
    const [template] = await db
      .select()
      .from(deliverableTemplates)
      .where(eq(deliverableTemplates.id, templateId))
      .limit(1);
    
    if (!template) {
      throw new Error('Template not found');
    }
    
    // Build generation prompt
    const prompt = this.buildGenerationPrompt(template, variables);
    
    // Generate content using AI
    const response = await aiOrchestrator.processRequest({
      userId,
      conversationId: null,
      userMessage: prompt,
      conversationHistory: [],
      metadata: {
        documentType: template.type,
        purpose: 'deliverable_generation'
      }
    });
    
    // Extract citations if present
    const citations = this.extractCitations(response.response);
    
    return {
      title: variables.deliverableTitle || template.name,
      type: template.type,
      content: response.response,
      citations,
      modelUsed: response.modelUsed,
      tokensUsed: response.tokensUsed
    };
  }
  
  /**
   * Build AI generation prompt from template and variables
   */
  private static buildGenerationPrompt(template: any, variables: Record<string, any>): string {
    const variableList = Object.entries(variables)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');
    
    return `You are an expert CPA generating a professional ${template.type} document.

Document Type: ${template.name}
Description: ${template.description || 'Professional accounting deliverable'}

Client Variables:
${variableList}

Template Structure:
${template.contentTemplate}

Instructions:
1. Generate a complete, professional ${template.type} using the template structure above
2. Replace all {{variable_name}} placeholders with actual values from the client variables
3. Include specific, actionable content appropriate for this client
4. Add relevant citations to authoritative sources (IRS codes, GAAP standards, PCAOB guidance)
5. Use professional language and proper formatting
6. For checklists, provide detailed action items with deadlines
7. For memos, include executive summary, analysis, and recommendations
8. For audit plans, specify procedures, timing, and responsible parties

Format the output in clean Markdown with appropriate headers, lists, and emphasis.
Include [Citation: Source Name, Section X.X] format for all authoritative references.

Generate the complete deliverable now:`;
  }
  
  /**
   * Extract citations from generated content
   */
  private static extractCitations(content: string): any[] {
    const citationRegex = /\[Citation: ([^\]]+)\]/g;
    const citations: any[] = [];
    let match;
    
    while ((match = citationRegex.exec(content)) !== null) {
      citations.push({
        source: match[1],
        location: match.index
      });
    }
    
    return citations;
  }
}
