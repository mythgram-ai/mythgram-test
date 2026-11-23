import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const routewayProvider: ProviderDefinition = {
  id: 'routeway',
  name: 'Routeway',
  baseUrl: 'https://api.routeway.ai/v1',
  modelsUrl: 'https://api.routeway.ai/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, routewayProvider.fallbackModels),
};
