import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const opentyphoonProvider: ProviderDefinition = {
  id: 'opentyphoon',
  name: 'OpenTyphoon',
  baseUrl: 'https://api.opentyphoon.ai/v1',
  modelsUrl: 'https://api.opentyphoon.ai/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'typhoon-v2-70b-instruct', name: 'Typhoon v2 70B Instruct', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, opentyphoonProvider.fallbackModels),
};
