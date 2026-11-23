import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const opencodeZenProvider: ProviderDefinition = {
  id: 'opencode_zen',
  name: 'OpenCode Zen',
  baseUrl: 'https://opencode.ai/zen/v1',
  modelsUrl: 'https://opencode.ai/zen/v1/models',
  requiresApiKey: false,
  fallbackModels: [
    { id: 'grok-code-fast-1', name: 'Grok Code Fast 1', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
    { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', contextWindow: 200000, contextWindowFormatted: '200K', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, opencodeZenProvider.fallbackModels),
};
