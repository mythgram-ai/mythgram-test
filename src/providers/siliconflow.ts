import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const siliconflowProvider: ProviderDefinition = {
  id: 'siliconflow',
  name: 'SiliconFlow',
  baseUrl: 'https://api.siliconflow.com/v1',
  modelsUrl: 'https://api.siliconflow.com/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', contextWindow: 64000, contextWindowFormatted: '64K', visionSupport: false },
    { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', contextWindow: 64000, contextWindowFormatted: '64K', visionSupport: false },
    { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', name: 'Qwen 2.5 Coder 32B', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, siliconflowProvider.fallbackModels),
};
