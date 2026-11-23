import { ProviderDefinition, ModelMetadata, formatContextWindow, parseManualContextWindow } from './types.js';
import { openrouterProvider } from './openrouter.js';
import { groqProvider } from './groq.js';
import { nvidiaProvider } from './nvidia.js';
import { fireworksProvider } from './fireworks.js';
import { ollamaCloudProvider } from './ollama_cloud.js';
import { localProvider, normalizeLocalBaseUrl } from './local.js';
import { opencodeZenProvider } from './opencode_zen.js';
import { aihubmixProvider } from './aihubmix.js';
import { blueclawProvider } from './blueclaw.js';
import { requestyProvider } from './requesty.js';
import { unorouterProvider } from './unorouter.js';
import { vercelAiGatewayProvider } from './vercel_ai_gateway.js';
import { zenmuxProvider } from './zenmux.js';
import { kiloCodeProvider } from './kilo_code.js';
import { chutesProvider } from './chutes.js';
import { cohereProvider } from './cohere.js';
import { mistralProvider } from './mistral.js';
import { cerebrasProvider } from './cerebras.js';
import { sambanovaProvider } from './sambanova.js';
import { huggingfaceProvider } from './huggingface.js';
import { pollinationsProvider } from './pollinations.js';
import { zAiProvider } from './z_ai.js';
import { siliconflowProvider } from './siliconflow.js';
import { airforceProvider } from './airforce.js';
import { inceptionlabsProvider } from './inceptionlabs.js';
import { deepseekProvider } from './deepseek.js';
import { routewayProvider } from './routeway.js';
import { opentyphoonProvider } from './opentyphoon.js';
import { sarvamProvider } from './sarvam.js';
import { sealionProvider } from './sealion.js';
import { openadapterProvider } from './openadapter.js';
import { xkiroProvider } from './xkiro.js';
import { apinexProvider } from './apinex.js';
import { clineProvider } from './cline.js';
import { tokenharborProvider } from './tokenharbor.js';
import { commandcodeProvider } from './commandcode.js';
import { codecraftapiProvider } from './codecraftapi.js';
import { createCustomProviderDefinition } from './custom.js';
import { db } from '../db/index.js';

export * from './types.js';

export const BUILTIN_PROVIDERS: ProviderDefinition[] = [
  openrouterProvider,
  groqProvider,
  nvidiaProvider,
  fireworksProvider,
  ollamaCloudProvider,
  localProvider,
  opencodeZenProvider,
  aihubmixProvider,
  blueclawProvider,
  requestyProvider,
  unorouterProvider,
  vercelAiGatewayProvider,
  zenmuxProvider,
  kiloCodeProvider,
  chutesProvider,
  cohereProvider,
  mistralProvider,
  cerebrasProvider,
  sambanovaProvider,
  huggingfaceProvider,
  pollinationsProvider,
  zAiProvider,
  siliconflowProvider,
  airforceProvider,
  inceptionlabsProvider,
  deepseekProvider,
  routewayProvider,
  opentyphoonProvider,
  sarvamProvider,
  sealionProvider,
  openadapterProvider,
  xkiroProvider,
  apinexProvider,
  clineProvider,
  tokenharborProvider,
  commandcodeProvider,
  codecraftapiProvider,
];

export const BUILTIN_PROVIDERS_MAP = new Map<string, ProviderDefinition>(
  BUILTIN_PROVIDERS.map((p) => [p.id, p])
);

export interface ResolvedProviderState {
  id: string;
  name: string;
  baseUrl: string;
  modelsUrl?: string;
  apiKey: string;
  hasApiKey: boolean;
  requiresApiKey: boolean;
  selectedModel: string;
  isCustom: boolean;
  defaultHeaders?: Record<string, string>;
  manualContextLimit?: string | null;
  manualVisionSupport?: boolean | null;
  models: ModelMetadata[];
}

