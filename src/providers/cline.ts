import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const clineProvider: ProviderDefinition = {
  id: 'cline',
  name: 'Cline',
  baseUrl: 'https://api.cline.bot/api/v1',
  modelsUrl: 'https://api.cline.bot/api/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', contextWindow: 200000, contextWindowFormatted: '200K', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, clineProvider.fallbackModels),
};
