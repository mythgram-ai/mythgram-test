import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const mistralProvider: ProviderDefinition = {
  id: 'mistral',
  name: 'Mistral AI',
  baseUrl: 'https://api.mistral.ai/v1',
  modelsUrl: 'https://api.mistral.ai/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'mistral-large-latest', name: 'Mistral Large', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'codestral-latest', name: 'Codestral', contextWindow: 256000, contextWindowFormatted: '256K', visionSupport: false },
    { id: 'pixtral-large-latest', name: 'Pixtral Large', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, mistralProvider.fallbackModels),
};
