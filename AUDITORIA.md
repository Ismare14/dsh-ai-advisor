# Reporte de Auditoría Técnica — dsh-ai-advisor

**Autor:** Ismael Muñoz Reyes (`<ismael.muoaz.rey@gmail.com>`)
**Paquete:** `@ismare14/dsh-ai-advisor` v1.0.1
**Fecha:** 22 de octubre de 2026

## 1. Firma de autoría y estandarización de lenguaje

Se agregó el encabezado `// Elaborado por Ismael Muñoz Reyes` en la primera línea de todos los archivos TypeScript tanto en `src/` (`types.ts`, `catalog.ts`, `keys.ts`, `advisor.ts`, `cards.ts`, `switch.ts`, `index.ts`) como en `test/poc-runner.ts`. En `package.json` se actualizó el campo `author` a `"Ismael Muñoz Reyes <ismael.muoaz.rey@gmail.com>"`.

Se revisaron todos los comentarios, mensajes de error y textos de interfaz para asegurar español de México natural, eliminando anglicismos en comentarios y registros (`match`, `disposer`, `disposed`, `best-effort`, `POC runner`, `provider`), divisores decorativos generados por IA y comentarios redundantes que explicaban cómo estaba escrito el código en lugar de qué hace cada función.

## 2. Limpieza de código (Clean Code y tipado estricto)

- **Cero `any` y `strict: true`:** Toda la base de código compila con `strict: true`, `noUnusedLocals: true` y `noUnusedParameters: true` sin usar `any`.
- **Código muerto eliminado:**
  - En `src/types.ts`: se eliminaron propiedades y métodos de interfaz que no tenían ningún consumidor (`AgentLike.inject`, `ContextLike.effect`, `ContextLike.timer`, `ToolResult`).
  - En `src/switch.ts`: se eliminó la constante `EFFORT_LEVELS` que no se utilizaba.
  - En `src/index.ts`: se eliminó `console.warn` innecesario al registrar servicios opcionales, dejando únicamente `console.error` para fallos reales.
  - En `test/poc-runner.ts`: se reemplazaron las llamadas a `console.log` y los emojis en el código del corredor de pruebas por escritura directa en salida estándar (`process.stdout.write`) con etiquetas `[OK]` y `[FALLO]`.

## 3. Seguridad de API Keys (`src/keys.ts` y `src/index.ts`)

- **Permisos `0o600` estrictos:** Al guardar llaves, el archivo temporal se crea con modo `0o600`, se refuerza con `chmodSync(tmp, 0o600)` antes de renombrarlo y se vuelve a aplicar `chmodSync(file, 0o600)` sobre el archivo final. El directorio contenedor se crea y ajusta con `0o700`.
- **Escritura atómica con limpieza ante fallos:** Se escribe en un archivo temporal único (`<archivo>.<pid>.<timestamp>.tmp`) y se reemplaza con `renameSync`. Si ocurre un error durante la escritura o el renombre, el bloque `catch` elimina cualquier archivo temporal residual para no dejar llaves expuestas en disco.
- **Protección en el chat e historial:** `maskKey()` oculta siempre el contenido dejando solo los extremos (`sk-...A1b2`), y el comando `/keys` se registra con `recordInput: false` para que las credenciales nunca se guarden en el historial de la sesión.

## 4. Enrutador de modelos y ciclo de vida del esfuerzo (`src/switch.ts`)

- **Manejo de errores en `switchModel`:** Tanto la lectura de `modelCatalog` como el cambio por `sessionController.selectModel` y el respaldo `agentDefaultModel.saveSelection` están protegidos con bloques `try/catch`. Además, si `selectModel` devuelve `{ ok: false }`, se trata como rechazo y se degrada limpiamente a la opción predeterminada o al mensaje de instrucción manual para el selector superior del chat.
- **Limpieza automática del esfuerzo (`applyEffortSection`):** La sección inyectada en la sesión se registra en el mapa `effortSections` y también se suscribe al evento `dispose` del contexto del agente (`agent.ctx.on('dispose', limpiar)`). Así, la instrucción de esfuerzo se retira tanto cuando termina la sesión como cuando se desinstala el plugin.
