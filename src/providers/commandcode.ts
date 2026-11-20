import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const commandcodeProvider: ProviderDefinition = {
  id: 'commandcode',
  name: 'Command Code',
  baseUrl: 'https://api.commandcode.ai/provider/v1',
  modelsUrl: 'https://api.commandcode.ai/provider/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', contextWindow: 200000, contextWindowFormatted: '200K', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, commandcodeProvider.fallbackModels),
};
