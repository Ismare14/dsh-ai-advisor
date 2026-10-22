// Elaborado por Ismael Muñoz Reyes

import { effortSectionText } from './cards.js';
import { getModel, modelIds } from './catalog.js';
import type { AgentLike, ContextLike, EffortLevel } from './types.js';

export interface SwitchOutcome {
  applied: 'session' | 'default' | 'none';
  model?: { provider: string; model: string };
  effort: EffortLevel;
  message: string;
}

type ServiceLike = Record<string, unknown>;

// Normaliza el nivel de esfuerzo solicitado a uno de los valores válidos.
export function normalizeEffort(value: unknown): EffortLevel {
  const texto = String(value ?? '').trim().toLowerCase();
  if (texto === 'lite' || texto === 'low' || texto === 'min') return 'lite';
  if (texto === 'high' || texto === 'max' || texto === 'full') return 'high';
  return 'medium';
}

// Obtiene un servicio registrado en el contexto del plugin.
export function resolveService(ctx: ContextLike, name: string): ServiceLike | undefined {
  const direct = ctx[name];
  if (direct !== undefined && direct !== null && typeof direct === 'object') return direct as ServiceLike;
  try {
    const viaGet = typeof ctx.get === 'function' ? ctx.get(name) : undefined;
    if (viaGet !== undefined && viaGet !== null && typeof viaGet === 'object') return viaGet as ServiceLike;
  } catch {
    // Si el servicio no existe, se degrada al modo manual.
  }
  return undefined;
}

function shortError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 220);
  return String(error).slice(0, 220);
}

interface RoutableGroup {
  id: string;
  name?: string;
  models: Array<{ id: string; name?: string }>;
}

export interface RoutableTarget {
  provider: string;
  model: string;
  matched: 'exact-id' | 'exact-name' | 'loose' | 'none';
}

function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function groupsOf(catalog: unknown): RoutableGroup[] {
  const data = (catalog ?? {}) as Record<string, unknown>;
  const rawGroups = Array.isArray(data.groups)
    ? data.groups
    : Array.isArray(catalog)
      ? catalog
      : [];
  const groups: RoutableGroup[] = [];
  for (const item of rawGroups as unknown[]) {
    const wrapped = item as { group?: unknown } | undefined;
    const group = (wrapped !== null && typeof wrapped === 'object' && wrapped.group !== undefined ? wrapped.group : item) as
      | Partial<RoutableGroup>
      | undefined;
    if (group === null || typeof group !== 'object' || typeof group.id !== 'string') continue;
    if (!Array.isArray(group.models)) continue;
    groups.push({
      id: group.id,
      ...(typeof group.name === 'string' ? { name: group.name } : {}),
      models: group.models.filter(
        (modelo): modelo is { id: string; name?: string } =>
          modelo !== null && typeof modelo === 'object' && typeof (modelo as { id?: unknown }).id === 'string',
      ),
    });
  }
  return groups;
}

// Traduce un modelo del catálogo local al identificador que reconoce el Harness.
export function resolveRoutableTarget(
  catalog: unknown,
  entry: { id: string; name: string; provider: string },
): RoutableTarget {
  const groups = groupsOf(catalog);
  const id = entry.id.toLowerCase();
  const name = entry.name.toLowerCase();

  for (const group of groups) {
    const match = group.models.find((modelo) => modelo.id.toLowerCase() === id);
    if (match !== undefined) return { provider: group.id, model: match.id, matched: 'exact-id' };
  }
  for (const group of groups) {
    const match = group.models.find((modelo) => (modelo.name ?? '').toLowerCase() === name);
    if (match !== undefined) return { provider: group.id, model: match.id, matched: 'exact-name' };
  }
  const propio = normalizeId(entry.id);
  for (const group of groups) {
    const match = group.models.find((modelo) => {
      const candidato = normalizeId(modelo.id);
      if (candidato.length < 6 || propio.length < 6) return false;
      return candidato === propio || candidato.includes(propio) || propio.includes(candidato);
    });
    if (match !== undefined) return { provider: group.id, model: match.id, matched: 'loose' };
  }
  return { provider: entry.provider, model: entry.id, matched: 'none' };
}

