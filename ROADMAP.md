# Roadmap — dsh-ai-advisor

Tres mejoras de nivel **Avanzado/Enterprise** para convertir el asesor en un producto de clase mundial. Cada una indica los seams del Harness (verificados por inspección en vivo del runtime `0.2.1-rc.2`) que la hacen posible.

---

## E1 — Integración MCP bidireccional

**Qué es:** exponer el asesor como servidor MCP para que otras aplicaciones (Claude Desktop, Cursor, otros agentes) consulten y usen el catálogo; y consumir servidores MCP del ecosistema desde el propio plugin.

**Cómo:**
- Servidor MCP (transporte stdio o streamable-http) con tools:
  - `advisor_recommend(prompt, task?)` → las 3 opciones con razonamiento (la lógica de `advisor.ts` ya es pura y reutilizable).
  - `model_switch(model_id, effort)` → envuelve `switchModel` (mapeo al catálogo vivo incluido).
  - `keys_status()` → estado **siempre enmascarado** de las llaves.
- Cliente: el Harness ya trae `@deepseek-ai/dsh-mcp-client` y el servicio `ctx.mcpResources` (verificados en el catálogo de paquetes y Services del perfil). Un bundle de solo configuración conecta servidores existentes sin código.

**Por qué importa:** MCP es el estándar de facto (spec 2026-07-28, +10,000 servidores públicos, gobernanza bajo la Agentic AI Foundation/Linux Foundation). Un asesor de modelos disponible como tools MCP es consultable desde cualquier parte del ecosistema, no solo desde DSH.

**Esfuerzo estimado:** medio (1–2 semanas). La lógica de negocio ya está aislada en módulos puros.

---

## E2 — Dashboard de costos y uso real (tokenMeter + UI nativa)

**Qué es:** pasar del "catálogo con costo relativo" a un **panel real de gasto y uso**: cuántos tokens gastó la sesión, en qué modelo, cuánto cuesta estimadamente y cuándo conviene bajar de tier.

**Cómo:**
- Medición real con `ctx.tokenMeter` (`measure(session)`, `estimateMessage(message)`) — el mismo seam que usa el Harness para sus propios límites.
- Historial de cambios de modelo por sesión (el plugin ya sabe cuándo cambia vía `switchModel`; registrar eventos en un storage domain de `ctx.storage`).
- UI en slots reales del Cliente (verificados en el árbol de slots vivo):
  - `sidebar.panellist` — panel "Advisor" con el resumen del día.
  - `settings.plugins.tab` — página de configuración del plugin con el historial y los umbrales de costo.
  - `tool.call.toolview` (slot keyed, `select_model` sin tomar) — tarjeta de resultado del cambio de modelo en el chat.
- Theme tokens `--dsw-alias-*` para que el panel luzca como parte nativa del Harness.

**Por qué importa:** los dashboards de uso/coste son una de las categorías que más crecieron en la comunidad (ccusage ~19k★, token-meter). Hoy el usuario confía en "costo alto/medio/bajo" estático; con tokenMeter la recomendación se apoya en datos reales.

**Esfuerzo estimado:** alto (3–6 semanas) — incluye la mitad Client (React) del plugin.

---

## E3 — Catálogo vivo con auto-detección de modelos

**Qué es:** eliminar el desfase entre el catálogo curado (`catalog.ts`) y los modelos que el Harness realmente tiene disponibles hoy.

**Cómo:**
- Al arrancar (y ante `llm/adapters-updated`, evento verificado en el catálogo de Events), leer `sessionController.modelCatalog()` — la misma API que `select_model` ya usa para traducir ids — y **fusionar**: los modelos reales alimentan las tarjetas `/models` y `/advisor`; el catálogo curado aporta fortalezas, notas y costos relativos para los ids conocidos.
- Los modelos nuevos sin ficha reciben una ficha por defecto (`tier` del proveedor, costo estimado por tabla pública) marcada como "auto-detectado".
- Validación de llaves: al guardar con `/keys set`, probar la llave contra el API del proveedor (fetch directo o `ctx.web`) y confirmar con ✅ verificado en lugar de solo "guardada".
- Sanidad del catálogo curado: revisión semestral de ids obsoletos (hoy conviven entradas de generaciones 2024 junto a V4).

**Por qué importa:** es la diferencia entre "un asesor que adivina" y "un asesor que sabe qué tienes instalado". También resuelve el síntoma que el mapeo laxo (`resolveRoutableTarget`) parchea hoy de forma elegante.

**Esfuerzo estimado:** medio (1–2 semanas).

---

## Secuencia sugerida

| Fase | Contenido | Dependencias |
|---|---|---|
| P1 | E3 (catálogo vivo) — el más visible para el usuario final | ninguna |
| P1 | Migración de llaves a `ctx.credentials` (ver AUDITORIA.md, Fase 2) | ninguna |
| P2 | E1 (MCP) — exposición al ecosistema | ninguna |
| P3 | E2 (dashboard + UI React) — requiere mitad Client | E3 para datos reales |
