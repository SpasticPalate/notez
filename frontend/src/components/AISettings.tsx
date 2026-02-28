import { useState, useEffect } from 'react';
import { aiApi } from '../lib/api';
import { Bot, Check, X, Loader2, ArrowUp } from 'lucide-react';

type AIProvider = 'anthropic' | 'openai' | 'gemini';

interface AIConfig {
  configured: boolean;
  provider: AIProvider | null;
  model: string | null;
}

export function AISettings() {
  const [config, setConfig] = useState<AIConfig>({ configured: false, provider: null, model: null });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isUpdatingModel, setIsUpdatingModel] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Form state
  const [provider, setProvider] = useState<AIProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; description?: string }>>([]);

  // Track if user is changing provider (requires new API key)
  const [isChangingProvider, setIsChangingProvider] = useState(false);

  // Track model deprecation warning
  const [modelDeprecationWarning, setModelDeprecationWarning] = useState<string | null>(null);

  // Track model fetch errors
  const [modelFetchError, setModelFetchError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  // When AI is already configured, fetch models using stored API key
  useEffect(() => {
    if (config.configured && !isChangingProvider) {
      fetchModelsWithStoredKey();
    }
  }, [config.configured, isChangingProvider]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await aiApi.getSettings();
      const settings = response.data;
      setConfig(settings);

      if (settings.configured && settings.provider) {
        setProvider(settings.provider);
        setModel(settings.model || '');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load AI settings');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch models using the stored API key (for already-configured users)
  const fetchModelsWithStoredKey = async () => {
    setIsFetchingModels(true);
    setModelDeprecationWarning(null);
    setModelFetchError(null);
    try {
      const response = await aiApi.getModels();

      if (response.data.success && response.data.models && response.data.models.length > 0) {
        setAvailableModels(response.data.models);

        // Check if current model is still in the list
        if (model && !response.data.models.find((m: any) => m.id === model)) {
          setModelDeprecationWarning(
            `Your current model "${model}" is no longer available. It may have been deprecated. Please select a new model.`
          );
          // Auto-select the first recommended model (Haiku)
          const sortedModels = sortModelsByRecommendation(response.data.models);
          setModel(sortedModels[0].id);
        }
      } else {
        setModelFetchError('No models returned from provider. Please check your API key.');
      }
    } catch (err: any) {
      if (import.meta.env.DEV) console.warn('Failed to fetch models with stored key:', err);
      setModelFetchError('Failed to fetch models. Click "Refresh Models" to retry.');
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setError('');
    setModelFetchError(null);

    try {
      // Fetch models first - this validates the API key and gets available models
      setIsFetchingModels(true);
      const modelsResponse = await aiApi.listModels({
        provider,
        apiKey,
        model: '',
      });

      if (modelsResponse.data.success && modelsResponse.data.models?.length > 0) {
        const fetchedModels = modelsResponse.data.models;
        setAvailableModels(fetchedModels);

        // Auto-select recommended model (Haiku) if none selected
        const sortedModels = sortModelsByRecommendation(fetchedModels);
        const selectedModel = model || sortedModels[0].id;
        if (!model) {
          setModel(selectedModel);
        }

        // Now test actual connection with a model
        const response = await aiApi.testConnection({
          provider,
          apiKey,
          model: selectedModel,
        });

        setTestResult({
          success: response.data.success,
          message: response.data.success
            ? `Connection successful! ${fetchedModels.length} models available.`
            : response.data.message || 'Connection test failed',
        });
      } else {
        setModelFetchError('No models returned from provider.');
        setTestResult({
          success: false,
          message: 'Could not fetch models. Please verify your API key.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.response?.data?.message || 'Connection failed. Please check your API key.',
      });
      setModelFetchError(err.response?.data?.message || 'Failed to fetch models.');
    } finally {
      setIsTesting(false);
      setIsFetchingModels(false);
    }
  };

  // Update just the model (no API key required)
  const handleModelChange = async (newModel: string) => {
    if (!config.configured || isChangingProvider) {
      // Just update local state if not configured yet
      setModel(newModel);
      setTestResult(null);
      return;
    }

    setIsUpdatingModel(true);
    setError('');
    setSuccess('');

    try {
      await aiApi.updateModel(newModel);
      setModel(newModel);
      setSuccess('Model updated successfully!');
      // Update local config
      setConfig((prev) => ({ ...prev, model: newModel }));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update model');
    } finally {
      setIsUpdatingModel(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Require model selection before saving
    if (!model && availableModels.length === 0) {
      setError('Please test your connection first to load available models.');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');
    setTestResult(null);

    try {
      const sortedModels = sortModelsByRecommendation(availableModels);
      await aiApi.saveSettings({
        provider,
        apiKey,
        model: model || (sortedModels.length > 0 ? sortedModels[0].id : ''),
      });

      setSuccess('AI settings saved successfully! Connection tested and verified.');
      setApiKey(''); // Clear API key from form for security
      setIsChangingProvider(false);
      await loadSettings(); // Reload settings
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save AI settings');
    } finally {
      setIsSaving(false);
    }
  };

  // Provider info - NO hardcoded model lists, only metadata
  const providerInfo = {
    anthropic: {
      name: 'Anthropic Claude',
      description: 'Claude models - Powerful and versatile',
      keyFormat: 'sk-ant-api03-...',
    },
    openai: {
      name: 'OpenAI GPT',
      description: 'GPT models - Versatile and powerful',
      keyFormat: 'sk-...',
    },
    gemini: {
      name: 'Google Gemini',
      description: 'Gemini models - Fast and efficient',
      keyFormat: 'AIza...',
    },
  };

  // Get cost tier and recommendation for a model
  // Tiers are relative within each provider - budget models are significantly cheaper
  const getModelTier = (modelId: string): { tier: 'budget' | 'balanced' | 'premium'; recommended: boolean; label: string } => {
    const id = modelId.toLowerCase();

    // Anthropic models
    if (id.includes('haiku')) return { tier: 'budget', recommended: true, label: 'Best Value' };
    if (id.includes('sonnet')) return { tier: 'balanced', recommended: false, label: '' };
    if (id.includes('opus')) return { tier: 'premium', recommended: false, label: '' };

    // OpenAI models
    if (id.includes('gpt-4o-mini') || id.includes('gpt-3.5')) return { tier: 'budget', recommended: true, label: 'Best Value' };
    if (id.includes('gpt-4o') && !id.includes('mini')) return { tier: 'balanced', recommended: false, label: '' };
    if (id.includes('gpt-4')) return { tier: 'premium', recommended: false, label: '' };

    // Gemini models
    if (id.includes('flash')) return { tier: 'budget', recommended: true, label: 'Best Value' };
    if (id.includes('pro')) return { tier: 'balanced', recommended: false, label: '' };

    return { tier: 'balanced', recommended: false, label: '' };
  };

  // Sort models: recommended first, then by tier (budget -> balanced -> premium)
  const sortModelsByRecommendation = (models: Array<{ id: string; name: string; description?: string }>) => {
    return [...models].sort((a, b) => {
      const tierA = getModelTier(a.id);
      const tierB = getModelTier(b.id);

      // Recommended models first
      if (tierA.recommended && !tierB.recommended) return -1;
      if (!tierA.recommended && tierB.recommended) return 1;

      // Then by tier
      const tierOrder = { budget: 0, balanced: 1, premium: 2 };
      return tierOrder[tierA.tier] - tierOrder[tierB.tier];
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Loading AI settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Bot className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI Configuration Status</h3>
        </div>

        {config.configured ? (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-md p-4">
            <div className="flex items-center space-x-2 text-green-800">
              <Check className="w-5 h-5" />
              <span className="font-medium">AI is configured and ready</span>
            </div>
            <p className="text-sm text-green-700 dark:text-green-400 mt-2">
              Provider: <span className="font-medium">{providerInfo[config.provider!]?.name}</span>
            </p>
            {config.model && (
              <p className="text-sm text-green-700 dark:text-green-400">
                Model: <span className="font-medium">{config.model}</span>
              </p>
            )}
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex items-center space-x-2 text-yellow-800">
              <X className="w-5 h-5" />
              <span className="font-medium">AI is not configured</span>
            </div>
            <p className="text-sm text-yellow-700 mt-2">
              Configure an AI provider below to enable AI features for all users.
            </p>
          </div>
        )}
      </div>

      {/* Model Selection (when already configured) */}
      {config.configured && !isChangingProvider && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Change Model</h3>
            <button
              type="button"
              onClick={fetchModelsWithStoredKey}
              disabled={isFetchingModels}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 flex items-center"
            >
              {isFetchingModels ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  Refreshing...
                </>
              ) : (
                'Refresh Models'
              )}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-md text-sm text-red-800">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-md text-sm text-green-800">
              {success}
            </div>
          )}

          {modelDeprecationWarning && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md text-sm text-yellow-800 dark:text-yellow-200">
              <div className="flex items-start">
                <span className="mr-2">⚠️</span>
                <span>{modelDeprecationWarning}</span>
              </div>
            </div>
          )}

          {modelFetchError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md text-sm text-red-800 dark:text-red-200">
              {modelFetchError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="ai-model-select" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Model
              </label>

              {availableModels.length > 0 ? (
                <>
                  <select
                    id="ai-model-select"
                    name="ai-model"
                    value={model || sortModelsByRecommendation(availableModels)[0].id}
                    onChange={(e) => handleModelChange(e.target.value)}
                    disabled={isFetchingModels || isUpdatingModel}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
                  >
                    {sortModelsByRecommendation(availableModels).map((modelOption) => {
                      const tier = getModelTier(modelOption.id);
                      const tierEmoji = tier.tier === 'budget' ? '⚡' : tier.tier === 'balanced' ? '✨' : '👑';
                      return (
                        <option key={modelOption.id} value={modelOption.id}>
                          {tierEmoji} {modelOption.name}{tier.label ? ` (${tier.label})` : ''}
                        </option>
                      );
                    })}
                  </select>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="text-green-600 dark:text-green-400">⚡ Best Value</span>
                    <span className="text-blue-600 dark:text-blue-400">✨ Balanced</span>
                    <span className="text-purple-600 dark:text-purple-400">👑 Premium</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {availableModels.length} models available • Haiku models recommended for Notez
                  </p>
                </>
              ) : isFetchingModels ? (
                <div className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Fetching available models...
                </div>
              ) : (
                <div className="w-full px-3 py-2 border-2 border-dashed border-blue-300 dark:border-blue-500 rounded-md bg-blue-50/50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 text-sm flex items-center">
                  <ArrowUp className="w-4 h-4 mr-2 flex-shrink-0 rotate-90" />
                  <span>Click "Refresh Models" to load available models</span>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsChangingProvider(true);
                  setApiKey('');
                  setAvailableModels([]);
                  setSuccess('');
                  setError('');
                  setModelFetchError(null);
                }}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Change provider or update API key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Configuration Form (for initial setup or provider change) */}
      {(!config.configured || isChangingProvider) && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {isChangingProvider ? 'Change AI Provider' : 'Configure AI Provider'}
            </h3>
            {isChangingProvider && (
              <button
                type="button"
                onClick={() => {
                  setIsChangingProvider(false);
                  setApiKey('');
                  setError('');
                  setTestResult(null);
                  // Restore original provider/model
                  if (config.provider) setProvider(config.provider);
                  if (config.model) setModel(config.model);
                }}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Cancel
              </button>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-md text-sm text-red-800">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-md text-sm text-green-800">
              {success}
            </div>
          )}

          {testResult && (
            <div
              className={`mb-4 p-3 rounded-md text-sm ${
                testResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 text-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-800'
              }`}
            >
              <div className="flex items-center space-x-2">
                {testResult.success ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                <span>{testResult.message}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            {/* Provider Selection */}
            <div>
              <label htmlFor="ai-provider-select" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">AI Provider</label>
              <select
                id="ai-provider-select"
                name="ai-provider"
                value={provider}
                onChange={(e) => {
                  const newProvider = e.target.value as AIProvider;
                  setProvider(newProvider);
                  setModel(''); // Clear model - will be set after fetching
                  setAvailableModels([]);
                  setTestResult(null);
                  setModelFetchError(null);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="anthropic">Anthropic Claude</option>
                <option value="openai">OpenAI GPT</option>
                <option value="gemini">Google Gemini</option>
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{providerInfo[provider].description}</p>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">API Key</label>
              <input
                type="password"
                required
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder={providerInfo[provider].keyFormat}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Your API key will be encrypted and stored securely
              </p>
            </div>

            {/* Model Selection - Only shown after models are fetched */}
            <div>
              <label htmlFor="ai-model-config-select" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Model {isFetchingModels && <span className="text-xs text-gray-500">(Loading...)</span>}
              </label>

              {availableModels.length > 0 ? (
                <>
                  <select
                    id="ai-model-config-select"
                    name="ai-model-config"
                    value={model || sortModelsByRecommendation(availableModels)[0].id}
                    onChange={(e) => {
                      setModel(e.target.value);
                      setTestResult(null);
                    }}
                    disabled={isFetchingModels}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
                  >
                    {sortModelsByRecommendation(availableModels).map((modelOption) => {
                      const tier = getModelTier(modelOption.id);
                      const tierEmoji = tier.tier === 'budget' ? '⚡' : tier.tier === 'balanced' ? '✨' : '👑';
                      return (
                        <option key={modelOption.id} value={modelOption.id}>
                          {tierEmoji} {modelOption.name}{tier.label ? ` (${tier.label})` : ''}
                        </option>
                      );
                    })}
                  </select>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="text-green-600 dark:text-green-400">⚡ Best Value</span>
                    <span className="text-blue-600 dark:text-blue-400">✨ Balanced</span>
                    <span className="text-purple-600 dark:text-purple-400">👑 Premium</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {availableModels.length} models available • Haiku models recommended for Notez
                  </p>
                </>
              ) : isFetchingModels ? (
                <div className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Fetching available models...
                </div>
              ) : modelFetchError ? (
                <div className="w-full px-3 py-2 border border-red-300 dark:border-red-600 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                  {modelFetchError}
                </div>
              ) : (
                <div className="w-full px-3 py-2 border-2 border-dashed border-blue-300 dark:border-blue-500 rounded-md bg-blue-50/50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 text-sm flex items-center">
                  <ArrowUp className="w-4 h-4 mr-2 flex-shrink-0" />
                  <span>Enter your API key above, then click "Test Connection" to see available models</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={!apiKey || isTesting || isSaving}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Testing...</span>
                  </>
                ) : (
                  <span>Test Connection</span>
                )}
              </button>

              <button
                type="submit"
                disabled={!apiKey || isSaving || isTesting}
                className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Configuration</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">How to get an API key:</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>
            <strong>Anthropic:</strong> Visit{' '}
            <a
              href="https://console.anthropic.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              console.anthropic.com
            </a>
          </li>
          <li>
            <strong>OpenAI:</strong> Visit{' '}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              platform.openai.com/api-keys
            </a>
          </li>
          <li>
            <strong>Google Gemini:</strong> Visit{' '}
            <a
              href="https://makersuite.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              makersuite.google.com/app/apikey
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
