import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const codecraftapiProvider: ProviderDefinition = {
  id: 'codecraftapi',
  name: 'CodeCraft API',
  baseUrl: 'https://codecraftapi.com/v1',
  modelsUrl: 'https://codecraftapi.com/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, codecraftapiProvider.fallbackModels),
};
