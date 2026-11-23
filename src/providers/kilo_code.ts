import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const kiloCodeProvider: ProviderDefinition = {
  id: 'kilo_code',
  name: 'Kilo Code',
  baseUrl: 'https://api.kilo.ai/api/gateway',
  modelsUrl: 'https://api.kilo.ai/api/gateway/models',
  requiresApiKey: true,
  defaultHeaders: {
    'X-KiloCode-Version': '4.0.0',
  },
  fallbackModels: [
    { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', contextWindow: 200000, contextWindowFormatted: '200K', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, kiloCodeProvider.defaultHeaders, kiloCodeProvider.fallbackModels),
};
