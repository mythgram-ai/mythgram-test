import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const blueclawProvider: ProviderDefinition = {
  id: 'blueclaw',
  name: 'Blue Claw',
  baseUrl: 'https://openai.blueclaw.network/v1',
  modelsUrl: 'https://openai.blueclaw.network/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, blueclawProvider.fallbackModels),
};
