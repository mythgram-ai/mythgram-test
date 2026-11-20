import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const sarvamProvider: ProviderDefinition = {
  id: 'sarvam',
  name: 'Sarvam AI',
  baseUrl: 'https://api.sarvam.ai/v1',
  modelsUrl: 'https://api.sarvam.ai/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'sarvam-m', name: 'Sarvam-M', contextWindow: 32000, contextWindowFormatted: '32K', visionSupport: false },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, sarvamProvider.fallbackModels),
};
