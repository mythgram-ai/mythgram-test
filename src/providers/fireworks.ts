import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const fireworksProvider: ProviderDefinition = {
  id: 'fireworks',
  name: 'Fireworks AI',
  baseUrl: 'https://api.fireworks.ai/inference/v1',
  modelsUrl: 'https://api.fireworks.ai/inference/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'accounts/fireworks/models/deepseek-v3', name: 'DeepSeek V3', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B Instruct', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, fireworksProvider.fallbackModels),
};
