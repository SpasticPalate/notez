import { prisma } from '../../lib/db';
import {
  AIProvider,
  AIProviderType,
  AIProviderConfig,
  AIProviderNotConfiguredError,
  AISummarizeOptions,
  AISuggestTitleOptions,
  AISuggestTagsOptions,
} from './types';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { decrypt, encrypt } from '../../utils/encryption';

/**
 * AI Service
 *
 * Manages per-user AI provider configuration and provides unified interface for AI operations
 */
export class AIService {
  private providerCache: Map<string, AIProvider> = new Map();
  private configCache: Map<string, AIProviderConfig> = new Map();

  /**
   * Get the AI provider for a specific user
   * @param userId User ID
   * @throws AIProviderNotConfiguredError if user has not configured AI
   */
  private async getProviderForUser(userId: string): Promise<AIProvider> {
    // Check if we have a cached provider for this user
    if (this.providerCache.has(userId) && this.configCache.has(userId)) {
      return this.providerCache.get(userId)!;
    }

    // Load configuration from database
    const config = await this.getUserConfiguration(userId);
    if (!config) {
      throw new AIProviderNotConfiguredError();
    }

    // Create provider instance
    const provider = this.createProvider(config);

    // Cache the provider and config
    this.providerCache.set(userId, provider);
    this.configCache.set(userId, config);

    return provider;
  }

  /**
   * Get AI provider configuration for a specific user
   * @param userId User ID
   */
  async getUserConfiguration(userId: string): Promise<AIProviderConfig | null> {
    const settings = await prisma.userAISettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      return null;
    }

    // Decrypt API key
    const apiKey = decrypt(settings.encryptedApiKey);

    return {
      provider: settings.provider as AIProviderType,
      apiKey,
      model: settings.model || undefined,
    };
  }

  /**
   * Save AI provider configuration for a specific user
   * @param userId User ID
   * @param config AI provider configuration
   */
  async saveUserConfiguration(userId: string, config: AIProviderConfig): Promise<void> {
    // Encrypt API key before storing
    const encryptedApiKey = encrypt(config.apiKey);

    // Save to database using upsert
    await prisma.userAISettings.upsert({
      where: { userId },
      create: {
        userId,
        provider: config.provider,
        encryptedApiKey,
        model: config.model || null,
      },
      update: {
        provider: config.provider,
        encryptedApiKey,
        model: config.model || null,
      },
    });

    // Clear cache for this user so next request will use new configuration
    this.providerCache.delete(userId);
    this.configCache.delete(userId);
  }

  /**
   * Delete AI configuration for a specific user
   * @param userId User ID
   */
  async deleteUserConfiguration(userId: string): Promise<void> {
    await prisma.userAISettings.delete({
      where: { userId },
    });

    // Clear cache
    this.providerCache.delete(userId);
    this.configCache.delete(userId);
  }

  /**
   * Test connection to AI provider with given configuration
   * @param config AI provider configuration to test
   * @throws Error if connection fails
   */
  async testConnection(config: AIProviderConfig): Promise<boolean> {
    const provider = this.createProvider(config);
    return provider.testConnection();
  }

  /**
   * Summarize note content for a specific user
   * @param userId User ID
   * @param options Summarization options
   */
  async summarize(userId: string, options: AISummarizeOptions): Promise<string> {
    const provider = await this.getProviderForUser(userId);
    return provider.summarize(options);
  }

  /**
   * Suggest title for note content for a specific user
   * @param userId User ID
   * @param options Title suggestion options
   */
  async suggestTitle(userId: string, options: AISuggestTitleOptions): Promise<string> {
    const provider = await this.getProviderForUser(userId);
    return provider.suggestTitle(options);
  }

  /**
   * Suggest tags for note content for a specific user
   * @param userId User ID
   * @param options Tag suggestion options
   */
  async suggestTags(userId: string, options: AISuggestTagsOptions): Promise<string[]> {
    const provider = await this.getProviderForUser(userId);
    return provider.suggestTags(options);
  }

  /**
   * Create AI provider instance based on configuration
   */
  private createProvider(config: AIProviderConfig): AIProvider {
    switch (config.provider) {
      case 'anthropic':
        return new AnthropicProvider(config.apiKey, config.model);
      case 'openai':
        return new OpenAIProvider(config.apiKey, config.model);
      case 'gemini':
        return new GeminiProvider(config.apiKey, config.model);
      default:
        throw new Error(`Unknown AI provider: ${config.provider}`);
    }
  }

  /**
   * Clear cached provider for a user (useful for testing)
   * @param userId User ID (optional - if not provided, clears all)
   */
  clearCache(userId?: string): void {
    if (userId) {
      this.providerCache.delete(userId);
      this.configCache.delete(userId);
    } else {
      this.providerCache.clear();
      this.configCache.clear();
    }
  }
}

// Export singleton instance
export const aiService = new AIService();
