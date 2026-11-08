# Decisiones

Registro de lo que se decidió y por qué. Si querés desviarte de algo de acá, agregá una entrada nueva y no lo cambies en silencio.

## Decididas

| # | Decisión | Por qué |
|---|---|---|
| 1 | Producto web propio en lugar de depender del MCP de Fusion | Permite equipos y varios agentes sobre el mismo proyecto; el visor y el flujo son propios |
| 2 | 3D desde el primer día; primer público: diseñadores industriales | Un visor 2D no sirve para iterar piezas |
| 3 | El agente lo pone el usuario (BYO agent) | No vendemos un modelo ni asumimos su costo |
| 4 | **Code Mode:** el agente escribe un script de build123d en vez de llamar muchas tools | Gasta menos tokens, los agentes escriben bien código y el traceback es buen feedback |
| 5 | MCP mínimo: 4 tools (`ejecutar_script`, `medir`, `renderizar`, `exportar`) | Menos definiciones que cargar en el contexto del agente |
| 6 | El script es la fuente de verdad; los parámetros se declaran con `param()` | Persona y agente tocan el mismo documento; la persona ajusta sin pasar por el agente |
| 7 | Selectores semánticos | Evita el problema del nombrado topológico |
| 8 | Arquitectura hexagonal, dominio en TypeScript puro, kernel en Python | Cambiar kernel o base sin tocar el dominio |
| 9 | Kernel: build123d (OpenCascade) | CAD por código; STEP nativo |
| 10 | Exportación: STEP primero, luego STL y 3MF | STEP es el que le sirve a un diseñador |
| 11 | Visor: three.js | Estándar, buen soporte |
| 12 | Una sola pieza por proyecto en el prototipo | Alcance |
| 13 | Corrida por fases con corte de revisión | Revisión humana antes de seguir |
| 14 | Estilo: vidrio esmerilado en blanco y negro, entre Apple y Notion | Decidido por Matías |
| 15 | Nombre: **Furnus**; dominio furnus.dev | Decidido por Matías |
| 16 | Evaluados y descartados: Draftum, Datmate, AntroMate, ScaleMate, Tekton, Rukafe, Eidos | Choques de marca, dominios o encaje |

## Pendientes (decidir con Matías)

- **Persistencia local desde la fase 01.** Se propone en `ARCHITECTURE.md` (archivos en `~/.furnus/`). Falta que Matías lo confirme.
- **Publicar en npm:** el paquete `furnus` está listo (decisión 49) pero NO publicado. Falta que Matías decida cuándo, con qué licencia (hoy `UNLICENSED`) y si reserva el nombre. La pantalla Conectar del visor todavía muestra la copia local, no `npx furnus init` (idea abajo).
- **Registro de marca:** consulta en el INPI (clases 9 y 42) y revisión con un agente de propiedad industrial. No se pudo verificar por herramientas.
- **Dominios extra:** furnus.dev está elegido; considerar furnus.app y furnus.co.
- **Seguridad del sandbox:** el de la fase 01 es solo para uso propio. Definir el aislamiento real antes de cualquier servicio hospedado (idea futura, ya no es la fase 03).
- **Framework de la API:** Fastify por defecto; NestJS si Matías lo prefiere.
- **Monetización:** sin definir.

## Ideas fuera de alcance (anotá acá lo que se te ocurra)

- Arquitectura (edificios) como segundo público.
- Ensamblajes con restricciones.
- Planos 2D a partir de la pieza.
- Cuentas, login, proyectos y servidor (Supabase). Se movieron acá desde la antigua fase 03 (decisión 48).

## Decisiones de la fase 01 (tomadas por Claude Code, baratas de revertir; revisar)

