// Elaborado por Ismael Muñoz Reyes

import { buildAdvisorCard, buildKeysCard, buildModelsCard } from './cards.js';
import { CATALOG, modelIds } from './catalog.js';
import { recommend } from './advisor.js';
import {
  KEY_PROVIDERS,
  defaultKeysPath,
  deleteKey,
  keyStatus,
  providerLabel,
  saveKey,
} from './keys.js';
import { applyEffortSection, normalizeEffort, resolveService, switchModel } from './switch.js';
import type {
  AgentLike,
  CommandDefinition,
  CommandResult,
  ContextLike,
  EffortLevel,
  KeyProvider,
  ToolDefinition,
} from './types.js';

export const inject = ['tools', 'commands', 'systemPrompt'];

export interface ResolvedConfig {
  enabled: boolean;
  keysPath: string;
  defaultEffort: EffortLevel;
}

interface PluginState {
  config: ResolvedConfig;
  effortSections: Map<string, () => void>;
}

// Normaliza la configuración del plugin usando valores seguros por defecto.
export function resolveConfig(raw: unknown): ResolvedConfig {
  const config = (raw ?? {}) as Partial<ResolvedConfig> & Record<string, unknown>;
  const keysPath =
    typeof config.keysPath === 'string' && config.keysPath.trim().length > 0
      ? config.keysPath.trim()
      : defaultKeysPath();
  return {
    enabled: config.enabled !== false,
    keysPath,
    defaultEffort: normalizeEffort(config.defaultEffort ?? 'medium'),
  };
}

function keysFileOf(state: PluginState): string {
  return state.config.keysPath || defaultKeysPath();
}

function currentModel(ctx: ContextLike): { provider?: string; model?: string; effort?: string } | undefined {
  const defaults = resolveService(ctx, 'agentDefaultModel');
  const read = defaults?.currentSelection;
  if (typeof read !== 'function') return undefined;
  try {
    const selection = (read as () => { provider?: string; model?: string; reasoningEffort?: string }).call(defaults);
    if (selection === undefined || typeof selection.model !== 'string') return undefined;
    return {
      provider: typeof selection.provider === 'string' ? selection.provider : undefined,
      model: selection.model,
      ...(selection.reasoningEffort === undefined ? {} : { effort: selection.reasoningEffort }),
    };
  } catch {
    return undefined;
  }
}

// Procesa el comando /keys para consultar, guardar o borrar llaves ocultando siempre su valor.
function keysCommand(state: PluginState, rawInput: string): CommandResult {
  const keysFile = keysFileOf(state);
  const partes = rawInput.trim().split(/\s+/).filter((parte) => parte.length > 0);
  if (partes.length === 0) {
    return { kind: 'success', text: buildKeysCard(keyStatus(keysFile), keysFile) };
  }
  const verb = partes[0].toLowerCase();
  const resto = partes.slice(1);

  if (verb === 'set' || verb === 'save' || verb === 'guardar' || verb === 'add') {
    const provider = (resto[0] ?? '').trim();
    const value = resto.slice(1).join(' ').trim();
    if (provider.length === 0 || value.length === 0) {
      return { kind: 'error', text: `Uso: /keys set <proveedor> <llave> · proveedores: ${KEY_PROVIDERS.join(', ')}` };
    }
    const resultado = saveKey(provider, value, keysFile);
    if (!resultado.ok) return { kind: 'error', text: resultado.error };
    const label = providerLabel(provider.trim().toLowerCase() as KeyProvider);
    return {
      kind: 'success',
      text: buildKeysCard(keyStatus(keysFile), keysFile, `${label} guardada como ${resultado.status.masked}.`),
    };
  }

  if (verb === 'clear' || verb === 'delete' || verb === 'borrar' || verb === 'eliminar' || verb === 'remove') {
    const provider = (resto[0] ?? '').trim();
    if (provider.length === 0) {
      return { kind: 'error', text: `Uso: /keys clear <proveedor> · proveedores: ${KEY_PROVIDERS.join(', ')}` };
    }
    const resultado = deleteKey(provider, keysFile);
    if (!resultado.ok) return { kind: 'error', text: resultado.error };
    return {
      kind: 'success',
      text: buildKeysCard(keyStatus(keysFile), keysFile, `Llave de ${provider.toLowerCase()} eliminada.`),
    };
  }

  return {
    kind: 'error',
    text: `No entendí "/keys ${rawInput.trim()}". Usa: /keys · /keys set <proveedor> <llave> · /keys clear <proveedor>. Proveedores: ${KEY_PROVIDERS.join(', ')}.`,
  };
}

