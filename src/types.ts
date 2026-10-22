// Elaborado por Ismael Muñoz Reyes

export type CostLevel = 'alto' | 'medio' | 'bajo';

export type EffortLevel = 'lite' | 'medium' | 'high';

export type KeyProvider = 'google' | 'openai' | 'anthropic' | 'deepseek';

export type TaskKind = 'codigo' | 'prosa' | 'analisis' | 'razonamiento' | 'general';

export type Strength =
  | 'codigo'
  | 'escritura'
  | 'razonamiento'
  | 'analisis'
  | 'general'
  | 'multimodal'
  | 'traduccion';

// Ficha descriptiva de un modelo de inteligencia artificial dentro del catálogo.
export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  strengths: Strength[];
  cost: CostLevel;
  tier: number;
  note?: string;
}

// Representación mínima de la sesión y del agente activo.
export interface AgentLike {
  id?: string | number;
  session?: { id?: string | number; [clave: string]: unknown };
  ctx?: ContextLike;
  [clave: string]: unknown;
}

// Contrato mínimo del contexto de ejecución donde se monta el plugin.
export interface ContextLike {
  on?(evento: string, manejador: (...argumentos: never[]) => unknown): unknown;
  get?(nombre: string): unknown;
  commands?: { register(definicion: CommandDefinition): unknown };
  tools?: { register(definicion: ToolDefinition): unknown };
  systemPrompt?: { section(seccion: { name: string; content: string }): () => void };
  [clave: string]: unknown;
}

// Definición de un comando de barra diagonal registrado en el chat.
export interface CommandDefinition {
  definitionId?: string;
  name: string;
  description: string;
  input?: { hint: string; attachments?: boolean };
  recordInput?: boolean;
  handler: (invocacion: CommandInvocation) => CommandResult | Promise<CommandResult>;
}

export interface CommandInvocation {
  commandId: string;
  agent: AgentLike;
  rawInput: string;
  attachments: readonly unknown[];
  signal: AbortSignal;
}

export type CommandResult =
  | { kind: 'success'; text?: string; sourceEventSeq?: number }
  | { kind: 'error'; text: string };

// Definición de una herramienta invocable por el agente.
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
  output?: {
    schema: JsonSchema;
    render: (
      args: Record<string, unknown>,
      valor: Record<string, unknown>,
    ) => Array<{ type: 'text'; text: string }>;
  };
  execute: (
    args: Record<string, unknown>,
    ejecucion?: { agent?: AgentLike; signal?: AbortSignal; [clave: string]: unknown },
  ) => unknown | Promise<unknown>;
}

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: Array<string | number | boolean | null>;
  description?: string;
}
