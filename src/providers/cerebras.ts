import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const cerebrasProvider: ProviderDefinition = {
  id: 'cerebras',
  name: 'Cerebras',
  baseUrl: 'https://api.cerebras.ai/v1',
  modelsUrl: 'https://api.cerebras.ai/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'llama3.1-8b', name: 'Llama 3.1 8B', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'qwen-3-32b', name: 'Qwen 3 32B', contextWindow: 32000, contextWindowFormatted: '32K', visionSupport: false },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, cerebrasProvider.fallbackModels),
};
