import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const chutesProvider: ProviderDefinition = {
  id: 'chutes',
  name: 'Chutes',
  baseUrl: 'https://llm.chutes.ai/v1',
  modelsUrl: 'https://llm.chutes.ai/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, chutesProvider.fallbackModels),
};
