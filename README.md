# dsh-ai-advisor

Plugin para **[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)** que permite consultar un catálogo de modelos de inteligencia artificial, administrar tus API Keys de forma local y elegir el modelo adecuado para cada trabajo.

El paquete incluye cuatro funciones principales:

- **Catálogo de modelos (`/models`)** con proveedor, fortalezas y nivel de costo (Gemini, Claude, DeepSeek, GPT, MiMo y Llama).
- **Gestión segura de llaves (`/keys`)** guardadas fuera del código fuente en `~/.dsh/ai_advisor_keys.json` y ocultas siempre en el chat (`sk-...A1b2`).
- **Asesor de tareas (`/advisor`)** que analiza tu solicitud y te sugiere tres opciones: la de mayor calidad, una equilibrada y la más económica.
- **Herramienta `select_model(model_id, effort_level)`** para cambiar el modelo activo de la sesión y ajustar el nivel de esfuerzo (`lite`, `medium` o `high`).

## Seguridad de las API Keys

Este plugin aplica medidas estrictas para proteger tus credenciales en tu computadora:

1. **Almacenamiento aislado y permisos `0600`:** Las llaves se guardan en `~/.dsh/ai_advisor_keys.json` (fuera del repositorio) y tanto el archivo temporal como el definitivo se restringen con permisos `0o600` (y `0o700` en el directorio `.dsh`) para que ningún otro usuario del sistema pueda leerlos.
2. **Escritura atómica con limpieza de respaldo:** Cada cambio se escribe primero en un archivo temporal único (`ai_advisor_keys.json.<pid>.<timestamp>.tmp`) y luego se renombra sobre el archivo destino. Si la aplicación se cierra a la mitad o ocurre un error de disco, el archivo original no se corrompe y cualquier temporal incompleto se elimina automáticamente.
3. **Ocultamiento en el chat e historial (`recordInput: false`):** Las llaves nunca se imprimen completas; en las tarjetas solo se muestran los extremos (`sk-...A1b2`). Además, el comando `/keys` tiene configurado `recordInput: false` para evitar que la llave quede grabada en el historial de la sesión.

## Instalación

Desde npm:

```bash
dsh plugin add @ismare14/dsh-ai-advisor
```

Desde GitHub:

```bash
dsh plugin add github:Ismare14/dsh-ai-advisor
```

Al instalar desde GitHub, DeepSeek Harness ejecuta el script `prepare` para compilar el código en tu computadora.

Para desarrollo local:

```bash
npm install
npm run build
```

Puedes cargar la carpeta con `install_bundle` desde el administrador de plugins o agregar la entrada en tu `cordis.patch.yml`:

```yaml
- insert:
    - id: ai-advisor
      name: '@ismare14/dsh-ai-advisor'
      config:
        enabled: true
        keysPath: ''
        defaultEffort: 'medium'
```

## Configuración

| Campo | Valor por defecto | Descripción |
| --- | --- | --- |
| `enabled` | `true` | Activa o desactiva el plugin sin desinstalarlo del perfil. |
| `keysPath` | `''` | Ruta personalizada para el archivo de llaves. Si se deja vacía usa `~/.dsh/ai_advisor_keys.json`. |
| `defaultEffort` | `medium` | Nivel de esfuerzo por defecto cuando `select_model` no recibe `effort_level`. |

## Uso

### `/advisor <tu tarea>`

Analiza lo que necesitas hacer y devuelve tres opciones numeradas:

```text
/advisor refactoriza esta función en TypeScript
```

Después de ver la tarjeta, puedes pedirle al agente **"Usa el modelo 1"** (o el número que prefieras) para que aplique el cambio automáticamente.

### `/keys`

Administra las llaves de `google`, `openai`, `anthropic` y `deepseek`:

```text
/keys                                    # muestra el estado ocultando los valores
/keys set google sk-................A1b2 # guarda o actualiza una llave
/keys clear openai                       # elimina la llave guardada
```

Si el archivo no existe o tiene formato inválido, el plugin inicia con un estado limpio sin interrumpir la sesión.

### `/models`

Muestra el modelo activo de la sesión, qué proveedores tienen llave configurada y la lista completa de modelos agrupados por proveedor.

### `select_model(model_id, effort_level)`

Cambia el modelo de la sesión actual siguiendo este orden de respaldo:

1. Traduce el identificador solicitado contra el catálogo vivo del Harness (`modelCatalog`).
2. Intenta aplicar el cambio en la sesión actual mediante `sessionController.selectModel`.
3. Si el Harness no lo permite en la sesión, actualiza la selección predeterminada con `agentDefaultModel.saveSelection`.
4. Si ningún servicio acepta el cambio, muestra una guía clara para seleccionarlo manualmente en la barra superior del chat.

El nivel de esfuerzo (`lite`, `medium` o `high`) se registra en las instrucciones de la sesión y se limpia automáticamente cuando termina la sesión o se desinstala el plugin.

## Pruebas y compilación

```bash
npm run build      # compila TypeScript de src/ a dist/
npm run typecheck  # verifica tipos en modo estricto
npm run poc        # ejecuta la batería de pruebas en test/poc-runner.ts
```

## Autor y licencia

Elaborado por **Ismael Muñoz Reyes** (`<ismael.muoaz.rey@gmail.com>`). Distribuido bajo licencia MIT; consulta el archivo [LICENSE](./LICENSE).
