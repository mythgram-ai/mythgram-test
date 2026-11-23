import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const sambanovaProvider: ProviderDefinition = {
  id: 'sambanova',
  name: 'SambaNova',
  baseUrl: 'https://api.sambanova.ai/v1',
  modelsUrl: 'https://api.sambanova.ai/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'Meta-Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B Instruct', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'DeepSeek-R1', name: 'DeepSeek R1', contextWindow: 64000, contextWindowFormatted: '64K', visionSupport: false },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, sambanovaProvider.fallbackModels),
};
