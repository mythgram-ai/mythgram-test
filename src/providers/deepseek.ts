import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const deepseekProvider: ProviderDefinition = {
  id: 'deepseek',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/v1',
  modelsUrl: 'https://api.deepseek.com/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', contextWindow: 64000, contextWindowFormatted: '64K', visionSupport: false },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', contextWindow: 64000, contextWindowFormatted: '64K', visionSupport: false },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, deepseekProvider.fallbackModels),
};