// Procesa el comando /advisor y devuelve la tarjeta con los tres modelos recomendados.
function advisorCommand(rawInput: string): CommandResult {
  const prompt = rawInput.trim();
  if (prompt.length === 0) {
    return {
      kind: 'error',
      text: 'Uso: /advisor <tu tarea>, por ejemplo: `/advisor redacta un artículo sobre energías renovables`.',
    };
  }
  return { kind: 'success', text: buildAdvisorCard(recommend(prompt)) };
}

// Procesa el comando /models y muestra el modelo activo junto con el catálogo.
function modelsCommand(ctx: ContextLike, state: PluginState): CommandResult {
  const keysFile = keysFileOf(state);
  return {
    kind: 'success',
    text: buildModelsCard(currentModel(ctx), keyStatus(keysFile), keysFile),
  };
}

// Construye la definición de la herramienta select_model para cambiar el modelo de la sesión.
function selectModelTool(ctx: ContextLike, state: PluginState): ToolDefinition {
  return {
    name: 'select_model',
    description:
      'Cambia el modelo de la sesión actual dentro del catálogo de dsh-ai-advisor y ajusta el esfuerzo de razonamiento (lite/medium/high) en las instrucciones de la sesión. Antes de cambiarlo traduce el model_id contra el catálogo vivo del Harness (modelCatalog) para usar identificadores exactos. Úsala cuando el usuario diga "Usa el modelo <número>" tras una recomendación de /advisor o nombre un modelo del catálogo. Si el Harness no permite el cambio, devuelve la instrucción manual para el selector superior.',
    parameters: {
      type: 'object',
      properties: {
        model_id: {
          type: 'string',
          description: `Identificador del modelo del catálogo (${modelIds().slice(0, 4).join(', ')}, …).`,
        },
        effort_level: {
          type: 'string',
          enum: ['lite', 'medium', 'high'],
          description: 'Esfuerzo de razonamiento para esta sesión. Por defecto: medium.',
        },
      },
      required: ['model_id'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          applied: { type: 'string', description: 'session | default | none' },
          message: { type: 'string', description: 'Resultado legible para el usuario.' },
        },
        required: ['applied', 'message'],
      },
      render: (_args, value) => [
        { type: 'text', text: typeof value.message === 'string' ? value.message : String(value.message) },
      ],
    },
    async execute(args, ejecucion) {
      const modelId = String(args.model_id ?? '').trim();
      const effort = normalizeEffort(args.effort_level ?? state.config.defaultEffort);
      const agent = (ejecucion?.agent ?? undefined) as AgentLike | undefined;
      if (modelId.length === 0) {
        return { applied: 'none', message: 'Falta model_id. Catálogo: ' + modelIds().join(', ') };
      }
      applyEffortSection(ctx, agent, effort, state.effortSections);
      const outcome = await switchModel(ctx, agent, modelId, effort);
      return { applied: outcome.applied, message: outcome.message.replace(/\*\*/g, '') };
    },
  };
}

