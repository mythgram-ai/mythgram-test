import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const pollinationsProvider: ProviderDefinition = {
  id: 'pollinations',
  name: 'Pollinations AI',
  baseUrl: 'https://gen.pollinations.ai/v1',
  modelsUrl: 'https://gen.pollinations.ai/v1/models',
  requiresApiKey: false,
  fallbackModels: [
    { id: 'openai', name: 'OpenAI GPT-4o Mini (Pollinations)', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
    { id: 'deepseek', name: 'DeepSeek V3 (Pollinations)', contextWindow: 64000, contextWindowFormatted: '64K', visionSupport: false },
    { id: 'qwen-coder', name: 'Qwen 2.5 Coder 32B', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, pollinationsProvider.fallbackModels),
};
