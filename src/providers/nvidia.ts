import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const nvidiaProvider: ProviderDefinition = {
  id: 'nvidia',
  name: 'NVIDIA NIM',
  baseUrl: 'https://integrate.api.nvidia.com/v1',
  modelsUrl: 'https://integrate.api.nvidia.com/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B Instruct', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B Instruct', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, nvidiaProvider.fallbackModels),
};