| # | Decisión | Por qué |
|---|---|---|
| 17 | Persistencia local en `~/.furnus/proyectos` (o `FURNUS_HOME`) confirmada de hecho | Estaba propuesta; se implementó tal cual |
| 18 | Paquete extra `packages/adapter-kernel` (`KernelPort` por HTTP al servicio Python) | `ARCHITECTURE.md` no lo listaba y hacía falta un adaptador de salida |
| 19 | Un script que falla NO crea revisión; el error queda en la actividad y la pieza anterior sigue vigente | Pantalla: «no tapar la pieza anterior» |
| 20 | Cambiar parámetro y deshacer/rehacer no crean revisiones: vuelven a correr el script (valores en `parametros.json`) | El historial queda limpio |
| 21 | `ejecutar_script` acepta `pieza` y `nombre` opcionales; sin `pieza` usa la última editada | Un MCP stdio no tiene noción de «pieza abierta» |
| 22 | `medir` solo con `caja`/`volumen`/`area`; `renderizar` existe pero responde «no disponible» | El renderizador es de la fase 02; se mantienen las 4 tools |
| 23 | MCP y API son procesos distintos: el MCP avisa por `POST /interno/*` (eventos y latido del agente) | Sin base compartida en la fase 01 |
| 24 | Sandbox en Windows: Job Object (memoria + kill del árbol), imports por AST y `__import__` recortado, `socket` anulado | No hay `setrlimit` en Windows. Sigue sin ser seguridad real |
| 25 | STEP en pulgadas: se etiqueta el archivo en INCH con OpenCascade (`write.step.unit`); no se reescala la geometría | `export_step(unit=IN)` de build123d reescala y daría una pieza 25,4 veces mayor |
| 26 | La configuración de «Conectar agente» apunta a la copia local (`node --import tsx …/main.ts`) | Todavía no hay `[paquete-mcp]` publicado |

Ideas fuera de alcance anotadas: worker de kernel «caliente» (cada ejecución paga ~2,5 s de import de build123d); selección de aristas en el visor; estado «Corrigiendo» / «agente editando» en vivo.

## Decisiones de la fase 02 (tomadas por Claude Code; revisar)

