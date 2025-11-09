/**
 * Multi-Provider AI Architecture - Type Definitions
 * Supports OpenAI, Claude, Gemini, Perplexity, and Azure
 */

export enum AIProviderName {
  OPENAI = 'openai',
  CLAUDE = 'claude',
  GEMINI = 'gemini',
  PERPLEXITY = 'perplexity',
  AZURE_SEARCH = 'azure-search',
  AZURE_DOCUMENT_INTELLIGENCE = 'azure-document-intelligence',
}

export enum ProviderFeature {
  CHAT_COMPLETION = 'chat_completion',
  VISION = 'vision',
  TOOL_CALLING = 'tool_calling',
  LONG_CONTEXT = 'long_context',
  REAL_TIME_SEARCH = 'real_time_search',
  STRUCTURED_OUTPUT = 'structured_output',
  DOCUMENT_INTELLIGENCE = 'document_intelligence',
  KNOWLEDGE_SEARCH = 'knowledge_search',
  STREAMING = 'streaming',
}

export interface CompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  messages: CompletionMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: any[];
  responseFormat?: 'text' | 'json';
  attachment?: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    documentType?: string;
  };
}

export interface CompletionResponse {
  content: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  model: string;
  provider: AIProviderName;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
  metadata?: {
    citations?: string[];
    toolCalls?: any[];
    [key: string]: any;
  };
}

export interface ProviderConfig {
  name: AIProviderName;
  apiKey?: string;
  endpoint?: string;
  defaultModel?: string;
  timeout?: number;
  maxRetries?: number;
  enabled?: boolean;
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: AIProviderName,
    public code: string,
    public retryable: boolean,
    public originalError?: any
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
