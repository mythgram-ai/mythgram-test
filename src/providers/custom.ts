import { ProviderDefinition, defaultFetchOpenAIModels } from './types.js';

export function createCustomProviderDefinition(params: {
  id: string;
  name: string;
  baseUrl: string;
  modelsUrl?: string;
}): ProviderDefinition {
  const normalizedId = params.id.startsWith('custom_') ? params.id : `custom_${params.id}`;
  return {
    id: normalizedId,
    name: params.name,
    baseUrl: params.baseUrl,
    modelsUrl: params.modelsUrl,
    requiresApiKey: false,
    fetchModels: (baseUrl, apiKey, customModelsUrl) =>
      defaultFetchOpenAIModels(baseUrl || params.baseUrl, apiKey, customModelsUrl || params.modelsUrl),
  };
}