| # | Decisión | Por qué |
|---|---|---|
| 27 | Se agrega una quinta tool MCP: `cambiar_parametros(pieza, valores)`. Reemplaza lo que dice la decisión 5 (4 tools) | `ejecutar_script` exige mandar el script entero; «poné el espesor en 30» no debería reescribir nada. Lo pide el brief de la fase 02 |
| 28 | `cambiar_parametros` (agente) SÍ crea una revisión nueva, con el mismo script y `valores` guardados en la revisión. El deslizador de la persona sigue sin crear revisiones (decisión 20) | El brief pide una revisión por cada ajuste del agente; arrastrar un deslizador llenaría el historial. Deshacer a una revisión de parámetros restaura sus valores |
| 29 | El error del kernel suma `sugerencia` (límite, nombre parecido, firma correcta). `fillet` y `chamfer` de build123d se envuelven en el sandbox y calculan el radio máximo con `max_fillet` | El agente externo de la fase 01 frenó porque el error no traía el límite |
| 30 | `ejecutar_script` con `pieza: «nueva»` no deja huérfana: si el primer script falla, la pieza se borra y no se publican eventos. `medir`, `exportar` y `cambiar_parametros` nunca crean piezas | Pieza huérfana en la prueba de la fase 01 |
| 31 | `RepositorioPort` suma `borrar(id)` | Hace falta para no dejar piezas vacías |
| 32 | (reemplazada por las decisiones 36 a 39: el chat embebido se hizo) | |
| 33 | Kernel persistente: el servicio mantiene UN proceso trabajador con build123d ya importado (`runner.py --servir`) y le manda cada pedido por stdin. Un timeout, una caída o un `MemoryError` lo matan y se levanta otro; también se recicla a los 200 usos o si cambia el tope de memoria. `FURNUS_KERNEL_PERSISTENTE=0` vuelve a un proceso por ejecución | Baja una ejecución de ~3 s a ~0,03 s. Cada script sigue con globals y builtins nuevos, pero comparte proceso con los anteriores: es una pérdida de aislamiento que ya no importaba con el sandbox de la fase 01 y que habrá que revisar en la fase 03 |
| 34 | `renderizar` funciona: el kernel dibuja PNG de 640×480 con un rasterizador propio (numpy + Pillow, z-buffer, proyección ortogonal, tres grises, aristas visibles, caja y ejes en el pie). Vistas: `iso`, `frente`, `arriba`, `derecha`. Vuelve a correr el script vigente en el trabajador caliente (no lee el GLB). La tool devuelve las imágenes como contenido `image` + un texto con las rutas | Sin GPU, sin ventana, sin navegador y sin dependencias nuevas pesadas (se declaran `numpy` y `pillow` en el kernel). ~0,5 s por vista en caliente. Dibuja también geometría inválida |
| 35 | `renderizar` no crea revisión ni toca el visor: solo registra la actividad `renderizar` | Es solo lectura |
| 36 | (motor reemplazado por la decisión 41; el resto sigue vigente) Chat embebido: paquete `packages/agente` con un bucle manual sobre `@anthropic-ai/sdk` (`beta.messages.stream`). Usa LAS MISMAS tools que un agente externo: conecta `crearServidorMcp` a un cliente MCP en memoria y le pasa sus definiciones al modelo. El chat fija el id de la pieza (se quita `pieza` del esquema de cada tool y se inyecta al llamarla) | Una sola fuente de verdad para las tools: lo que mejora el MCP mejora el chat. Una conversación = una pieza (alcance del prototipo) |
| 37 | El pedido `POST /api/piezas/:id/chat` responde 202 y el avance (texto en streaming, tools, errores, fin) viaja por el WebSocket que ya usa el visor, como evento `{tipo: "chat"}`; `GET` devuelve la conversación guardada y `…/cancelar` la corta | Reusa el canal existente, sirve para varias pestañas y sobrevive a recargar la página |
| 38 | (reemplazada por la 43) Modelo por defecto `claude-opus-5-5` (se cambia con `FURNUS_MODELO`), pensamiento adaptativo, `effort: medium` y `fallbacks: "default"` (si un clasificador rechaza el pedido, la API lo reintenta con otro modelo) | Es el modelo por defecto recomendado para trabajo agéntico. Es el más caro de la lista: si pesa, probar `claude-sonnet-5-5` |
| 39 | (reemplazada por la 42) La clave va en `.env` (`ANTHROPIC_API_KEY`), que la API carga con `process.loadEnvFile`; sin clave el chat queda deshabilitado y el visor muestra cómo ponerla. La conversación vive en la memoria del proceso de la API: se pierde al reiniciarla. Quién paga los tokens y la persistencia del historial quedan para la fase 03 | Local primero, como pide el brief. El MCP por stdio sigue siendo la opción para quien ya usa Claude Desktop o Cursor |

## Chat embebido con el CLI de Claude Code (tomadas por Claude Code; revisar)

Pedido de Matías: el chat deja de llamar a la API de Anthropic con clave y pasa a lanzar el CLI `claude` del usuario en modo no interactivo, con salida en streaming y el MCP de Furnus registrado. Sin `ANTHROPIC_API_KEY`. Antes de implementar se leyó la documentación oficial (2026-11-08): `code.claude.com/docs/en/` → `headless`, `model-config`, `authentication`, `legal-and-compliance`, `cli-reference`, `setup`.

### Lo que dice la documentación oficial

