import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const zenmuxProvider: ProviderDefinition = {
  id: 'zenmux',
  name: 'ZenMux',
  baseUrl: 'https://zenmux.ai/api/v1',
  modelsUrl: 'https://zenmux.ai/api/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, zenmuxProvider.fallbackModels),
};
