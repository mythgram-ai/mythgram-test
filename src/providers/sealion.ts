import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const sealionProvider: ProviderDefinition = {
  id: 'sealion',
  name: 'SEA-LION',
  baseUrl: 'https://api.sea-lion.ai/v1',
  modelsUrl: 'https://api.sea-lion.ai/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'aisingapore/llama3-8b-cpt-sea-lionv2.1-instruct', name: 'SEA-LION v2.1 8B Instruct', contextWindow: 32000, contextWindowFormatted: '32K', visionSupport: false },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, sealionProvider.fallbackModels),
};
