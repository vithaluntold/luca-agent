/**
 * Azure OpenAI Provider
 * Uses Azure OpenAI Service for LLM completions with dedicated endpoints
 */

import { OpenAI } from 'openai';
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

export class AzureOpenAIProvider extends AIProvider {
  private client: OpenAI | null = null;
  private endpoint: string;
  private apiKey: string;
  private deploymentName: string;

  constructor(config: ProviderConfig) {
    super(config);
    
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
    this.apiKey = process.env.AZURE_OPENAI_API_KEY || '';
    this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';

    if (!this.endpoint || !this.apiKey) {
      console.warn('[AzureOpenAI] Missing endpoint or API key - provider will be disabled');
      return;
    }

    try {
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: `${this.endpoint}/openai/deployments/${this.deploymentName}`,
        defaultQuery: { 'api-version': '2024-08-01-preview' },
        defaultHeaders: { 'api-key': this.apiKey },
      });
    } catch (error) {
      console.error('[AzureOpenAI] Failed to initialize client:', error);
      throw new ProviderError(
        'Failed to initialize Azure OpenAI client',
        AIProviderName.AZURE_OPENAI,
        'INIT_ERROR',
        false,
        error
      );
    }
  }

  getName(): AIProviderName {
    return AIProviderName.AZURE_OPENAI;
  }

  async generateCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    this.validateRequest(request);

    if (!this.client) {
      throw new ProviderError(
        'Azure OpenAI client not initialized',
        AIProviderName.AZURE_OPENAI,
        'CLIENT_ERROR',
        false
      );
    }

    try {
      const completion = await this.client.chat.completions.create({
        messages: request.messages,
        model: this.deploymentName,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
        stream: request.stream ?? false,
      });

      const content = completion.choices[0]?.message?.content || '';
      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;

      return {
        content,
        tokensUsed: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
        },
        model: completion.model || this.deploymentName,
        provider: AIProviderName.AZURE_OPENAI,
        finishReason: completion.choices[0]?.finish_reason === 'stop' ? 'stop' : 'error',
      };
    } catch (error: any) {
      console.error('[AzureOpenAI] Completion error:', error);

      // Handle specific Azure OpenAI errors
      if (error.status === 429) {
        throw new ProviderError(
          'Azure OpenAI rate limit exceeded',
          AIProviderName.AZURE_OPENAI,
          'RATE_LIMIT',
          true,
          error
        );
      }

      if (error.status === 401 || error.status === 403) {
        throw new ProviderError(
          'Azure OpenAI authentication failed',
          AIProviderName.AZURE_OPENAI,
          'AUTH_ERROR',
          false,
          error
        );
      }

      if (error.code === 'insufficient_quota') {
        throw new ProviderError(
          'Azure OpenAI quota exceeded',
          AIProviderName.AZURE_OPENAI,
          'QUOTA_EXCEEDED',
          true,
          error
        );
      }

      throw new ProviderError(
        error.message || 'Azure OpenAI request failed',
        AIProviderName.AZURE_OPENAI,
        'API_ERROR',
        true,
        error
      );
    }
  }

  getSupportedFeatures(): ProviderFeature[] {
    return [
      ProviderFeature.CHAT_COMPLETION,
      ProviderFeature.STREAMING,
      ProviderFeature.TOOL_CALLING,
      ProviderFeature.STRUCTURED_OUTPUT,
    ];
  }

  estimateCost(request: CompletionRequest): CostEstimate {
    const inputTokens = this.estimateTokenCount(request.messages);
    const outputTokens = request.maxTokens || 2000;
    
    // Azure OpenAI pricing (approximate, varies by region and deployment)
    const inputCostPer1k = 0.03; // $0.03 per 1K input tokens (gpt-4o)
    const outputCostPer1k = 0.06; // $0.06 per 1K output tokens

    const inputCost = (inputTokens / 1000) * inputCostPer1k;
    const outputCost = (outputTokens / 1000) * outputCostPer1k;

    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      currency: 'USD',
    };
  }

  getAvailableModels(): string[] {
    return [this.deploymentName];
  }
}
