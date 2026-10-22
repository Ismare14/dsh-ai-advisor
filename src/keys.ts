// Elaborado por Ismael Muñoz Reyes

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import type { KeyProvider } from './types.js';

export const KEY_PROVIDERS: readonly KeyProvider[] = ['google', 'openai', 'anthropic', 'deepseek'];

export const KEYS_VERSION = 1;

export interface KeysFile {
  version: number;
  updatedAt?: string;
  keys: Partial<Record<KeyProvider, string>>;
}

export interface KeyStatus {
  provider: KeyProvider;
  present: boolean;
  masked: string;
  updatedAt?: string;
}

// Obtiene la ruta predeterminada donde se guardan las llaves.
export function defaultKeysPath(): string {
  const home = process.env.DSH_AI_ADVISOR_HOME ?? process.env.HOME ?? homedir();
  return path.join(home, '.dsh', 'ai_advisor_keys.json');
}

// Oculta el contenido de una llave dejando visibles solo los extremos.
export function maskKey(value: string): string {
  const limpio = (value ?? '').trim();
  if (limpio.length === 0) return '—';
  if (limpio.length <= 8) return `${limpio.slice(0, 2)}••••`;
  return `${limpio.slice(0, 3)}...${limpio.slice(-4)}`;
}

// Valida que la cadena tenga la longitud mínima de una llave real.
export function looksLikeKey(value: string): boolean {
  return value.trim().length >= 8;
}

// Restringe los permisos del archivo únicamente al propietario.
function enforcePermissions(file: string): void {
  try {
    chmodSync(file, 0o600);
  } catch {
    // En sistemas de archivos Windows este ajuste puede omitirse sin afectar el guardado.
  }
}

function emptyKeys(): KeysFile {
  return { version: KEYS_VERSION, keys: {} };
}

function parse(content: string): KeysFile {
  try {
    const dato = JSON.parse(content) as Partial<KeysFile> | null;
    if (dato === null || typeof dato !== 'object' || typeof dato.keys !== 'object' || dato.keys === null) {
      return emptyKeys();
    }
    const keys: Partial<Record<KeyProvider, string>> = {};
    for (const provider of KEY_PROVIDERS) {
      const valor = (dato.keys as Record<string, unknown>)[provider];
      if (typeof valor === 'string' && valor.trim().length > 0) keys[provider] = valor;
    }
    return {
      version: typeof dato.version === 'number' ? dato.version : KEYS_VERSION,
      ...(typeof dato.updatedAt === 'string' ? { updatedAt: dato.updatedAt } : {}),
      keys,
    };
  } catch {
    return emptyKeys();
  }
}

// Lee las llaves guardadas en disco o devuelve un estado vacío si falla.
export function loadKeys(file: string = defaultKeysPath()): KeysFile {
  if (!existsSync(file)) return emptyKeys();
  try {
    return parse(readFileSync(file, 'utf8'));
  } catch {
    return emptyKeys();
  }
}

// Guarda las llaves en disco de forma atómica con permisos restringidos.
function write(file: string, data: KeysFile): void {
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    // Algunos sistemas operativos no permiten cambiar permisos de carpetas.
  }
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    enforcePermissions(tmp);
    renameSync(tmp, file);
    enforcePermissions(file);
  } catch (error) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      // Si no se pudo borrar el temporal, se propaga el fallo principal.
    }
    throw error;
  }
}

// Registra o actualiza la llave de un proveedor.
export function saveKey(
  provider: string,
  value: string,
  file: string = defaultKeysPath(),
): { ok: true; status: KeyStatus; file: string } | { ok: false; error: string } {
  const key = provider.trim().toLowerCase() as KeyProvider;
  if (!KEY_PROVIDERS.includes(key)) {
    return { ok: false, error: `Proveedor desconocido "${provider}". Usa: ${KEY_PROVIDERS.join(', ')}.` };
  }
  const limpio = value.trim();
  if (!looksLikeKey(limpio)) {
    return { ok: false, error: 'La llave debe tener al menos 8 caracteres.' };
  }
  const data = loadKeys(file);
  data.version = KEYS_VERSION;
  data.updatedAt = new Date().toISOString();
  data.keys[key] = limpio;
  try {
    write(file, data);
  } catch (error) {
    return {
      ok: false,
      error: `No pude guardar la llave en ${file}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return {
    ok: true,
    file,
    status: { provider: key, present: true, masked: maskKey(limpio), updatedAt: data.updatedAt },
  };
}

// Borra la llave asociada a un proveedor.
export function deleteKey(
  provider: string,
  file: string = defaultKeysPath(),
): { ok: true; file: string } | { ok: false; error: string } {
  const key = provider.trim().toLowerCase() as KeyProvider;
  if (!KEY_PROVIDERS.includes(key)) {
    return { ok: false, error: `Proveedor desconocido "${provider}". Usa: ${KEY_PROVIDERS.join(', ')}.` };
  }
  const data = loadKeys(file);
  if (data.keys[key] === undefined) return { ok: false, error: `No hay llave guardada para ${key}.` };
  delete data.keys[key];
  data.updatedAt = new Date().toISOString();
  if (Object.keys(data.keys).length === 0 && existsSync(file)) {
    try {
      unlinkSync(file);
      return { ok: true, file };
    } catch {
      // Si no se puede eliminar el archivo, se sobrescribe sin llaves.
    }
  }
  try {
    write(file, data);
  } catch (error) {
    return {
      ok: false,
      error: `No pude actualizar ${file}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return { ok: true, file };
}

// Devuelve el estado actual de los proveedores con sus llaves ocultas.
export function keyStatus(file: string = defaultKeysPath()): KeyStatus[] {
  const data = loadKeys(file);
  return KEY_PROVIDERS.map((provider) => {
    const valor = data.keys[provider];
    const status: KeyStatus = {
      provider,
      present: valor !== undefined,
      masked: valor === undefined ? '—' : maskKey(valor),
    };
    if (valor !== undefined && data.updatedAt !== undefined) status.updatedAt = data.updatedAt;
    return status;
  });
}

// Devuelve el nombre legible del proveedor.
export function providerLabel(provider: KeyProvider): string {
  switch (provider) {
    case 'google':
      return 'Google (Gemini)';
    case 'openai':
      return 'OpenAI (GPT)';
    case 'anthropic':
      return 'Anthropic (Claude)';
    default:
      return 'DeepSeek';
  }
}
