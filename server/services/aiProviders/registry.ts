/**
 * AI Provider Registry and Factory
 * Manages all available AI providers and routes requests
 */

import { AIProvider } from './base';
import { AIProviderName, ProviderConfig, ProviderError } from './types';
import { OpenAIProvider } from './openai.provider';

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
        console.log('[AIProviders] OpenAI provider initialized');
      } catch (error) {
        console.error('[AIProviders] Failed to initialize OpenAI:', error);
      }
    }

    // Claude (Anthropic) - Future
    if (process.env.ANTHROPIC_API_KEY) {
      console.log('[AIProviders] Claude API key found (provider not yet implemented)');
    }

    // Gemini (Google) - Future
    if (process.env.GOOGLE_AI_API_KEY) {
      console.log('[AIProviders] Gemini API key found (provider not yet implemented)');
    }

    // Perplexity - Future
    if (process.env.PERPLEXITY_API_KEY) {
      console.log('[AIProviders] Perplexity API key found (provider not yet implemented)');
    }

    if (this.providers.size === 0) {
      console.warn('[AIProviders] No AI providers initialized! Check environment variables.');
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
