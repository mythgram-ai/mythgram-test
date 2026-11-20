import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const zAiProvider: ProviderDefinition = {
  id: 'z_ai',
  name: 'Z.ai (Zhipu AI)',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
  modelsUrl: 'https://open.bigmodel.cn/api/paas/v4/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'glm-4-plus', name: 'GLM-4 Plus', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'glm-4v-plus', name: 'GLM-4V Plus', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
    { id: 'glm-4-flash', name: 'GLM-4 Flash', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, zAiProvider.fallbackModels),
};
