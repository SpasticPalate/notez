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

const AI_PROVIDER_KEY = 'ai_provider';
const AI_API_KEY_KEY = 'ai_api_key';
const AI_MODEL_KEY = 'ai_model';

/**
 * AI Service
 *
 * Manages AI provider configuration and provides unified interface for AI operations
 */
export class AIService {
  private cachedProvider: AIProvider | null = null;
  private cachedConfig: AIProviderConfig | null = null;

  /**
   * Get the currently configured AI provider
   * @throws AIProviderNotConfiguredError if no provider is configured
   */
  private async getProvider(): Promise<AIProvider> {
    // Check if we have a cached provider
    if (this.cachedProvider && this.cachedConfig) {
      return this.cachedProvider;
    }

    // Load configuration from database
    const config = await this.getConfiguration();
    if (!config) {
      throw new AIProviderNotConfiguredError();
    }

    // Create provider instance
    this.cachedProvider = this.createProvider(config);
    this.cachedConfig = config;

    return this.cachedProvider;
  }

  /**
   * Get AI provider configuration from database
   */
  async getConfiguration(): Promise<AIProviderConfig | null> {
    const [providerSetting, apiKeySetting, modelSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: AI_PROVIDER_KEY } }),
      prisma.systemSetting.findUnique({ where: { key: AI_API_KEY_KEY } }),
      prisma.systemSetting.findUnique({ where: { key: AI_MODEL_KEY } }),
    ]);

    if (!providerSetting?.value || !apiKeySetting?.value) {
      return null;
    }

    const provider = providerSetting.value as AIProviderType;
    const encryptedApiKey = apiKeySetting.value;
    const model = modelSetting?.value || undefined;

    // Decrypt API key
    const apiKey = decrypt(encryptedApiKey);

    return {
      provider,
      apiKey,
      model,
    };
  }

  /**
   * Save AI provider configuration to database
   */
  async saveConfiguration(config: AIProviderConfig): Promise<void> {
    // Encrypt API key before storing
    const encryptedApiKey = encrypt(config.apiKey);

    // Save to database using upsert to handle both create and update
    await Promise.all([
      prisma.systemSetting.upsert({
        where: { key: AI_PROVIDER_KEY },
        create: { key: AI_PROVIDER_KEY, value: config.provider, encrypted: false },
        update: { value: config.provider },
      }),
      prisma.systemSetting.upsert({
        where: { key: AI_API_KEY_KEY },
        create: { key: AI_API_KEY_KEY, value: encryptedApiKey, encrypted: true },
        update: { value: encryptedApiKey },
      }),
      config.model
        ? prisma.systemSetting.upsert({
            where: { key: AI_MODEL_KEY },
            create: { key: AI_MODEL_KEY, value: config.model, encrypted: false },
            update: { value: config.model },
          })
        : prisma.systemSetting.deleteMany({ where: { key: AI_MODEL_KEY } }),
    ]);

    // Clear cache so next request will use new configuration
    this.cachedProvider = null;
    this.cachedConfig = null;
  }

  /**
   * Test connection to the currently configured AI provider
   * @throws Error if connection fails
   */
  async testConnection(config?: AIProviderConfig): Promise<boolean> {
    // If config provided, test with that (for validation before saving)
    if (config) {
      const provider = this.createProvider(config);
      return provider.testConnection();
    }

    // Otherwise test with current configuration
    const provider = await this.getProvider();
    return provider.testConnection();
  }

  /**
   * Summarize note content
   */
  async summarize(options: AISummarizeOptions): Promise<string> {
    const provider = await this.getProvider();
    return provider.summarize(options);
  }

  /**
   * Suggest title for note content
   */
  async suggestTitle(options: AISuggestTitleOptions): Promise<string> {
    const provider = await this.getProvider();
    return provider.suggestTitle(options);
  }

  /**
   * Suggest tags for note content
   */
  async suggestTags(options: AISuggestTagsOptions): Promise<string[]> {
    const provider = await this.getProvider();
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
   * Clear cached provider (useful for testing)
   */
  clearCache(): void {
    this.cachedProvider = null;
    this.cachedConfig = null;
  }
}

// Export singleton instance
export const aiService = new AIService();
