import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const inceptionlabsProvider: ProviderDefinition = {
  id: 'inceptionlabs',
  name: 'Inception Labs',
  baseUrl: 'https://api.inceptionlabs.ai/v1',
  modelsUrl: 'https://api.inceptionlabs.ai/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'mercury-coder-small', name: 'Mercury Coder Small', contextWindow: 32000, contextWindowFormatted: '32K', visionSupport: false },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, inceptionlabsProvider.fallbackModels),
};
