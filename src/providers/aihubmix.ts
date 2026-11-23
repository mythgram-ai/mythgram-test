import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const aihubmixProvider: ProviderDefinition = {
  id: 'aihubmix',
  name: 'AIHubMix',
  baseUrl: 'https://api.aihubmix.com/v1',
  modelsUrl: 'https://api.aihubmix.com/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200000, contextWindowFormatted: '200K', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, aihubmixProvider.fallbackModels),
};
