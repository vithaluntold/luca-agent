/**
 * Azure AI Document Intelligence Provider
 * Specialized for financial document analysis (invoices, receipts, tax forms, statements)
 */

import {
  DocumentAnalysisClient,
  AzureKeyCredential,
} from '@azure/ai-form-recognizer';
import { AIProvider } from './base';
import {
  AIProviderName,
  ProviderFeature,
  CompletionRequest,
  CompletionResponse,
  ProviderConfig,
  CostEstimate,
  ProviderError,
} from './types';

export class AzureDocumentIntelligenceProvider extends AIProvider {
  private client: DocumentAnalysisClient | null = null;
  private endpoint: string;
  private apiKey: string;

  constructor(config: ProviderConfig) {
    super(config);
    
    if (!config.endpoint) {
      throw new Error('Azure Document Intelligence endpoint is required');
    }
    if (!config.apiKey) {
      throw new Error('Azure Document Intelligence API key is required');
    }

    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;

    try {
      this.client = new DocumentAnalysisClient(
        this.endpoint,
        new AzureKeyCredential(this.apiKey)
      );
    } catch (error) {
      console.error('[Azure] Failed to initialize Document Intelligence client:', error);
      throw new ProviderError(
        'Failed to initialize Azure Document Intelligence',
        AIProviderName.AZURE_DOCUMENT_INTELLIGENCE,
        'INIT_ERROR',
        false,
        error
      );
    }
  }

  getName(): AIProviderName {
    return AIProviderName.AZURE_DOCUMENT_INTELLIGENCE;
  }

  async generateCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    this.validateRequest(request);

    if (!this.client) {
      throw new ProviderError(
        'Azure client not initialized',
        AIProviderName.AZURE_DOCUMENT_INTELLIGENCE,
        'CLIENT_ERROR',
        false
      );
    }