export function getAllResolvedProviders(): ResolvedProviderState[] {
  const savedConfigs = db.getAllProviderConfigs();
  const savedMap = new Map<string, any>();
  for (const cfg of savedConfigs) {
    savedMap.set(cfg.provider_id, cfg);
  }

  const result: ResolvedProviderState[] = [];

  for (const builtin of BUILTIN_PROVIDERS) {
    const saved = savedMap.get(builtin.id);
    let models: ModelMetadata[] = builtin.fallbackModels || [];
    if (saved?.cached_models_json) {
      try {
        const parsed = JSON.parse(saved.cached_models_json);
        if (Array.isArray(parsed) && parsed.length > 0) models = parsed;
      } catch {
        // ignore
      }
    }

    const manualVision =
      saved?.manual_vision_support !== null && saved?.manual_vision_support !== undefined
        ? Boolean(saved.manual_vision_support)
        : null;
    const manualContext = saved?.manual_context_limit || null;

    // Apply manual overrides if model doesn't have metadata
    models = models.map((m) => {
      const ctx = m.contextWindow ?? parseManualContextWindow(manualContext);
      const vis = m.visionSupport !== null && m.visionSupport !== undefined ? m.visionSupport : manualVision;
      return {
        ...m,
        contextWindow: ctx,
        contextWindowFormatted: formatContextWindow(ctx) || manualContext || null,
        visionSupport: vis,
      };
    });

    result.push({
      id: builtin.id,
      name: saved?.name || builtin.name,
      baseUrl: saved?.base_url || builtin.baseUrl,
      modelsUrl: saved?.models_url || builtin.modelsUrl,
      apiKey: saved?.api_key ? '••••••••' + saved.api_key.slice(-4) : '',
      hasApiKey: Boolean(saved?.api_key),
      requiresApiKey: builtin.requiresApiKey,
      selectedModel: saved?.selected_model || (models[0]?.id ?? ''),
      isCustom: false,
      defaultHeaders: builtin.defaultHeaders,
      manualContextLimit: manualContext,
      manualVisionSupport: manualVision,
      models,
    });
  }

  // Add custom providers
  for (const saved of savedConfigs) {
    if (saved.is_custom && !BUILTIN_PROVIDERS_MAP.has(saved.provider_id)) {
      let models: ModelMetadata[] = [];
      if (saved.cached_models_json) {
        try {
          models = JSON.parse(saved.cached_models_json);
        } catch {
          models = [];
        }
      }
      if (saved.selected_model && !models.some((m) => m.id === saved.selected_model)) {
        models.unshift({
          id: saved.selected_model,
          name: saved.selected_model,
          contextWindow: parseManualContextWindow(saved.manual_context_limit),
          contextWindowFormatted: saved.manual_context_limit || null,
          visionSupport: saved.manual_vision_support !== null ? Boolean(saved.manual_vision_support) : null,
        });
      }

      const manualVision =
        saved.manual_vision_support !== null && saved.manual_vision_support !== undefined
          ? Boolean(saved.manual_vision_support)
          : null;
      const manualContext = saved.manual_context_limit || null;

      models = models.map((m) => {
        const ctx = m.contextWindow ?? parseManualContextWindow(manualContext);
        const vis = m.visionSupport !== null && m.visionSupport !== undefined ? m.visionSupport : manualVision;
        return {
          ...m,
          contextWindow: ctx,
          contextWindowFormatted: formatContextWindow(ctx) || manualContext || null,
          visionSupport: vis,
        };
      });

      result.push({
        id: saved.provider_id,
        name: saved.name,
        baseUrl: saved.base_url,
        modelsUrl: saved.models_url || undefined,
        apiKey: saved.api_key ? '••••••••' + saved.api_key.slice(-4) : '',
        hasApiKey: Boolean(saved.api_key),
        requiresApiKey: false,
        selectedModel: saved.selected_model || (models[0]?.id ?? ''),
        isCustom: true,
        manualContextLimit: manualContext,
        manualVisionSupport: manualVision,
        models,
      });
    }
  }

  return result;
}

export async function fetchModelsForProvider(
  providerId: string,
  overrideBaseUrl?: string,
  overrideApiKey?: string,
  overrideModelsUrl?: string
): Promise<ModelMetadata[]> {
  const saved = db.getProviderConfig(providerId);
  const builtin = BUILTIN_PROVIDERS_MAP.get(providerId);

  let baseUrl = overrideBaseUrl || saved?.base_url || builtin?.baseUrl || '';
  if (providerId === 'local') {
    baseUrl = normalizeLocalBaseUrl(baseUrl);
  }

  const apiKey =
    overrideApiKey !== undefined && !overrideApiKey.startsWith('••••')
      ? overrideApiKey
      : saved?.api_key || '';
  const modelsUrl = overrideModelsUrl || saved?.models_url || builtin?.modelsUrl;

  let models: ModelMetadata[] = [];
  if (builtin && builtin.fetchModels) {
    models = await builtin.fetchModels(baseUrl, apiKey, modelsUrl);
  } else {
    const customDef = createCustomProviderDefinition({
      id: providerId,
      name: saved?.name || providerId,
      baseUrl,
      modelsUrl,
    });
    models = await customDef.fetchModels!(baseUrl, apiKey, modelsUrl);
  }

  // Persist discovered models in provider_configs cache
  if (saved || builtin) {
    db.saveProviderConfig({
      provider_id: providerId,
      name: saved?.name || builtin?.name || providerId,
      base_url: baseUrl,
      api_key: apiKey,
      models_url: modelsUrl,
      selected_model: saved?.selected_model || models[0]?.id || '',
      is_custom: builtin ? 0 : 1,
      cached_models_json: JSON.stringify(models),
    });
  }

  return models;
}

export function getProviderRuntimeCredentials(providerId: string): {
  baseUrl: string;
  apiKey: string;
  headers: Record<string, string>;
  visionSupport: boolean;
  contextWindow: number;
} {
  const saved = db.getProviderConfig(providerId);
  const builtin = BUILTIN_PROVIDERS_MAP.get(providerId);
  let baseUrl = saved?.base_url || builtin?.baseUrl || 'https://openrouter.ai/api/v1';
  if (providerId === 'local') {
    baseUrl = normalizeLocalBaseUrl(baseUrl);
  }
  const apiKey = saved?.api_key || '';
  const headers: Record<string, string> = {
    ...(builtin?.defaultHeaders || {}),
  };

  let visionSupport = true;
  if (saved?.manual_vision_support !== null && saved?.manual_vision_support !== undefined) {
    visionSupport = Boolean(saved.manual_vision_support);
  }

  const contextWindow = parseManualContextWindow(saved?.manual_context_limit) || 128000;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    headers,
    visionSupport,
    contextWindow,
  };
}
