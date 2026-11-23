import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const requestyProvider: ProviderDefinition = {
  id: 'requesty',
  name: 'Requesty',
  baseUrl: 'https://router.requesty.ai/v1',
  modelsUrl: 'https://router.requesty.ai/v1/models',
  requiresApiKey: true,
  defaultHeaders: {
    'HTTP-Referer': 'https://mythgram.local',
    'X-Title': 'Mythgram',
  },
  fallbackModels: [
    { id: 'anthropic/claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet', contextWindow: 200000, contextWindowFormatted: '200K', visionSupport: true },
    { id: 'openai/gpt-4o', name: 'GPT-4o', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, requestyProvider.defaultHeaders, requestyProvider.fallbackModels),
};
