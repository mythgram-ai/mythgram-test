import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const unorouterProvider: ProviderDefinition = {
  id: 'unorouter',
  name: 'UnoRouter',
  baseUrl: 'https://api.unorouter.com/v1',
  modelsUrl: 'https://api.unorouter.com/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, unorouterProvider.fallbackModels),
};