**Modo headless** (`claude -p`)
- `-p` / `--print` corre sin interacción. Sale con 0 si anduvo y distinto de 0 si falló; un fallo dentro de la corrida (por ejemplo, falta de login) se imprime «como resultado» por stdout. Con SIGTERM sale con 143.
- `--output-format stream-json` da JSON por línea. Se usa con `--verbose` y, para recibir el texto de a pedazos, con `--include-partial-messages`. La última línea es un evento `result` con el texto final, el costo y la sesión. El filtro documentado para el texto parcial es `stream_event` con `event.delta.type == "text_delta"`.
- El primer evento es `system/init` (modelo, tools, `mcp_servers`, `mcp_server_errors`). También hay `system/api_retry` (con `error`, por ejemplo `authentication_failed`) y mensajes `permission_denied`. Los mensajes de subagentes traen `parent_tool_use_id`.
- `--mcp-config <archivo o JSON>` carga servidores MCP; `--strict-mcp-config` ignora todos los demás. Los servidores que fallan la validación se omiten y solo aparecen en `mcp_server_errors`.
- Permisos: desde la v2.1.302 un `-p` sin modo arranca en «Manual» y **deniega** lo que necesite aprobación. `--allowedTools` (separado por comas) aprueba tools sin preguntar; `--disallowedTools` con un nombre pelado lo saca del contexto; `--permission-mode` acepta `dontAsk`, que deniega todo lo no aprobado sin preguntar.
- Continuidad: `--resume <session_id>` retoma una sesión (sirve desde otra carpeta); el `session_id` viene en `result`. El stdin por pipe tiene tope de 10 MB.
- `--bare` salta hooks, MCP, CLAUDE.md y **nunca lee las credenciales OAuth**: no sirve para suscripción.

**Elección de modelo**
- Orden de precedencia: `/model` en sesión, `--model` al arrancar, `ANTHROPIC_MODEL`, el campo `model` de settings, `ANTHROPIC_DEFAULT_MODEL` (v2.1.236+). `--model` y `ANTHROPIC_MODEL` valen solo para esa corrida.
- Alias: `default`, `best`, `fable`, `sonnet`, `opus`, `haiku`, `opusplan`, y variantes `[1m]`. En la API de Anthropic `opus` = Opus 5.5, `sonnet` = Sonnet 5.5, `haiku` = Haiku 5.5. Para fijar una versión se usa el nombre completo (`claude-opus-5-5`).
- Requisitos de versión del CLI: Opus 5.5 desde la v2.1.280, Sonnet 5.5 desde la v2.1.284, Haiku 5.5 desde la v2.1.293.
- El modelo por defecto según el plan (Pro, Max, Ultra, Team, Enterprise → Opus 5.5) **solo** lo vimos en un resumen automático de la página, no en el texto literal.

**Suscripción y autenticación**
- Se entra con una cuenta Pro, Max, Ultra, Team, Enterprise o Console; el plan gratuito de claude.ai no incluye Claude Code.
- `claude auth login` (shell) o `/login` (dentro de la sesión) abre el navegador. `claude auth status` imprime JSON (`authMethod`: `none`, `claude.ai`, `oauth_token`, `api_key`, `api_key_helper`, `third_party`) y sale con 0 si hay sesión y 1 si no. `claude auth logout` cierra la sesión.
- Credenciales: `%USERPROFILE%\.claude\.credentials.json` en Windows, `~/.claude/.credentials.json` en Linux, Keychain en macOS.
- **Precedencia: si hay `ANTHROPIC_API_KEY` en el entorno, en `-p` «la clave se usa siempre»** y le gana a la suscripción (también `ANTHROPIC_AUTH_TOKEN` y las variables de Bedrock, Vertex y Foundry). Por eso el backend las quita del entorno del CLI.
- `claude setup-token` genera un token de un año para `CLAUDE_CODE_OAUTH_TOKEN`, pensado para CI y scripts. Furnus no lo usa ni lo pide.
- Instalación oficial: `irm https://claude.ai/install.ps1 | iex` (Windows PowerShell), `curl -fsSL https://claude.ai/install.sh | bash` (macOS, Linux, WSL), `npm install -g @anthropic-ai/claude-code` (Node 22+), `brew install --cask claude-code`, `winget install Anthropic.ClaudeCode`. Se verifica con `claude --version` y `claude doctor`.