// Cambia el modelo activo de la sesión o sugiere el ajuste manual si el Harness lo rechaza.
export async function switchModel(
  ctx: ContextLike,
  agent: AgentLike | undefined,
  modelId: string,
  effort: EffortLevel,
): Promise<SwitchOutcome> {
  const model = getModel(modelId);
  if (model === undefined) {
    return {
      applied: 'none',
      effort,
      message: `No conozco el modelo "${modelId}". Catálogo disponible: ${modelIds().join(', ')}.`,
    };
  }

  const target = { provider: model.provider, model: model.id };
  const sessionId = String(agent?.session?.id ?? agent?.id ?? '');
  const fallos: string[] = [];

  const controller = resolveService(ctx, 'sessionController');
  const catalogReader = controller?.modelCatalog;
  if (typeof catalogReader === 'function') {
    try {
      const catalog = await (catalogReader as () => unknown).call(controller);
      const mapeado = resolveRoutableTarget(catalog, model);
      if (mapeado.matched !== 'none') {
        target.provider = mapeado.provider;
        target.model = mapeado.model;
      } else {
        fallos.push(`el Harness no incluye "${model.id}" en su catálogo activo`);
      }
    } catch (error) {
      fallos.push(`modelCatalog: ${shortError(error)}`);
    }
  }
  const mapeo =
    target.model === model.id ? '' : ` (id del Harness \`${target.model}\`, mapeado desde \`${model.id}\`)`;

  if (sessionId.length > 0) {
    const selectModel = controller?.selectModel;
    if (typeof selectModel === 'function') {
      try {
        const respuesta = await (selectModel as (request: unknown) => Promise<unknown>).call(controller, {
          sessionId,
          provider: target.provider,
          model: target.model,
          reasoningEffort: effort,
        });
        if (
          respuesta !== null &&
          typeof respuesta === 'object' &&
          (respuesta as { ok?: unknown }).ok === false
        ) {
          const motivo = (respuesta as { error?: unknown }).error;
          throw new Error(typeof motivo === 'string' ? motivo : 'cambio rechazado por el Harness');
        }
        return {
          applied: 'session',
          model: target,
          effort,
          message:
            `✅ Modelo de la sesión cambiado a **${model.name}** (\`${target.model}\`, ${target.provider})${mapeo}. ` +
            `Esfuerzo de razonamiento: \`${effort}\` (aplicado en el prompt de la sesión); el modelo predeterminado se actualiza en segundo plano.`,
        };
      } catch (error) {
        fallos.push(`sessionController.selectModel: ${shortError(error)}`);
      }
    } else {
      fallos.push('sessionController.selectModel no está disponible en esta configuración');
    }
  } else {
    fallos.push('la sesión actual no expone un identificador de sesión');
  }

  const defaults = resolveService(ctx, 'agentDefaultModel');
  const saveSelection = defaults?.saveSelection;
  if (typeof saveSelection === 'function') {
    try {
      await (saveSelection as (next: unknown) => Promise<unknown>).call(defaults, {
        provider: target.provider,
        model: target.model,
        reasoningEffort: effort,
      });
      const readback = defaults?.currentSelection;
      const actual =
        typeof readback === 'function'
          ? (readback as () => { provider?: string; model?: string }).call(defaults)
          : undefined;
      if (actual?.model === target.model) {
        return {
          applied: 'default',
          model: target,
          effort,
          message:
            `🔁 Modelo predeterminado cambiado a **${model.name}** (\`${target.model}\`, ${target.provider})${mapeo}. ` +
            `Esfuerzo de razonamiento: \`${effort}\`. ` +
            `Si esta sesión conserva el anterior, cámbialo en el selector superior.`,
        };
      }
      fallos.push('agentDefaultModel.saveSelection no confirmó el cambio');
    } catch (error) {
      fallos.push(`agentDefaultModel.saveSelection: ${shortError(error)}`);
    }
  } else {
    fallos.push('agentDefaultModel no está disponible en esta configuración');
  }

  const detalle = fallos.length > 0 ? ` (${fallos.join(' · ')})` : '';
  return {
    applied: 'none',
    effort,
    message:
      `⚠️ No pude cambiar el modelo automáticamente${detalle}.\n` +
      `Cámbialo manualmente en el selector superior del chat a **${model.name}** (\`${target.model}\`, ${target.provider})${mapeo}. ` +
      `El esfuerzo \`${effort}\` ya quedó activo en esta sesión; usa \`/models\` para consultar el catálogo.`,
  };
}

// Registra la instrucción de esfuerzo en la sesión y la limpia al terminar o desinstalar.
export function applyEffortSection(
  ctx: ContextLike,
  agent: AgentLike | undefined,
  effort: EffortLevel,
  registry: Map<string, () => void>,
): void {
  const owner: ContextLike = agent?.ctx ?? ctx;
  const prompt = owner.systemPrompt ?? ctx.systemPrompt;
  if (prompt === undefined || typeof prompt.section !== 'function') return;
  const key = String(agent?.session?.id ?? agent?.id ?? 'global');
  const previous = registry.get(key);
  if (previous !== undefined) {
    registry.delete(key);
    try {
      previous();
    } catch {
      // El contexto de la sesión anterior ya fue cerrado.
    }
  }
  try {
    const dispose = prompt.section({
      name: 'dsh-ai-advisor.effort',
      content: effortSectionText(effort),
    });
    if (typeof dispose === 'function') {
      let liberado = false;
      const limpiar = (): void => {
        if (liberado) return;
        liberado = true;
        if (registry.get(key) === limpiar) {
          registry.delete(key);
        }
        try {
          dispose();
        } catch {
          // La sección ya había sido retirada.
        }
      };
      registry.set(key, limpiar);
      if (agent?.ctx !== undefined && typeof agent.ctx.on === 'function') {
        try {
          agent.ctx.on('dispose', limpiar);
        } catch {
          // Si no se puede suscribir al cierre de sesión, se limpia al desinstalar el plugin.
        }
      }
    }
  } catch (error) {
    console.error('[dsh-ai-advisor] no se pudo inyectar el esfuerzo:', shortError(error));
  }
}
