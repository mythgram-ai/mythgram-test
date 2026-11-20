import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export const groqProvider: ProviderDefinition = {
  id: 'groq',
  name: 'Groq',
  baseUrl: 'https://api.groq.com/openai/v1',
  modelsUrl: 'https://api.groq.com/openai/v1/models',
  requiresApiKey: true,
  fallbackModels: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill Llama 70B', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
  ],
  fetchModels: (baseUrl, apiKey, customModelsUrl) =>
    defaultFetchOpenAIModels(baseUrl, apiKey, customModelsUrl, undefined, groqProvider.fallbackModels),
};
