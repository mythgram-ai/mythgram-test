import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const openrouterProvider: ProviderDefinition = {
  id: 'openrouter',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  modelsUrl: 'https://openrouter.ai/api/v1/models',
  requiresApiKey: true,
  defaultHeaders: {
    'HTTP-Referer': 'https://mythgram.local',
    'X-Title': 'Mythgram',
  },
  fallbackModels: [
    { id: 'openai/gpt-4o', name: 'GPT-4o', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', contextWindow: 200000, contextWindowFormatted: '200K', visionSupport: true },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', contextWindow: 64000, contextWindowFormatted: '64K', visionSupport: false },
    { id: 'google/gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro', contextWindow: 1000000, contextWindowFormatted: '1M', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, {
      'HTTP-Referer': 'https://mythgram.local',
      'X-Title': 'Mythgram',
    }, openrouterProvider.fallbackModels),
};
