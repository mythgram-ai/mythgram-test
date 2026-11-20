import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const openadapterProvider: ProviderDefinition = {
  id: 'openadapter',
  name: 'OpenAdapter',
  baseUrl: 'https://api.openadapter.in/v1',
  modelsUrl: 'https://api.openadapter.in/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, openadapterProvider.fallbackModels),
};