**Términos de uso (`legal-and-compliance`)**
- Claude Code se rige por los Consumer Terms (Free, Pro, Max, Ultra) o los Commercial Terms (Team, Enterprise, API) y por la Usage Policy.
- Para «preinstalar o correr Claude Code en tus productos o servicios (por ejemplo, sandboxes hospedados u otra infraestructura de agentes)» hacen falta los Commercial Terms y: no modificar el binario, no pagar ni revender uso en nombre de los usuarios finales, y que **cada usuario final se autentique con sus propias credenciales**.
- La autenticación OAuth es «exclusivamente» para quienes compraron un plan. Los desarrolladores que construyen productos (incluso con el Agent SDK) «deberían usar clave de API» de Console o un proveedor cloud. Anthropic **no permite** que terceros ofrezcan el login de Claude.ai en sus apps, ni «enrutar pedidos a través de las credenciales de planes Free, Pro, Max o Ultra en nombre de sus usuarios», ni recolectar, guardar o intermediar credenciales o tokens de sesión.
- Lo que sí aclara: nada de eso impide que un usuario final inicie sesión en el binario **sin modificar** con su propia suscripción, «incluso cuando una plataforma hospeda Claude Code».
- Anthropic se reserva medidas de aplicación sin aviso previo. Los límites de uso de las suscripciones «asumen un uso individual ordinario».

### Dudas sobre los términos de uso (sin resolver; decide Matías, idealmente con una consulta a Anthropic o a un abogado)

1. **La documentación no dice nada sobre este caso exacto:** un backend local que lanza el `claude` instalado por el usuario, con la sesión del propio usuario. Lo más cercano es la frase que permite al usuario final iniciar sesión en el binario sin modificar con su propia suscripción. Nuestra lectura es que el prototipo local entra ahí: el CLI es el de la persona, está sin modificar, usa su propio login, y Furnus **nunca ve, copia ni guarda** credenciales ni tokens. Pero es una lectura nuestra, no una confirmación.
2. **Furnus es «un producto» que lanza el CLI por el usuario.** La regla de no «enrutar pedidos a través de credenciales de planes en nombre de los usuarios» podría leerse como que sí lo hace. La diferencia que podría importar es que acá no hay intermediación remota: todo corre en `127.0.0.1` de la misma máquina.
3. **Tensión dentro de la documentación:** la Usage Policy dice que quien construye productos use clave de API, y la página de autenticación recomienda `CLAUDE_CODE_OAUTH_TOKEN` para scripts. No se reconcilian para un producto de terceros.
4. **Esto NO escala a la fase 03.** Si el backend se hospeda (Supabase, cuentas, varias personas), lanzar el CLI con las credenciales de los usuarios cae de lleno en lo prohibido (hospedaje, credenciales de terceros). Para un servicio hospedado hay que volver a clave de API (Console) o acordar Commercial Terms.
5. **Uso «individual ordinario».** Un chat que dispara muchas tools y renders puede gastar mucho más cupo de la suscripción que una charla común. No sabemos cómo lo mide Anthropic para este caso.
6. **Riesgo de aplicación:** las restricciones se pueden hacer cumplir sin aviso. Antes de mostrar esto a terceros, resolver las dudas 1 y 2.

### Lo que NO pudimos confirmar de la documentación (verificar con un CLI real)

