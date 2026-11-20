import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export function normalizeLocalBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed.endsWith('/v1')) {
    return `${trimmed}/v1`;
  }
  return trimmed;
}

export const localProvider: ProviderDefinition = {
  id: 'local',
  name: 'Local Models (Ollama / LM Studio)',
  baseUrl: 'http://localhost:11434/v1',
  modelsUrl: 'http://localhost:11434/v1/models',
  requiresApiKey: false,
  description: 'Ollama default: http://localhost:11434/v1 | LM Studio alternative: http://localhost:1234/v1',
  fallbackModels: [
    { id: 'llama3.2:latest', name: 'Llama 3.2 (Local)', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'qwen2.5-coder:latest', name: 'Qwen 2.5 Coder (Local)', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'deepseek-r1:latest', name: 'DeepSeek R1 (Local)', contextWindow: 64000, contextWindowFormatted: '64K', visionSupport: false },
  ],
  fetchModels: async (baseUrl, apiKey, customModelsUrl) => {
    const normalized = normalizeLocalBaseUrl(baseUrl || 'http://localhost:11434/v1');
    return defaultFetchOpenAIModels(normalized, apiKey, customModelsUrl, undefined, localProvider.fallbackModels);
  },
};
