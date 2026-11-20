import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const huggingfaceProvider: ProviderDefinition = {
  id: 'huggingface',
  name: 'Hugging Face',
  baseUrl: 'https://router.huggingface.co/v1',
  modelsUrl: 'https://router.huggingface.co/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', name: 'Qwen 2.5 Coder 32B Instruct', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', contextWindow: 64000, contextWindowFormatted: '64K', visionSupport: false },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, huggingfaceProvider.fallbackModels),
};