- En esta máquina el CLI no está instalado: **nada de lo que sigue se probó contra un `claude` de verdad**, solo contra un lanzador falso. Está implementado con el contrato documentado y tolerante a campos que no conozca.
- Las páginas leídas no traen el esquema completo de los eventos de `stream-json` (`assistant`, `user` con `tool_result`, `result`, claves exactas de `system/init`). Los tomamos del formato conocido del SDK: `{type:"assistant", message:{content:[text|tool_use]}}`, `{type:"user", message:{content:[tool_result]}}`, `{type:"result", subtype, is_error, result, session_id}`.
- No leímos los Consumer Terms, los Commercial Terms ni la Usage Policy completos, solo lo que cita `legal-and-compliance`.
- `--append-system-prompt-file` y el formato del nombre de las tools MCP (`mcp__<servidor>__<tool>`) los tomamos de lo conocido de la CLI, no de las páginas leídas; las tools se listan de forma explícita en `--allowedTools` en lugar de usar comodines.
- Qué imprime `claude auth status` sin sesión más allá de `authMethod: "none"` y el código de salida 1.
- En Windows, `claude` puede ser un `claude.exe` (instalador nativo) o un `claude.cmd` (npm). Un `.cmd` no se puede lanzar sin shell desde Node; se resuelve con shell y comillas, sin probar.

### Decisiones

| # | Decisión | Por qué |
|---|---|---|
| 40 | El chat ya **no usa la API de Anthropic ni el SDK**: se saca `@anthropic-ai/sdk` de `packages/agente`. Sin `ANTHROPIC_API_KEY` en ningún lado | Pedido de Matías |
| 41 | El motor es el CLI de la persona: por cada mensaje el backend lanza `claude -p --output-format stream-json --verbose --include-partial-messages` (texto del mensaje por stdin, `--resume <session_id>` desde el segundo mensaje) y traduce cada línea a los mismos `EventoChat` que ya viajaban por el WebSocket. Un proceso por turno; cancelar mata el árbol de procesos (`taskkill /T` en Windows) | Reusa el canal y el panel sin cambios de contrato. Un proceso por turno evita el esquema de entrada de `--input-format stream-json`, que la documentación leída no trae |
| 42 | **Autenticación solo con la suscripción del usuario.** Al CLI se le quitan del entorno `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` y `CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY`, porque en `-p` una clave presente le gana al login. Furnus no toca, lee ni guarda credenciales ni tokens, y no usa `setup-token` | Cumple «sin clave» aunque haya un `.env` viejo, y es lo más cerca de lo que permite la sección de términos (dudas 1 y 2) |
| 43 | Modelo: si hay `FURNUS_MODELO` se pasa con `--model`; si no, se usa el que el CLI elija para el plan. El panel muestra el modelo que informa `system/init`. Se pierden `fallbacks` y el `effort` fijo de la API; no se cambia el esfuerzo | La documentación no lista un modelo único para todos los planes y fijar uno puede fallar según la versión del CLI |
| 44 | **Permisos mínimos.** `--mcp-config <archivo> --strict-mcp-config` (solo el MCP de Furnus, el mismo `main.ts` que usa un agente externo), `--permission-mode dontAsk`, `--allowedTools` con las 5 tools MCP en forma explícita y `--disallowedTools Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch`. Se corre en `~/.furnus/chat` (carpeta vacía) para que no cargue el `CLAUDE.md` del repo. Un test compara la lista de tools permitidas con las que publica el servidor MCP | El CLI es un agente de código con acceso a archivos y shell: acá solo debe poder usar el CAD. **No se tocan las tools del MCP** |
| 45 | **La tool recibe `pieza` del modelo.** Como el MCP no se toca, el esquema de cada tool sigue pidiendo `pieza`: el prompt le da el id y le prohíbe usar «nueva» u otro id. Se pierde la garantía fuerte de antes (el chat inyectaba el id y quitaba el campo) | Es el costo de no modificar el MCP. Riesgo abierto: si el modelo ignora el prompt puede crear otra pieza. Para decidir si hace falta un guardián en el MCP |
| 46 | **Estado del motor y ayuda en el panel.** `GET /api/chat/estado` devuelve `{disponible, estado: "listo" \| "sin_cli" \| "sin_login" \| "sin_motor", modelo, ayuda}`. `sin_cli` si no hay `claude` en el PATH (ni en `~/.local/bin` ni en `FURNUS_CLAUDE_BIN`); `sin_login` si `claude auth status` dice que no hay sesión. La respuesta trae los comandos de instalación y de login según el sistema operativo y el panel los muestra con un botón «Volver a comprobar». El `POST` del chat responde 503 con `SIN_CLI` o `SIN_LOGIN` | Pedido de Matías |
| 47 | La conversación sigue viviendo en la memoria del proceso de la API (más el `session_id` del CLI). Se pierde al reiniciar la API, como antes. Los transcriptos del CLI quedan en `~/.claude` del usuario | Sin cambios respecto de la decisión 39 |

