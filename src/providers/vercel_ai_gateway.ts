import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const vercelAiGatewayProvider: ProviderDefinition = {
  id: 'vercel_ai_gateway',
  name: 'Vercel AI Gateway',
  baseUrl: 'https://ai-gateway.vercel.sh/v1',
  modelsUrl: 'https://ai-gateway.vercel.sh/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
    { id: 'anthropic/claude-3.7-sonnet', name: 'Anthropic Claude 3.7 Sonnet', contextWindow: 200000, contextWindowFormatted: '200K', visionSupport: true },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, vercelAiGatewayProvider.fallbackModels),
};
