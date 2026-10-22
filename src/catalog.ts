// Elaborado por Ismael Muñoz Reyes

import type { CostLevel, ModelEntry, Strength, TaskKind } from './types.js';

// Catálogo base de modelos con su proveedor, fortalezas y nivel de costo.
export const CATALOG: readonly ModelEntry[] = Object.freeze([
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    provider: 'google',
    strengths: ['razonamiento', 'codigo', 'analisis', 'escritura', 'multimodal'],
    cost: 'alto',
    tier: 3,
    note: 'Tope de gama de Google para tareas extensas y multimodales.',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    strengths: ['razonamiento', 'codigo', 'analisis', 'multimodal'],
    cost: 'alto',
    tier: 3,
    note: 'Razonamiento profundo y análisis de documentos grandes.',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    strengths: ['codigo', 'analisis', 'general', 'traduccion'],
    cost: 'bajo',
    tier: 2,
    note: 'Rápido y económico para tareas cotidianas.',
  },
  {
    id: 'claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    strengths: ['escritura', 'codigo', 'razonamiento', 'analisis'],
    cost: 'medio',
    tier: 3,
    note: 'Excelente equilibrio entre redacción cuidada y programación.',
  },
  {
    id: 'claude-3.5-haiku',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    strengths: ['escritura', 'general', 'traduccion'],
    cost: 'bajo',
    tier: 2,
    note: 'Respuestas ágiles y económicas.',
  },
  {
    id: 'claude-opus-4',
    name: 'Claude Opus 4',
    provider: 'anthropic',
    strengths: ['escritura', 'razonamiento', 'codigo', 'analisis'],
    cost: 'alto',
    tier: 3,
    note: 'Máxima calidad en razonamiento y redacción.',
  },
  {
    id: 'deepseek-v4',
    name: 'DeepSeek-V4',
    provider: 'deepseek',
    strengths: ['razonamiento', 'codigo', 'escritura', 'analisis'],
    cost: 'medio',
    tier: 3,
    note: 'Gran desempeño en razonamiento y código con costo moderado.',
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek Reasoner',
    provider: 'deepseek',
    strengths: ['razonamiento', 'analisis', 'codigo'],
    cost: 'medio',
    tier: 3,
    note: 'Razonamiento paso a paso para problemas complejos.',
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    strengths: ['general', 'codigo', 'escritura'],
    cost: 'bajo',
    tier: 2,
    note: 'Modelo conversacional económico y confiable.',
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    strengths: ['general', 'escritura', 'analisis', 'codigo', 'multimodal'],
    cost: 'medio',
    tier: 3,
    note: 'Modelo de propósito general muy equilibrado de OpenAI.',
  },
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    provider: 'openai',
    strengths: ['codigo', 'analisis', 'escritura'],
    cost: 'medio',
    tier: 3,
    note: 'Confiable para instrucciones largas y desarrollo de software.',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    provider: 'openai',
    strengths: ['general', 'escritura', 'traduccion'],
    cost: 'bajo',
    tier: 2,
    note: 'Económico para tareas sencillas de texto.',
  },
  {
    id: 'mimo',
    name: 'MiMo',
    provider: 'xiaomi',
    strengths: ['razonamiento', 'codigo'],
    cost: 'bajo',
    tier: 2,
    note: 'Razonamiento accesible de Xiaomi.',
  },
  {
    id: 'llama-4-maverick',
    name: 'Llama 4 Maverick',
    provider: 'meta',
    strengths: ['general', 'escritura', 'traduccion'],
    cost: 'bajo',
    tier: 2,
    note: 'Modelo abierto para tareas generales.',
  },
]);

export const COST_WEIGHT: Record<CostLevel, number> = { alto: 3, medio: 2, bajo: 1 };

// Busca un modelo en el catálogo por su identificador o nombre.
export function getModel(id: string): ModelEntry | undefined {
  const normalizado = id.trim().toLowerCase();
  return CATALOG.find((modelo) => modelo.id === normalizado || modelo.name.toLowerCase() === normalizado);
}

// Devuelve la lista de identificadores de todos los modelos del catálogo.
export function modelIds(): string[] {
  return CATALOG.map((modelo) => modelo.id);
}

// Devuelve los proveedores disponibles en el catálogo sin duplicados.
export function providers(): string[] {
  return [...new Set(CATALOG.map((modelo) => modelo.provider))];
}

// Filtra los modelos que pertenecen a un proveedor específico.
export function modelsOf(provider: string): ModelEntry[] {
  return CATALOG.filter((modelo) => modelo.provider === provider);
}

// Formatea el nivel de costo para mostrarlo en la interfaz visual.
export function costLabel(cost: CostLevel): string {
  return cost === 'alto' ? 'alto 💸' : cost === 'medio' ? 'medio 💰' : 'bajo 🪙';
}

// Asocia el tipo de tarea detectada con la fortaleza correspondiente del catálogo.
export function strengthOf(task: TaskKind): Strength {
  switch (task) {
    case 'codigo':
      return 'codigo';
    case 'prosa':
      return 'escritura';
    case 'analisis':
      return 'analisis';
    case 'razonamiento':
      return 'razonamiento';
    default:
      return 'general';
  }
}
