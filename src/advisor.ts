// Elaborado por Ismael Muñoz Reyes

import { COST_WEIGHT, CATALOG, strengthOf } from './catalog.js';
import type { ModelEntry, Strength, TaskKind } from './types.js';

export type Rank = 'top' | 'equilibrado' | 'economico';

export interface Recommendation {
  rank: Rank;
  option: number;
  badge: string;
  label: string;
  model: ModelEntry;
  reason: string;
}

export interface AdvisorResult {
  prompt: string;
  task: TaskKind;
  taskLabel: string;
  items: Recommendation[];
}

const PATTERNS: ReadonlyArray<readonly [TaskKind, RegExp]> = [
  [
    'codigo',
    /```|\bfunction\b|\bclass\b|typescript|javascript|python|\bjava\b|\bsql\b|\bnpm\b|\bgit\b|\bbug\b|compil|refactor|regex|endpoint|api\b|componente|hook\b|stack trace|c[óo]digo|funci[óo]n|script|programa|deploy|build|test unit|unit test|bugfix/i,
  ],
  [
    'analisis',
    /an[áa]lis|analiz|datos|csv|excel|gr[áa]fic|tabla de|m[ée]trica|metric|estad[íi]st|informe|reporte|compar|dashboard|tendencias|investig|business intelligence|poblaci[óo]n|\bmuestra\b/i,
  ],
  [
    'razonamiento',
    /matem[áa]tic|ecuaci[óo]n|demostr|l[óo]gica|puzzle|acertijo|algoritmo|estrateg|planific|plan de|por qu[ée]|why\b|razonamiento|deduc|calcul|c[áa]lculo|probabilidad|prueba de/i,
  ],
  [
    'prosa',
    /escribe|redacta|texto|correo|e-?mail|art[íi]culo|blog|historia|narrativa|guion|poema|copy|traduc|translate|newsletter|discurso|publicaci[óo]n|linkedin|resumen del|resumen de texto/i,
  ],
];

const TASK_LABELS: Record<TaskKind, string> = {
  codigo: 'Código',
  prosa: 'Prosa / redacción',
  analisis: 'Análisis de datos',
  razonamiento: 'Razonamiento',
  general: 'General',
};

// Clasifica la solicitud del usuario según el tipo de trabajo que describe.
export function classifyTask(prompt: string): TaskKind {
  const texto = (prompt ?? '').trim();
  if (texto.length < 3) return 'general';
  for (const [kind, pattern] of PATTERNS) {
    if (pattern.test(texto)) return kind;
  }
  return 'general';
}

function matches(model: ModelEntry, strength: Strength): boolean {
  return model.strengths.includes(strength) || model.strengths.includes('general');
}

function directMatch(model: ModelEntry, strength: Strength): boolean {
  return model.strengths.includes(strength);
}

function pick(pool: ModelEntry[], taken: Set<string>): ModelEntry | undefined {
  const libre = pool.find((modelo) => !taken.has(modelo.id));
  const elegido = libre ?? pool[0];
  if (elegido !== undefined) taken.add(elegido.id);
  return elegido;
}

function reasonFor(rank: Rank, model: ModelEntry, task: TaskKind): string {
  const calidad = `${model.tier}/3`;
  if (rank === 'top') {
    return `Máxima calidad para ${TASK_LABELS[task].toLowerCase()} (calidad ${calidad}, fortaleza “${strengthOf(task)}” incluida); costo ${model.cost} sin importar para esta opción.`;
  }
  if (rank === 'equilibrado') {
    return `La mejor relación calidad/precio: calidad ${calidad} a costo ${model.cost}.`;
  }
  return `El más económico (costo ${model.cost}) que sigue siendo competente para ${TASK_LABELS[task].toLowerCase()} (calidad ${calidad}).`;
}

// Genera las tres recomendaciones de modelo (mejor, equilibrado y económico) para una tarea.
export function recommend(prompt: string): AdvisorResult {
  const task = classifyTask(prompt);
  const strength = strengthOf(task);
  const pool = CATALOG.filter((modelo) => matches(modelo, strength));
  const taken = new Set<string>();

  const explicito = (a: ModelEntry, b: ModelEntry): number =>
    (directMatch(b, strength) ? 1 : 0) - (directMatch(a, strength) ? 1 : 0);

  const byQuality = [...pool].sort(
    (a, b) =>
      explicito(a, b) ||
      b.tier - a.tier ||
      COST_WEIGHT[a.cost] - COST_WEIGHT[b.cost] ||
      a.name.localeCompare(b.name),
  );
  const top = pick(byQuality, taken);

  const score = (modelo: ModelEntry): number =>
    (directMatch(modelo, strength) ? 1.5 : 0) + modelo.tier - COST_WEIGHT[modelo.cost] * 0.75;
  const byValue = [...pool].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  const equilibrado = pick(byValue, taken);

  const baratos = [...pool]
    .filter((modelo) => modelo.tier >= 2)
    .sort((a, b) => COST_WEIGHT[a.cost] - COST_WEIGHT[b.cost] || b.tier - a.tier || a.name.localeCompare(b.name));
  const economico = pick(baratos.length > 0 ? baratos : byValue, taken);

  const items: Recommendation[] = [];
  const candidate: Array<[Rank, number, string, string, ModelEntry | undefined]> = [
    ['top', 1, '🏆', 'La Mejor Opción', top],
    ['equilibrado', 2, '⚖️', 'Equilibrado', equilibrado],
    ['economico', 3, '🪙', 'Económico', economico],
  ];
  for (const [rank, option, badge, label, model] of candidate) {
    if (model === undefined) continue;
    items.push({ rank, option, badge, label, model, reason: reasonFor(rank, model, task) });
  }

  return { prompt, task, taskLabel: TASK_LABELS[task], items };
}