// Genera el bloque de instrucciones generales del plugin para el agente.
function basePromptSection(): string {
  const catalogo = CATALOG.map((modelo) => `${modelo.id} (${modelo.provider}, costo ${modelo.cost})`).join(', ');
  return [
    'dsh-ai-advisor — gestor de modelos de IA activo.',
    `Catálogo: ${catalogo}.`,
    'Cuando el usuario diga "Usa el modelo <número>" después de una tarjeta /advisor, o nombre un modelo del catálogo, llama select_model(model_id, effort_level); el número corresponde a la opción 1/2/3 de la última tarjeta /advisor.',
    'Las API Keys se gestionan con /keys y jamás deben pedirse ni repetirse en claro: en el chat solo aparecen enmascaradas (sk-...A1b2).',
    'Los proveedores con llave son: ' + KEY_PROVIDERS.join(', ') + '.',
  ].join('\n');
}

// Inicializa el plugin registrando los comandos, la herramienta y las instrucciones base.
export function apply(rawCtx: unknown, rawConfig?: unknown): () => void {
  const ctx = rawCtx as ContextLike;
  const config = resolveConfig(rawConfig);
  if (!config.enabled) return () => {};

  const state: PluginState = { config, effortSections: new Map() };
  const disposers: Array<() => unknown> = [];
  const push = (cancelar: unknown): void => {
    if (typeof cancelar === 'function') disposers.push(cancelar as () => unknown);
  };

  try {
    push(ctx.systemPrompt?.section?.({ name: 'dsh-ai-advisor', content: basePromptSection() }));
  } catch (error) {
    console.error('[dsh-ai-advisor] no se pudo registrar la sección de instrucciones:', error);
  }

  const commands: CommandDefinition[] = [
    {
      definitionId: 'ai-advisor/keys',
      name: 'keys',
      description: 'API Keys de los proveedores de IA: estado enmascarado, guardar o borrar.',
      input: { hint: '[set <proveedor> <llave> | clear <proveedor>]' },
      // Evita que la llave ingresada quede guardada en el historial de la sesión.
      recordInput: false,
      handler: (invocacion) => {
        try {
          return keysCommand(state, invocacion.rawInput);
        } catch (error) {
          return { kind: 'error', text: `No se pudieron leer las llaves: ${String(error)}` };
        }
      },
    },
    {
      definitionId: 'ai-advisor/advisor',
      name: 'advisor',
      description: 'Recomienda 3 modelos (mejor, equilibrado y económico) para la tarea que describas.',
      input: { hint: '<tu tarea o solicitud>' },
      handler: (invocacion) => {
        try {
          return advisorCommand(invocacion.rawInput);
        } catch (error) {
          return { kind: 'error', text: `No se pudo generar la recomendación: ${String(error)}` };
        }
      },
    },
    {
      definitionId: 'ai-advisor/models',
      name: 'models',
      description: 'Modelo actual, proveedores conectados y catálogo de modelos del asesor.',
      handler: () => {
        try {
          return modelsCommand(ctx, state);
        } catch (error) {
          return { kind: 'error', text: `No se pudo leer el catálogo: ${String(error)}` };
        }
      },
    },
  ];

  const commandsService = ctx.commands ?? (resolveService(ctx, 'commands') as
    | { register(definicion: CommandDefinition): unknown }
    | undefined);
  if (commandsService === undefined || typeof commandsService.register !== 'function') {
    console.error('[dsh-ai-advisor] el registro de comandos no está disponible; no se instalarán /keys, /advisor ni /models.');
  } else {
    for (const definicion of commands) {
      try {
        push(commandsService.register(definicion));
      } catch (error) {
        console.error(`[dsh-ai-advisor] no se pudo registrar /${definicion.name}:`, error);
      }
    }
  }

  try {
    push(ctx.tools?.register?.(selectModelTool(ctx, state)));
  } catch (error) {
    console.error('[dsh-ai-advisor] no se pudo registrar select_model:', error);
  }

  return () => {
    for (const cerrar of [...state.effortSections.values()]) {
      try {
        cerrar();
      } catch {
        // El contexto de la sesión ya fue liberado.
      }
    }
    state.effortSections.clear();
    for (const cerrar of disposers.splice(0)) {
      try {
        cerrar();
      } catch (error) {
        console.error('[dsh-ai-advisor] error al liberar recurso:', error);
      }
    }
  };
}
