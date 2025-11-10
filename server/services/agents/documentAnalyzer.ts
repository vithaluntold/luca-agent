/**
 * Document Analyzer Agent
 * 
 * Specialized agent for comprehensive document analysis.
 * Uses Azure Document Intelligence for structured data extraction
 * and provides thorough insights from financial documents.
 * 
 * This agent's sole objective is to scan every document thoroughly
 * and extract maximum value from attachments.
 */

import { aiProviderRegistry } from '../aiProviders/registry';
import { AIProviderName } from '../aiProviders/types';
import { AzureDocumentIntelligenceProvider } from '../aiProviders/azure.provider';
import type { CompletionRequest } from '../aiProviders/types';

export interface DocumentAnalysisResult {
  success: boolean;
  analysis: {
    documentType: string;
    extractedText?: string;
    structuredData?: any;
    keyFindings: string[];
    tables?: Array<{
      headers: string[];
      rows: string[][];
    }>;
    keyValuePairs?: Record<string, string>;
  };
  error?: string;
  provider: 'azure-document-intelligence' | 'fallback-extraction';
}

export class DocumentAnalyzerAgent {
  /**
   * Main entry point - thoroughly analyze any attached document
   */
  async analyzeDocument(
    buffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<DocumentAnalysisResult> {
    console.log(`[DocumentAnalyzer] Starting comprehensive analysis of ${filename} (${mimeType})`);
    
    try {
      // Use Azure Document Intelligence for structured extraction
      const azureResult = await this.analyzeWithAzure(buffer, filename, mimeType);
      
      if (azureResult.success) {
        console.log('[DocumentAnalyzer] Azure DI analysis successful');
        return azureResult;
      }
      
      console.log('[DocumentAnalyzer] Azure DI failed, using fallback extraction');
      return await this.fallbackExtraction(buffer, filename, mimeType);
      
    } catch (error: any) {
      console.error('[DocumentAnalyzer] Analysis failed:', error);
      return {
        success: false,
        analysis: {
          documentType: 'unknown',
          keyFindings: [],
        },
        error: error.message || 'Document analysis failed',
        provider: 'fallback-extraction'
      };
    }
  }

  /**
   * Use Azure Document Intelligence for comprehensive structured extraction
   */
  private async analyzeWithAzure(
    buffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<DocumentAnalysisResult> {
    try {
      // Get Azure DI provider from registry
      const provider = aiProviderRegistry.getProvider(AIProviderName.AZURE_DOCUMENT_INTELLIGENCE) as AzureDocumentIntelligenceProvider;
      
      if (!provider) {
        throw new Error('Azure Document Intelligence provider not available');
      }

      // Use Azure DI provider's generateCompletion with attachment
      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Please analyze this document comprehensively.' }],
        attachment: {
          buffer,
          filename,
          mimeType,
        }
      };

      const azureResponse = await provider.generateCompletion(request);

      if (!azureResponse) {
        return {
          success: false,
          analysis: {
            documentType: 'unknown',
            keyFindings: [],
          },
          error: 'Azure Document Intelligence returned no results',
          provider: 'azure-document-intelligence'
        };
      }

      // Extract comprehensive data from Azure response
      const analysis = {
        documentType: this.detectDocumentType(filename, azureResponse.metadata),
        extractedText: azureResponse.content || '',
        structuredData: azureResponse.metadata,
        keyFindings: this.extractKeyFindings(azureResponse.metadata),
        tables: this.extractTables(azureResponse.metadata),
        keyValuePairs: this.extractKeyValuePairs(azureResponse.metadata),
      };

      return {
        success: true,
        analysis,
        provider: 'azure-document-intelligence'
      };

    } catch (error: any) {
      console.error('[DocumentAnalyzer] Azure DI error:', error.message);
      return {
        success: false,
        analysis: {
          documentType: 'unknown',
          keyFindings: [],
        },
        error: error.message,
        provider: 'azure-document-intelligence'
      };
    }
  }

  /**
   * Fallback extraction using pdf-parse for PDFs or basic text extraction
   */
  private async fallbackExtraction(
    buffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<DocumentAnalysisResult> {
    try {
      let extractedText = '';

      // For PDFs, use pdf-parse
      if (mimeType === 'application/pdf') {
        const pdfParse = await import('pdf-parse');
        const pdfData = await (pdfParse as any)(buffer);
        extractedText = pdfData.text;
      } else {
        // For other formats, attempt basic buffer conversion
        extractedText = buffer.toString('utf-8');
      }

      // Limit text to prevent overwhelming responses
      const limitedText = extractedText.substring(0, 15000);

      return {
        success: true,
        analysis: {
          documentType: this.detectDocumentType(filename, null),
          extractedText: limitedText,
          keyFindings: this.extractBasicFindings(limitedText),
        },
        provider: 'fallback-extraction'
      };

    } catch (error: any) {
      console.error('[DocumentAnalyzer] Fallback extraction error:', error);
      return {
        success: false,
        analysis: {
          documentType: 'unknown',
          keyFindings: [],
        },
        error: error.message,
        provider: 'fallback-extraction'
      };
    }
  }

  /**
   * Detect document type from filename and content
   */
  private detectDocumentType(filename: string, azureResponse: any): string {
    const lower = filename.toLowerCase();
    
    // Check filename patterns
    if (lower.includes('annual') && lower.includes('report')) return 'Annual Report';
    if (lower.includes('financial') && lower.includes('statement')) return 'Financial Statement';
    if (lower.includes('balance') && lower.includes('sheet')) return 'Balance Sheet';
    if (lower.includes('income') && lower.includes('statement')) return 'Income Statement';
    if (lower.includes('cash') && lower.includes('flow')) return 'Cash Flow Statement';
    if (lower.includes('tax') && lower.includes('return')) return 'Tax Return';
    if (lower.includes('audit')) return 'Audit Report';
    if (lower.includes('invoice')) return 'Invoice';
    if (lower.includes('receipt')) return 'Receipt';
    if (lower.includes('contract')) return 'Contract';
    
    // Check Azure DI response if available
    if (azureResponse?.docType) return azureResponse.docType;
    
    return 'Financial Document';
  }

  /**
   * Extract key findings from Azure DI response
   */
  private extractKeyFindings(azureResponse: any): string[] {
    const findings: string[] = [];
    
    // Extract from key-value pairs
    if (azureResponse.keyValuePairs) {
      const pairs = azureResponse.keyValuePairs;
      
      // Look for important financial fields
      const importantKeys = [
        'company', 'revenue', 'assets', 'liabilities', 'equity',
        'net income', 'total', 'location', 'jurisdiction', 'date',
        'tax year', 'fiscal year', 'geography', 'operations'
      ];
      
      Object.entries(pairs).forEach(([key, value]) => {
        const keyLower = key.toLowerCase();
        if (importantKeys.some(k => keyLower.includes(k))) {
          findings.push(`${key}: ${value}`);
        }
      });
    }
    
    return findings;
  }

  /**
   * Extract tables from Azure DI response
   */
  private extractTables(azureResponse: any): Array<{ headers: string[]; rows: string[][] }> {
    if (!azureResponse.tables) return [];
    
    return azureResponse.tables.map((table: any) => ({
      headers: table.columnHeaders || [],
      rows: table.cells || []
    }));
  }

  /**
   * Extract key-value pairs from Azure DI response
   */
  private extractKeyValuePairs(azureResponse: any): Record<string, string> {
    return azureResponse.keyValuePairs || {};
  }

  /**
   * Extract basic findings from plain text (fallback)
   */
  private extractBasicFindings(text: string): string[] {
    const findings: string[] = [];
    const lines = text.split('\n');
    
    // Look for lines that might contain important information
    const patterns = [
      /company.*:/i,
      /revenue.*:/i,
      /total.*:/i,
      /location.*:/i,
      /geography.*:/i,
      /operations.*:/i,
      /jurisdiction.*:/i,
      /fiscal.*year.*:/i,
      /tax.*year.*:/i
    ];
    
    lines.forEach(line => {
      if (patterns.some(pattern => pattern.test(line))) {
        findings.push(line.trim());
      }
    });
    
    return findings.slice(0, 20); // Limit to top 20 findings
  }
}

// Export singleton instance
export const documentAnalyzerAgent = new DocumentAnalyzerAgent();
