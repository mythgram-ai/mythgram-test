import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const apinexProvider: ProviderDefinition = {
  id: 'apinex',
  name: 'APInex',
  baseUrl: 'https://api.apinex.bond/v1',
  modelsUrl: 'https://api.apinex.bond/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, apinexProvider.fallbackModels),
};
