import { ProviderDefinition, inferModelMetadata, ModelMetadata } from './types.js';

export const ollamaCloudProvider: ProviderDefinition = {
  id: 'ollama_cloud',
  name: 'Ollama Cloud',
  baseUrl: 'https://ollama.com/api/v1',
  modelsUrl: 'https://ollama.com/api/tags',
  requiresApiKey: false,
  fallbackModels: [
    { id: 'llama3.3', name: 'Llama 3.3', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'qwen2.5-coder:32b', name: 'Qwen 2.5 Coder 32B', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: false },
    { id: 'llama3.2-vision', name: 'Llama 3.2 Vision', contextWindow: 128000, contextWindowFormatted: '128K', visionSupport: true },
  ],
  fetchModels: async (baseUrl, apiKey, customModelsUrl) => {
    const apiRoot = baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
    const url = customModelsUrl || `${apiRoot}/tags`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey && apiKey.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) return ollamaCloudProvider.fallbackModels!;
      const data: any = await res.json();
      const list = Array.isArray(data?.models) ? data.models : Array.isArray(data?.data) ? data.data : [];
      const parsed: ModelMetadata[] = list.map((m: any) => inferModelMetadata({ id: m.name || m.model || m.id, ...m }));
      return parsed.length > 0 ? parsed : ollamaCloudProvider.fallbackModels!;
    } catch {
      return ollamaCloudProvider.fallbackModels!;
    }
  },
};