## Cierre de la fase 02 y fase 03 «distribución» (tomadas por Claude Code; revisar)

| # | Decisión | Por qué |
|---|---|---|
| 48 | **La fase 03 deja de ser «cuentas» (login, Supabase, servidor) y pasa a ser «distribución»: instalador de un comando y prueba con una persona externa.** Cuentas y servidor quedan como ideas futuras (ver `docs/PHASES.md`) | Pedido de Matías. Furnus es un producto **local**: el agente es el de la persona (BYO agent, decisión 3), el chat usa su Claude Code y su suscripción, y nadie paga tokens por ella. Un servidor con cuentas no valida nada de lo que el prototipo necesita validar y además choca con los términos de uso: hospedar el CLI con credenciales de terceros está prohibido (duda 4 de la sección del chat). Lo que sí hace falta para que otra persona lo use es que instalarlo no requiera editar JSON a mano |
| 49 | Paquete npm `furnus` en `packages/cli`, ejecutable con `npx furnus` (`init`, `doctor`, `dev`). Sin dependencias en runtime; se empaqueta con `esbuild` a `dist/furnus.mjs`, y `prepack` arma además `runtime/` (MCP y API empaquetados, fuentes del kernel Python, visor construido). **No se publicó.** El nombre estaba libre en npm el 2026-11-08 (`npm view furnus` → 404), sin reservar. Licencia `UNLICENSED` hasta que Matías decida | Un `npx` tiene que funcionar sin el monorepo. El mismo ejecutable funciona también dentro del repo (modo «repo», corre los fuentes con tsx) |
| 50 | `furnus init` edita **directamente** las configs: `claude_desktop_config.json` (Windows, incluida la variante de la Microsoft Store; macOS; Linux) y `~/.claude.json` (o `$CLAUDE_CONFIG_DIR/.claude.json`) de Claude Code. Antes de escribir copia el archivo a `<archivo>.furnus-backup-<fecha>`; agrega o actualiza solo `mcpServers.furnus` (conserva los otros servidores, el orden y la sangría); escribe de forma atómica (archivo temporal + renombrar) y relee el resultado; si el JSON está roto no toca nada. Usa rutas absolutas (el `node` del que corre el instalador). Sin campo `type`. Si el kernel ya tiene su entorno virtual, agrega `FURNUS_PYTHON` | Es lo que pidió Matías. Alternativa descartada: `claude mcp add-json` (más oficial para Code, pero hay que ejecutar el CLI y no se puede probar con directorios temporales). Riesgo: `~/.claude.json` lo reescribe Claude Code mientras corre; la escritura atómica y la copia lo acotan, pero una sesión abierta podría pisar el cambio |
| 51 | `furnus doctor` comprueba Node ≥ 20, Python ≥ 3.11, build123d/numpy/Pillow, el CLI `claude` y su sesión (`claude auth status`, sin claves de API en el entorno), que el MCP responda (`initialize` + `tools/list` por stdio, con un `FURNUS_HOME` temporal) y que esté registrado. **Que falte `claude` o su login es un aviso, no una falla**: solo hace falta para el chat del visor. `doctor --instalar` crea un entorno virtual (`services/kernel/.venv` en el repo, `~/.furnus/venv` en el paquete) y le instala solo las **dependencias** del kernel: el proyecto Python tiene dos paquetes en una carpeta plana y `pip install .` falla | Cada falla dice cómo arreglarla. La instalación de build123d (OpenCascade) tarda varios minutos y puede no tener ruedas para Pythons muy nuevos; el mensaje sugiere 3.12 |
| 52 | Para el paquete se agregan tres variables, sin cambiar contratos: `FURNUS_KERNEL_DIR` (dónde está el kernel Python), `FURNUS_VIEWER_DIR` (la API sirve el visor construido en «/», con vuelta a `index.html` para las rutas del cliente) y `FURNUS_MCP_ENTRY` (el MCP empaquetado que lanza el chat). **No se tocaron las tools del MCP ni sus esquemas** | En el paquete no existe el monorepo, y la API necesita servir el visor sin Vite |
| 53 | El chip del agente muestra el nombre del producto, no el del cliente MCP: `claude-code` → «Claude Code», `claude-ai` → «Claude Desktop», `cursor` → «Cursor»; lo desconocido se muestra como llega | Pedido de Matías. El nombre técnico lo informa el protocolo MCP (`clientInfo.name`) |
| 54 | **No se arregló** el nombre de las piezas nuevas («Pieza sin nombre») cuando las crea el agente sin `nombre`. En el chat la pieza ya existe cuando el agente entra, y `ejecutar_script` solo usa `nombre` al crear. Para que el agente pueda nombrarla hay que tocar el MCP (que `nombre` renombre una pieza que todavía tiene el nombre por defecto, o una tool nueva) | Pedido: si requiere tocar el MCP, anotarlo como idea |

