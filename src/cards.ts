// Elaborado por Ismael Muñoz Reyes

import type { AdvisorResult } from './advisor.js';
import { CATALOG, costLabel, modelsOf, providers } from './catalog.js';
import type { KeyStatus } from './keys.js';
import type { EffortLevel, ModelEntry } from './types.js';

function quote(text: string, max = 90): string {
  const limpio = text.replace(/\s+/g, ' ').trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

function modelLine(model: ModelEntry): string {
  const strengths = model.strengths.slice(0, 3).join(', ');
  return `**${model.name}** (\`${model.id}\`) · ${model.provider} · costo: ${costLabel(model.cost)} · ${strengths}`;
}

// Construye la tarjeta visual con las tres opciones sugeridas por el asesor.
export function buildAdvisorCard(result: AdvisorResult): string {
  const lineas: string[] = [];
  lineas.push('### 🤖 Recomendación de modelo — dsh-ai-advisor');
  lineas.push('');
  lineas.push(`**Tarea detectada:** ${result.taskLabel}  `);
  lineas.push(`**Solicitud:** *${quote(result.prompt)}*`);
  lineas.push('');
  for (const item of result.items) {
    lineas.push(
      `${item.option}. ${item.badge} **${item.label}** — ${modelLine(item.model)}`,
    );
    lineas.push(`   _Por qué:_ ${item.reason}`);
  }
  if (result.items.length === 0) {
    lineas.push('_No encontré candidatos para esa tarea. Revisa `/models`._');
  }
  lineas.push('');
  lineas.push(
    '> Para usar uno de estos modelos, dime **"Usa el modelo [número]"** o cámbialo en el selector superior.',
  );
  return lineas.join('\n');
}

// Construye la tarjeta de estado de llaves con sus valores ocultos.
export function buildKeysCard(status: KeyStatus[], keysFile: string, aviso?: string): string {
  const lineas: string[] = [];
  lineas.push('### 🔑 API Keys — dsh-ai-advisor');
  lineas.push('');
  for (const item of status) {
    lineas.push(
      item.present
        ? `- ✅ **${item.provider}** — guardada — \`${item.masked}\``
        : `- ⭕ **${item.provider}** — sin llave`,
    );
  }
  lineas.push('');
  lineas.push(`**Archivo:** \`${keysFile}\``);
  lineas.push('');
  lineas.push('**Gestionar llaves:**');
  lineas.push('- `/keys set <proveedor> <llave>` — guardar o actualizar');
  lineas.push('- `/keys clear <proveedor>` — borrar');
  lineas.push('- `/keys` — volver a mostrar esta tarjeta');
  lineas.push('');
  lineas.push(
    '> Las llaves se guardan fuera del código fuente y nunca se muestran completas en el chat (aparecen como `sk-...A1b2`).',
  );
  if (aviso !== undefined && aviso.length > 0) {
    lineas.push('');
    lineas.push(`**Última acción:** ${aviso}`);
  }
  return lineas.join('\n');
}

// Construye la tarjeta resumen con el modelo actual, proveedores activos y catálogo.
export function buildModelsCard(
  actual: { provider?: string; model?: string; effort?: string } | undefined,
  conectados: KeyStatus[],
  keysFile: string,
): string {
  const lineas: string[] = [];
  lineas.push('### 🧭 Modelos — dsh-ai-advisor');
  lineas.push('');
  if (actual !== undefined && actual.model !== undefined && actual.provider !== undefined) {
    const esfuerzo = actual.effort === undefined ? '' : ` · esfuerzo \`${actual.effort}\``;
    lineas.push(`**Modelo actual:** \`${actual.provider}/${actual.model}\`${esfuerzo}`);
  } else {
    lineas.push('**Modelo actual:** no pude leerlo; revísalo en el selector superior del chat.');
  }
  lineas.push('');
  const conectadosTxt = conectados
    .map((item) => `${item.present ? '✅' : '⭕'} ${item.provider}`)
    .join(' · ');
  lineas.push(`**Proveedores conectados:** ${conectadosTxt}`);
  lineas.push(`**Llaves:** \`${keysFile}\``);
  lineas.push('');
  lineas.push(`**Catálogo:** ${CATALOG.length} modelos en ${providers().length} proveedores.`);
  lineas.push('');
  for (const provider of providers()) {
    const nombres = modelsOf(provider)
      .map((modelo) => `${modelo.name} (\`${modelo.id}\`, ${modelo.cost})`)
      .join(' · ');
    lineas.push(`- **${provider}:** ${nombres}`);
  }
  lineas.push('');
  lineas.push('**Comandos:**');
  lineas.push('- `/advisor <tu tarea>` — recomienda 3 modelos (mejor, equilibrado, económico)');
  lineas.push('- `/keys` — estado y gestión de API Keys');
  lineas.push('- `/models` — esta tarjeta');
  lineas.push('');
  lineas.push(
    '**Herramienta:** `select_model(model_id, effort_level)` con `lite` · `medium` · `high`. Tras una recomendación, dime **"Usa el modelo [número]"**.',
  );
  return lineas.join('\n');
}

// Devuelve la instrucción de esfuerzo que se agrega a la sesión activa.
export function effortSectionText(effort: EffortLevel): string {
  if (effort === 'lite') {
    return 'Esfuerzo de razonamiento: LITE (dsh-ai-advisor). Responde de forma directa y breve: sin deliberación extensa, prioriza velocidad y una respuesta práctica de inmediato.';
  }
  if (effort === 'high') {
    return 'Esfuerzo de razonamiento: HIGH (dsh-ai-advisor). Analiza a fondo antes de responder: explora alternativas, verifica supuestos y entrega una respuesta completa.';
  }
  return 'Esfuerzo de razonamiento: MEDIUM (dsh-ai-advisor). Equilibra reflexión y rapidez: razona lo necesario para no equivocarte y responde de manera concisa.';
}
