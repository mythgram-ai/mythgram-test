import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const cohereProvider: ProviderDefinition = {
  id: 'cohere',
  name: 'Cohere',
  baseUrl: 'https://api.cohere.ai/compatibility/v1',
  modelsUrl: 'https://api.cohere.ai/compatibility/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'command-a-03-2025', name: 'Command A (03-2025)', contextWindow: 256000, contextWindowFormatted: '256K', visionSupport: false },
    { id: 'command-r-plus-08-2024', name: 'Command R+ (08-2024)', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'command-r-08-2024', name: 'Command R (08-2024)', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'command-r7b-12-2024', name: 'Command R7B (12-2024)', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'aya-vision-32b', name: 'Aya Vision 32B', contextWindow: 16000, contextWindowFormatted: '16K', visionSupport: true },
  ],
  fetchModels: async (baseUrl, apiKey, customModelsUrl) => {
    try {
      const models = await defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, cohereProvider.fallbackModels);
      return models && models.length > 0 ? models : cohereProvider.fallbackModels!;
    } catch {
      return cohereProvider.fallbackModels!;
    }
  },
};
