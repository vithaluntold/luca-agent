/**
 * AI Provider Registry and Factory
 * Manages all available AI providers and routes requests
 */

import { AIProvider } from './base';
import { AIProviderName, ProviderConfig, ProviderError } from './types';
import { OpenAIProvider } from './openai.provider';
import { ClaudeProvider } from './claude.provider';
import { GeminiProvider } from './gemini.provider';
import { PerplexityProvider } from './perplexity.provider';
import { AzureDocumentIntelligenceProvider } from './azure.provider';

export class AIProviderRegistry {
  private providers: Map<AIProviderName, AIProvider> = new Map();
  private static instance: AIProviderRegistry;

  private constructor() {
    this.initializeProviders();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): AIProviderRegistry {
    if (!AIProviderRegistry.instance) {
      AIProviderRegistry.instance = new AIProviderRegistry();
    }
    return AIProviderRegistry.instance;
  }

  /**
   * Initialize available providers from environment
   */
  private initializeProviders(): void {
    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAIProvider({
          name: AIProviderName.OPENAI,
          apiKey: process.env.OPENAI_API_KEY,
          defaultModel: 'gpt-4o',
          enabled: true,
        });
        this.providers.set(AIProviderName.OPENAI, openai);
        console.log('[AIProviders] ✓ OpenAI provider initialized');
      } catch (error) {
        console.error('[AIProviders] ✗ Failed to initialize OpenAI:', error);
      }
    }

    // Claude (Anthropic)
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const claude = new ClaudeProvider({
          name: AIProviderName.CLAUDE,
          apiKey: process.env.ANTHROPIC_API_KEY,
          defaultModel: 'claude-3-5-sonnet-20241022',
          enabled: true,
        });
        this.providers.set(AIProviderName.CLAUDE, claude);
        console.log('[AIProviders] ✓ Claude provider initialized');
      } catch (error) {
        console.error('[AIProviders] ✗ Failed to initialize Claude:', error);
      }
    }

    // Gemini (Google)
    if (process.env.GOOGLE_AI_API_KEY) {
      try {
        const gemini = new GeminiProvider({
          name: AIProviderName.GEMINI,
          apiKey: process.env.GOOGLE_AI_API_KEY,
          defaultModel: 'gemini-2.0-flash-exp',
          enabled: true,
        });
        this.providers.set(AIProviderName.GEMINI, gemini);
        console.log('[AIProviders] ✓ Gemini provider initialized');
      } catch (error) {
        console.error('[AIProviders] ✗ Failed to initialize Gemini:', error);
      }
    }

    // Perplexity
    if (process.env.PERPLEXITY_API_KEY) {
      try {
        const perplexity = new PerplexityProvider({
          name: AIProviderName.PERPLEXITY,
          apiKey: process.env.PERPLEXITY_API_KEY,
          defaultModel: 'llama-3.1-sonar-large-128k-online',
          enabled: true,
        });
        this.providers.set(AIProviderName.PERPLEXITY, perplexity);
        console.log('[AIProviders] ✓ Perplexity provider initialized');
      } catch (error) {
        console.error('[AIProviders] ✗ Failed to initialize Perplexity:', error);
      }
    }

    // Azure Document Intelligence
    if (process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY) {
      try {
        const azure = new AzureDocumentIntelligenceProvider({
          name: AIProviderName.AZURE_DOCUMENT_INTELLIGENCE,
          endpoint: process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
          apiKey: process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY,
          defaultModel: 'prebuilt-document',
          enabled: true,
        });
        this.providers.set(AIProviderName.AZURE_DOCUMENT_INTELLIGENCE, azure);
        console.log('[AIProviders] ✓ Azure Document Intelligence provider initialized');
      } catch (error) {
        console.error('[AIProviders] ✗ Failed to initialize Azure Document Intelligence:', error);
      }
    }

    // Log summary
    const activeProviders = Array.from(this.providers.keys()).join(', ');
    if (this.providers.size === 0) {
      console.warn('[AIProviders] ⚠ No AI providers initialized! Check environment variables.');
    } else {
      console.log(`[AIProviders] ${this.providers.size} provider(s) active: ${activeProviders}`);
    }
  }

  /**
   * Get a specific provider by name
   */
  getProvider(name: AIProviderName): AIProvider {
    const provider = this.providers.get(name);
    
    if (!provider) {
      throw new ProviderError(
        `Provider ${name} is not available`,
        name,
        'PROVIDER_NOT_FOUND',
        false
      );
    }

    if (!provider.isEnabled()) {
      throw new ProviderError(
        `Provider ${name} is disabled`,
        name,
        'PROVIDER_DISABLED',
        false
      );
    }

    return provider;
  }

  /**
   * Get all available providers
   */
  getAllProviders(): AIProvider[] {
    return Array.from(this.providers.values()).filter(p => p.isEnabled());
  }

  /**
   * Get provider names that are available
   */
  getAvailableProviderNames(): AIProviderName[] {
    return this.getAllProviders().map(p => p.getName());
  }

  /**
   * Check if a provider is available
   */
  hasProvider(name: AIProviderName): boolean {
    const provider = this.providers.get(name);
    return provider !== undefined && provider.isEnabled();
  }

  /**
   * Register a new provider (for testing or custom providers)
   */
  registerProvider(provider: AIProvider): void {
    this.providers.set(provider.getName(), provider);
    console.log(`[AIProviders] Registered provider: ${provider.getName()}`);
  }

  /**
   * Get health status of all providers
   */
  async getHealthStatus(): Promise<Record<string, boolean>> {
    const status: Record<string, boolean> = {};
    
    const entries = Array.from(this.providers.entries());
    for (const [name, provider] of entries) {
      try {
        status[name] = await provider.healthCheck();
      } catch {
        status[name] = false;
      }
    }

    return status;
  }
}

// Export singleton instance
export const aiProviderRegistry = AIProviderRegistry.getInstance();