### Prueba real del chat (CLI de Claude Code, sin clave de API)

Hecha el 2026-11-08 con el `claude` 2.1.319 de Matías, con sesión iniciada (`authMethod: claude.ai`) y sin `ANTHROPIC_API_KEY` en el entorno. API local en otro puerto y con `FURNUS_HOME` temporal: no se tocaron piezas reales. Detalle por caso en `docs/REPORTE_FASE_02.md`. Hallazgos que dejan decisiones abiertas:

- **Hay dos reglas del prompt que chocan** para un pedido imposible: «si el script falla, corregilo y volvé a intentar sin pedirle nada a la persona» y «si lo pedido es imposible, decí cuál es el máximo posible y preguntá». Con filetes de 15 mm en una caja de 20 mm el agente eligió la segunda (con razón: corregir el radio cambia lo que la persona pidió). No se corrige solo; pregunta con el máximo y tres opciones. Si Matías quiere que baje el radio solo y lo avise, hay que cambiar el prompt.
- Con «no me hagas cuentas» el agente sí probó, el kernel rechazó el filete y el agente no reintentó: preguntó.
- El agente usó `ToolSearch` (una tool propia de Claude Code que carga los esquemas de las tools MCP bajo demanda) antes de la primera tool de Furnus. No está en `--allowedTools` ni en `--disallowedTools` y anduvo igual; es de solo lectura y no es un riesgo, pero conviene saber que está.

### Ideas fuera de alcance (anotadas en esta pasada)

- Que `ejecutar_script`/`cambiar_parametros` permitan nombrar una pieza que todavía se llama «Pieza sin nombre» (decisión 54).
- `furnus init --quitar` (desregistrar con copia de seguridad) y `furnus init --solo cursor` (Cursor guarda su config en `~/.cursor/mcp.json`; es el segundo agente que pide el criterio de la fase 02).
- Que la pantalla «Conectar agente» del visor muestre `npx furnus init` en vez de la configuración manual.
- Probar la variante de la Microsoft Store de Claude Desktop en una máquina real: la ruta (`%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude`) sale de lo conocido, no se verificó.
- Varios tests de los paquetes (`furnus-contrato-*`, `furnus-repo-*`, `furnus-mcp-*`, `furnus-step-*`) dejan directorios temporales sin borrar: había cientos en `%TEMP%`. Solo se arregló el de la API.
