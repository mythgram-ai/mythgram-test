export interface ModelMetadata {
  id: string;
  name: string;
  contextWindow?: number | null;
  contextWindowFormatted?: string | null;
  visionSupport?: boolean | null;
  pricing?: {
    prompt?: string | number | null;
    completion?: string | number | null;
  } | null;
  raw?: any;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  baseUrl: string;
  modelsUrl?: string;
  requiresApiKey: boolean;
  defaultHeaders?: Record<string, string>;
  fallbackModels?: ModelMetadata[];
  description?: string;
  fetchModels?: (baseUrl: string, apiKey?: string, customModelsUrl?: string) => Promise<ModelMetadata[]>;
}

export function formatContextWindow(tokens?: number | null): string | null {
  if (!tokens || tokens <= 0) return null;
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    const k = Math.round(tokens / 1_000);
    return `${k}K`;
  }
  return `${tokens}`;
}

export function parseManualContextWindow(input?: string | null): number | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const match = trimmed.match(/^([\d.]+)\s*([km])?$/i);
  if (!match) {
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const val = parseFloat(match[1]);
  const unit = match[2];
  if (unit === 'm') return Math.round(val * 1_000_000);
  if (unit === 'k') return Math.round(val * 1_000);
  return Math.round(val);
}

export function inferModelMetadata(rawModel: any): ModelMetadata {
  const id = String(rawModel.id || rawModel.name || rawModel.model || '');
  const name = String(rawModel.name || rawModel.display_name || id);

  let contextWindow: number | null =
    rawModel.context_length ??
    rawModel.context_window ??
    rawModel.max_context_length ??
    rawModel.top_provider?.context_length ??
    rawModel.limits?.context_window ??
    rawModel.inputTokenLimit ??
    null;

  if (typeof contextWindow === 'string') {
    contextWindow = parseManualContextWindow(contextWindow);
  }

  // Vision detection from OpenRouter / OpenAI / standard metadata
  let visionSupport: boolean | null = null;
  if (typeof rawModel.vision === 'boolean') {
    visionSupport = rawModel.vision;
  } else if (typeof rawModel.supports_vision === 'boolean') {
    visionSupport = rawModel.supports_vision;
  } else if (Array.isArray(rawModel.architecture?.input_modalities)) {
    visionSupport = rawModel.architecture.input_modalities.includes('image');
  } else if (typeof rawModel.architecture?.modality === 'string') {
    visionSupport = rawModel.architecture.modality.includes('image');
  } else if (Array.isArray(rawModel.modalities)) {
    visionSupport = rawModel.modalities.includes('image') || rawModel.modalities.includes('vision');
  } else if (Array.isArray(rawModel.capabilities)) {
    visionSupport = rawModel.capabilities.includes('vision') || rawModel.capabilities.includes('image');
  } else if (/(vision|vl|pixtral|llava|gpt-4o|claude-3|gemini|qwen.*vl|kimi)/i.test(id)) {
    visionSupport = true;
  }

  let pricing: ModelMetadata['pricing'] = null;
  if (rawModel.pricing && (rawModel.pricing.prompt !== undefined || rawModel.pricing.completion !== undefined)) {
    pricing = {
      prompt: rawModel.pricing.prompt,
      completion: rawModel.pricing.completion,
    };
  }

  return {
    id,
    name,
    contextWindow,
    contextWindowFormatted: formatContextWindow(contextWindow),
    visionSupport,
    pricing,
  };
}

export async function defaultFetchOpenAIModels(
  baseUrl: string,
  apiKey?: string,
  customModelsUrl?: string,
  extraHeaders?: Record<string, string>,
  fallbackModels?: ModelMetadata[]
): Promise<ModelMetadata[]> {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const url = customModelsUrl
    ? customModelsUrl.startsWith('http')
      ? customModelsUrl
      : `${cleanBase}/${customModelsUrl.replace(/^\/+/, '')}`
    : `${cleanBase}/models`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...extraHeaders,
  };
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      if (fallbackModels && fallbackModels.length > 0) return fallbackModels;
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data: any = await res.json();
    const list = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
      ? data.models
      : [];

    const parsed = list
      .map((item: any) => (typeof item === 'string' ? inferModelMetadata({ id: item }) : inferModelMetadata(item)))
      .filter((m: ModelMetadata) => Boolean(m.id));

    if (parsed.length === 0 && fallbackModels && fallbackModels.length > 0) {
      return fallbackModels;
    }
    return parsed;
  } catch (err) {
    if (fallbackModels && fallbackModels.length > 0) {
      return fallbackModels;
    }
    throw err;
  }
}
