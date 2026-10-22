// Elaborado por Ismael Muñoz Reyes

import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { classifyTask, recommend } from '../dist/advisor.js';
import { buildAdvisorCard, buildKeysCard, buildModelsCard } from '../dist/cards.js';
import { CATALOG, getModel, modelIds, providers } from '../dist/catalog.js';
import { apply } from '../dist/index.js';
import { deleteKey, keyStatus, loadKeys, maskKey, saveKey } from '../dist/keys.js';
import { applyEffortSection, normalizeEffort, resolveRoutableTarget, switchModel } from '../dist/switch.js';
import type { AgentLike, CommandDefinition, ContextLike } from '../dist/types.js';

let passed = 0;
let failed = 0;

// Verifica una condición y registra el resultado en la salida estándar.
function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    process.stdout.write(`  [OK] ${name}\n`);
  } else {
    failed += 1;
    process.stdout.write(`  [FALLO] ${name}${detail.length > 0 ? ` — ${detail}` : ''}\n`);
  }
}

function section(title: string): void {
  process.stdout.write(`\n${title}\n`);
}

// Ejecuta todas las pruebas del catálogo, asesor, seguridad de llaves y cambio de modelo.
async function main(): Promise<void> {
  section('1) Catálogo de modelos');
  check('el catálogo tiene al menos 8 modelos', CATALOG.length >= 8, `hay ${CATALOG.length}`);
  check(
    'cada modelo incluye proveedor, fortalezas, costo y nivel',
    CATALOG.every(
      (modelo) =>
        typeof modelo.provider === 'string' &&
        modelo.provider.length > 0 &&
        Array.isArray(modelo.strengths) &&
        modelo.strengths.length > 0 &&
        ['alto', 'medio', 'bajo'].includes(modelo.cost) &&
        typeof modelo.tier === 'number',
    ),
  );
  check('los identificadores son únicos', new Set(modelIds()).size === CATALOG.length);
  check('está DeepSeek-V4', getModel('deepseek-v4')?.name === 'DeepSeek-V4');
  check('está Gemini 2.5 Pro', getModel('gemini-2.5-pro') !== undefined);
  check('está Claude 3.5 Sonnet', getModel('claude-3.5-sonnet') !== undefined);
  check('está GPT-4o', getModel('gpt-4o') !== undefined);
  check('está MiMo', getModel('mimo') !== undefined);
  check('hay 4 o más proveedores', providers().length >= 4, providers().join(', '));

  section('2) Comando /advisor');
  const casos: Array<{ prompt: string; tarea: string; fuerte: string }> = [
    {
      prompt: 'Refactoriza esta función en TypeScript y corrige el error del compilador',
      tarea: 'codigo',
      fuerte: 'codigo',
    },
    {
      prompt: 'Redacta un artículo de blog sobre energías renovables con tono cercano',
      tarea: 'prosa',
      fuerte: 'escritura',
    },
    {
      prompt: 'Analiza las ventas del trimestre en este CSV y compáralas con el año anterior',
      tarea: 'analisis',
      fuerte: 'analisis',
    },
    {
      prompt: 'Demuestra paso a paso por qué la suma de dos impares es par',
      tarea: 'razonamiento',
      fuerte: 'razonamiento',
    },
  ];

  for (const caso of casos) {
    const tarea = classifyTask(caso.prompt);
    check(`detecta "${caso.tarea}" en: ${caso.prompt.slice(0, 34)}…`, tarea === caso.tarea, `dio ${tarea}`);

    const resultado = recommend(caso.prompt);
    check(`/advisor "${caso.tarea}" devuelve 3 opciones`, resultado.items.length === 3, `${resultado.items.length}`);
    check(
      `/advisor "${caso.tarea}" respeta el orden mejor, equilibrado y económico`,
      resultado.items.map((item) => item.rank).join(',') === 'top,equilibrado,economico',
      resultado.items.map((item) => item.rank).join(','),
    );
    check(
      `/advisor "${caso.tarea}" propone modelos distintos`,
      new Set(resultado.items.map((item) => item.model.id)).size === 3,
      resultado.items.map((item) => item.model.id).join(','),
    );
    check(
      `la mejor opción de "${caso.tarea}" domina en ${caso.fuerte}`,
      resultado.items[0].model.strengths.includes(caso.fuerte as 'codigo'),
      resultado.items[0].model.strengths.join(','),
    );

    const carta = buildAdvisorCard(resultado);
    check(
      `la tarjeta de "${caso.tarea}" incluye las 3 opciones numeradas`,
      carta.includes('1.') && carta.includes('2.') && carta.includes('3.'),
    );
    check(
      `la tarjeta de "${caso.tarea}" incluye la instrucción de uso`,
      carta.includes('Usa el modelo [número]'),
    );
    check(`la tarjeta de "${caso.tarea}" incluye el identificador del modelo`, carta.includes(resultado.items[0].model.id));
  }

  section('3) Seguridad de llaves');
  const archivo = path.join(tmpdir(), 'dsh-ai-advisor-poc', 'ai_advisor_keys.json');
  rmSync(archivo, { force: true });

  const secreta = 'sk-pruebaMuySecretaA1b2';
  check('sin archivo, no hay llaves', keyStatus(archivo).every((estado) => !estado.present));

  const guardada = saveKey('google', secreta, archivo);
  check('guardar la llave devuelve éxito', guardada.ok === true);
  const leida = loadKeys(archivo);
  check('la llave se leyó completa desde el archivo', leida.keys.google === secreta);
  check('el archivo vive fuera del código fuente', archivo.includes(path.join('dsh-ai-advisor-poc')));

  const enmascarada = maskKey(secreta);
  check('la llave se oculta como sk-...A1b2', enmascarada === 'sk-...A1b2', enmascarada);
  check('la máscara no revela el valor', !enmascarada.includes('pruebaMuySecreta'));

  const estados = keyStatus(archivo);
  check('el estado marca google como presente', estados.find((estado) => estado.provider === 'google')?.present === true);
  check('el estado oculta la llave', estados.find((estado) => estado.provider === 'google')?.masked === 'sk-...A1b2');

  const cartaLlaves = buildKeysCard(estados, archivo);
  check('la tarjeta /keys oculta la llave', cartaLlaves.includes('sk-...A1b2'));
  check('la tarjeta /keys nunca muestra la llave en claro', !cartaLlaves.includes(secreta));
  check('la tarjeta /keys marca proveedores sin llave', cartaLlaves.includes('openai'));

  const comandosRegistrados: CommandDefinition[] = [];
  const desinstalar = apply({
    commands: {
      register(def: CommandDefinition) {
        comandosRegistrados.push(def);
        return () => {};
      },
    },
    tools: { register: () => () => {} },
    systemPrompt: { section: () => () => {} },
  });
  const comandoKeys = comandosRegistrados.find((cmd) => cmd.name === 'keys');
  check('el comando /keys tiene recordInput: false', comandoKeys?.recordInput === false);
  desinstalar();

  check(
    'rechazar un proveedor desconocido funciona',
    saveKey('ninguno', secreta, archivo).ok === false,
  );
  check('borrar la llave funciona', deleteKey('google', archivo).ok === true);
  check('la llave ya no existe', loadKeys(archivo).keys.google === undefined);
  rmSync(archivo, { force: true });

  section('4) Tarjeta /models, cambio de modelo y limpieza de esfuerzo');
  const cartaModelos = buildModelsCard({ provider: 'deepseek', model: 'deepseek-v4', effort: 'medium' }, keyStatus(archivo), archivo);
  check('la tarjeta /models muestra el modelo actual', cartaModelos.includes('deepseek/deepseek-v4'));
  check('la tarjeta /models lista el catálogo', cartaModelos.includes(`${CATALOG.length} modelos`));
  check('la tarjeta /models lista los comandos', cartaModelos.includes('/advisor') && cartaModelos.includes('/keys'));

  check('normalizeEffort(lite) devuelve lite', normalizeEffort('lite') === 'lite');
  check('normalizeEffort(HIGH) devuelve high', normalizeEffort('HIGH') === 'high');
  check('normalizeEffort(raro) devuelve medium', normalizeEffort('raro') === 'medium');

  const ctxVacio = {} as ContextLike;
  const desconocido = await switchModel(ctxVacio, undefined, 'no-existe', 'medium');
  check(
    'un modelo desconocido explica el error',
    desconocido.applied === 'none' && desconocido.message.toLowerCase().includes('no conozco'),
    desconocido.message.slice(0, 60),
  );
  const manual = await switchModel(ctxVacio, undefined, 'deepseek-v4', 'high');
  check(
    'sin servicio disponible devuelve el mensaje de respaldo del selector superior',
    manual.applied === 'none' && manual.message.includes('selector superior'),
    manual.message,
  );

  const ctxRechazo: ContextLike = {
    sessionController: {
      selectModel: async () => {
        throw new Error('ID de modelo rechazado');
      },
    },
  };
  const rechazado = await switchModel(ctxRechazo, { session: { id: 'sesion-1' } }, 'deepseek-v4', 'medium');
  check(
    'si el Harness rechaza el modelo devuelve respaldo amigable',
    rechazado.applied === 'none' && rechazado.message.includes('selector superior'),
    rechazado.message,
  );

  let seccionesActivas = 0;
  let alCerrarSesion: (() => void) | undefined;
  const registroEsfuerzo = new Map<string, () => void>();
  const ctxPrompt: ContextLike = {
    systemPrompt: {
      section: () => {
        seccionesActivas += 1;
        return () => {
          seccionesActivas -= 1;
        };
      },
    },
  };
  const agenteSesion: AgentLike = {
    session: { id: 'sesion-prueba' },
    ctx: {
      on: (evento: string, manejador: () => void) => {
        if (evento === 'dispose') alCerrarSesion = manejador;
      },
    },
  };
  applyEffortSection(ctxPrompt, agenteSesion, 'high', registroEsfuerzo);
  check('la inyección de esfuerzo queda activa en la sesión', seccionesActivas === 1 && registroEsfuerzo.size === 1);
  alCerrarSesion?.();
  check('la inyección de esfuerzo se limpia cuando termina la sesión', seccionesActivas === 0 && registroEsfuerzo.size === 0);

  const catalogoHarness = {
    default: { provider: 'deepseek', model: 'deepseek-chat' },
    routableProviders: ['gemini-argon', 'deepseek', 'xiaomi'],
    groups: [
      {
        id: 'gemini-argon',
        name: 'Gemini (Vertex AI)',
        models: [
          { id: 'gemini-4-argon', name: 'Gemini 4 Argon' },
          { id: 'gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro preview' },
        ],
      },
      { id: 'deepseek', name: 'DeepSeek', models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }] },
      { id: 'xiaomi', name: 'Xiaomi', models: [{ id: 'xiaomi-mimo', name: 'MiMo' }] },
    ],
    failures: [],
  };
  const porId = resolveRoutableTarget(catalogoHarness, {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    provider: 'google',
  });
  check(
    'traduce por identificador exacto al proveedor vivo del Harness',
    porId.provider === 'gemini-argon' && porId.model === 'gemini-4-argon' && porId.matched === 'exact-id',
    JSON.stringify(porId),
  );
  const porNombre = resolveRoutableTarget(catalogoHarness, { id: 'mimo', name: 'MiMo', provider: 'xiaomi' });
  check(
    'traduce por nombre exacto cuando el identificador difiere',
    porNombre.provider === 'xiaomi' && porNombre.model === 'xiaomi-mimo' && porNombre.matched === 'exact-name',
    JSON.stringify(porNombre),
  );
  const laxo = resolveRoutableTarget(catalogoHarness, {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
  });
  check(
    'traduce de forma aproximada cuando el Harness expone un sufijo',
    laxo.model === 'gemini-2.5-pro-preview' && laxo.matched === 'loose',
    JSON.stringify(laxo),
  );
  const sinCoincidencia = resolveRoutableTarget(catalogoHarness, {
    id: 'deepseek-v4',
    name: 'DeepSeek-V4',
    provider: 'deepseek',
  });
  check(
    'sin coincidencia conserva el identificador propio',
    sinCoincidencia.provider === 'deepseek' && sinCoincidencia.model === 'deepseek-v4' && sinCoincidencia.matched === 'none',
    JSON.stringify(sinCoincidencia),
  );
  const enArreglo = resolveRoutableTarget(
    [{ group: { id: 'openai', models: [{ id: 'gpt-4o', name: 'GPT-4o' }] } }],
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  );
  check(
    'acepta también el catálogo en forma de arreglo envuelto',
    enArreglo.provider === 'openai' && enArreglo.matched === 'exact-id',
    JSON.stringify(enArreglo),
  );

  process.stdout.write(`\nResultado: ${passed} comprobaciones exitosas, ${failed} fallos.\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Error al ejecutar las pruebas:', error);
  process.exitCode = 1;
});