    try {
      // Extract document URL or data from the last user message
      const lastMessage = request.messages[request.messages.length - 1];
      const documentInfo = this.extractDocumentInfo(lastMessage.content);

      // Use prebuilt models for financial documents
      const model = this.selectModel(documentInfo.type);
      
      let result;
      if (documentInfo.url) {
        // Analyze from URL
        const poller = await this.client.beginAnalyzeDocumentFromUrl(
          model,
          documentInfo.url
        );
        result = await poller.pollUntilDone();
      } else if (documentInfo.base64Data) {
        // Analyze from base64 data
        const buffer = Buffer.from(documentInfo.base64Data, 'base64');
        const poller = await this.client.beginAnalyzeDocument(model, buffer);
        result = await poller.pollUntilDone();
      } else {
        throw new Error('No document URL or data provided');
      }

      // Format the analysis results
      const formattedResult = this.formatAnalysisResult(result, documentInfo.type);

      return {
        content: formattedResult,
        tokensUsed: {
          input: this.estimateTokenCount(request.messages),
          output: Math.ceil(formattedResult.length / 4),
          total: this.estimateTokenCount(request.messages) + Math.ceil(formattedResult.length / 4),
        },
        model: model,
        provider: AIProviderName.AZURE_DOCUMENT_INTELLIGENCE,
        finishReason: 'stop',
        metadata: {
          documentType: documentInfo.type,
          pagesAnalyzed: result.pages?.length || 0,
        },
      };
    } catch (error: any) {
      console.error('[Azure] Document analysis failed:', error);
      
      const isRetryable = error.statusCode === 429 || error.statusCode >= 500;
      
      throw new ProviderError(
        error.message || 'Azure Document Intelligence analysis failed',
        AIProviderName.AZURE_DOCUMENT_INTELLIGENCE,
        error.code || 'ANALYSIS_ERROR',
        isRetryable,
        error
      );
    }
  }

  supportsFeature(feature: ProviderFeature): boolean {
    const supportedFeatures = [
      ProviderFeature.DOCUMENT_INTELLIGENCE,
      ProviderFeature.STRUCTURED_OUTPUT,
      ProviderFeature.VISION,
    ];
    return supportedFeatures.includes(feature);
  }

  estimateCost(request: CompletionRequest): CostEstimate {
    // Azure Document Intelligence pricing (approximate)
    // ~$1.50 per 1000 pages for prebuilt models
    const estimatedPages = 1; // Default to 1 page
    const costPerPage = 0.0015; // $1.50 / 1000
    
    return {
      inputCost: costPerPage * estimatedPages,
      outputCost: 0,
      totalCost: costPerPage * estimatedPages,
      currency: 'USD',
    };
  }

  getAvailableModels(): string[] {
    return [
      'prebuilt-invoice',
      'prebuilt-receipt',
      'prebuilt-tax.us.w2',
      'prebuilt-tax.us.1040',
      'prebuilt-tax.us.1098',
      'prebuilt-tax.us.1099',
      'prebuilt-document',
      'prebuilt-layout',
    ];
  }

  async healthCheck(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      // Simple health check - client initialization succeeded
      return true;
    } catch (error) {
      console.error('[Azure] Health check failed:', error);
      return false;
    }
  }

  /**
   * Extract document URL or base64 data from message content
   */
  private extractDocumentInfo(content: string): {
    url?: string;
    base64Data?: string;
    type: string;
  } {
    // Try to parse JSON format: {"url": "...", "type": "invoice"}
    try {
      const parsed = JSON.parse(content);
      return {
        url: parsed.url,
        base64Data: parsed.data,
        type: parsed.type || 'document',
      };
    } catch {
      // Check if content is a URL
      if (content.startsWith('http://') || content.startsWith('https://')) {
        return { url: content, type: 'document' };
      }
      
      // Check if content is base64 data
      if (content.match(/^[A-Za-z0-9+/]+=*$/)) {
        return { base64Data: content, type: 'document' };
      }

      throw new Error('Invalid document format. Expected URL or base64 data.');
    }
  }

  /**
   * Select the appropriate Azure model based on document type
   */
  private selectModel(documentType: string): string {
    const modelMap: Record<string, string> = {
      invoice: 'prebuilt-invoice',
      receipt: 'prebuilt-receipt',
      w2: 'prebuilt-tax.us.w2',
      '1040': 'prebuilt-tax.us.1040',
      '1098': 'prebuilt-tax.us.1098',
      '1099': 'prebuilt-tax.us.1099',
      tax: 'prebuilt-document',
      document: 'prebuilt-document',
    };

    return modelMap[documentType.toLowerCase()] || 'prebuilt-document';
  }

  /**
   * Format analysis results into readable text
   */
  private formatAnalysisResult(result: any, documentType: string): string {
    let output = `# Document Analysis Results\n\n`;
    output += `**Document Type:** ${documentType}\n`;
    output += `**Pages Analyzed:** ${result.pages?.length || 0}\n\n`;

    // Extract key-value pairs
    if (result.keyValuePairs && result.keyValuePairs.length > 0) {
      output += `## Extracted Fields\n\n`;
      for (const pair of result.keyValuePairs) {
        const key = pair.key?.content || 'Unknown';
        const value = pair.value?.content || 'N/A';
        output += `- **${key}:** ${value}\n`;
      }
      output += '\n';
    }

    // Extract tables
    if (result.tables && result.tables.length > 0) {
      output += `## Tables\n\n`;
      for (let i = 0; i < result.tables.length; i++) {
        const table = result.tables[i];
        output += `### Table ${i + 1}\n`;
        output += `Rows: ${table.rowCount}, Columns: ${table.columnCount}\n\n`;
        
        // Format first few rows as preview
        if (table.cells && table.cells.length > 0) {
          const preview = table.cells.slice(0, 10);
          for (const cell of preview) {
            output += `Row ${cell.rowIndex}, Col ${cell.columnIndex}: ${cell.content}\n`;
          }
          if (table.cells.length > 10) {
            output += `... (${table.cells.length - 10} more cells)\n`;
          }
        }
        output += '\n';
      }
    }

    // Extract text content
    if (result.content) {
      output += `## Full Text Content\n\n`;
      output += result.content.substring(0, 2000); // Limit to 2000 chars
      if (result.content.length > 2000) {
        output += `\n\n... (${result.content.length - 2000} more characters)`;
      }
    }

    return output;
  }
}
