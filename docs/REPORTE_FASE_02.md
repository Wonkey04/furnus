# Reporte · Fase 02

## Resumen

Los 7 puntos del alcance están hechos y probados con tests. **El criterio de cierre todavía NO se cumple:** pide que los 4 casos (ambiguo, error imposible, error con arreglo, cambio de parámetro) pasen con un agente real y sin ayuda, y eso no se pudo probar acá. Todo lo verificado con agente fue con clientes en memoria, un cliente MCP propio y, para el chat, un servidor falso de la API de Anthropic.

> **Actualización 2026-11-08:** el chat ahora usa el Claude Code real de Matías y se probó con un `claude` de verdad; los resultados, qué se validó con un agente limpio y qué no, y por qué el criterio de dos agentes sigue abierto están en el último anexo («Cierre»).

## Qué se hizo

| # | Punto | Resultado |
|---|---|---|
| 1 | Errores con contexto | El error del kernel trae `sugerencia`. Filete/chaflán imposible: «radio máximo 4,9 mm» (calculado con `max_fillet`). Método o nombre mal escrito: sugiere el parecido. Argumento inexistente: muestra la firma. Import prohibido y parámetro fuera de rango: dicen qué hacer |
| 2 | `cambiar_parametros` | Quinta tool MCP (decisión 27). Cambia solo los valores, crea una revisión nueva con el mismo script y junta todos los errores de validación en un mensaje |
| 3 | Descripción de `ejecutar_script` | Pedido sin medidas: asumir y listar suposiciones. Preguntar solo si cambia la forma. Pedido imposible: informar el máximo y preguntar |
| 4 | Sin piezas huérfanas | Una pieza nueva cuyo primer script falla se borra y no publica eventos. `medir`, `exportar`, `renderizar` y `cambiar_parametros` nunca crean piezas |
| 5 | Kernel persistente | Un proceso trabajador con build123d ya importado. ~3 s → ~0,03 s por ejecución en caliente (el primer arranque sigue pagando ~2,5 s) |
| 6 | Chat embebido | Panel «Chat» junto a la pieza. Bucle sobre `@anthropic-ai/sdk` con las mismas 5 tools del MCP (conectadas en memoria), streaming por el WebSocket del visor, clave en `.env`. Sin clave el chat queda deshabilitado y explica cómo ponerla |
| 7 | Renderizador | `renderizar` devuelve PNG de `iso`, `frente`, `arriba` y `derecha` (rasterizador propio con numpy + Pillow, ~0,5 s por vista) como contenido `image` del MCP |

Tests: 73 en TypeScript (core 12, app 25, adapter-local 6, adapter-kernel 8, mcp 15, agente 10, api 12) y 40 en Python. `pnpm lint` y `typecheck` pasan.

## Qué se probó de punta a punta

- **Chat en el navegador** contra un servidor falso de la API de Anthropic (el SDK respeta `ANTHROPIC_BASE_URL`): escribir un pedido → el texto llega en streaming → se ejecuta `ejecutar_script` contra el kernel real → la pieza aparece en el visor con sus parámetros → el agente cierra con su resumen. La conversación se restaura al recargar. También se vio el estado sin clave.
- **Renderizador** con la mesa y con un soporte con agujeros y esquinas redondeadas; las imágenes se revisaron a ojo.
- **Kernel persistente**: se recupera de un timeout y de un `MemoryError`; no se filtra estado entre ejecuciones; `print` y la salida de OpenCascade no rompen el protocolo.

## Qué NO se probó (necesita a Matías)

1. **Los 4 casos de cierre con un agente real**, sin ayuda y sin que lea el repo. Incluye repetir «poné el espesor en 30» con el id explícito (en la fase 01 el agente respondió «ya está en 30» sin usar ninguna tool, y no existía `cambiar_parametros`).
2. **El chat con una clave real de Anthropic.** El servidor falso valida el formato del streaming y de las tools, no el comportamiento del modelo: no sabemos todavía si Opus 5.5 con el prompt del chat asume bien las medidas, usa `renderizar` para verificar o se queda trabado en un error.
3. **STEP abierto en FreeCAD o Fusion**, ni el STEP en pulgadas.
4. **Un segundo agente** (Cursor u otro).
5. El MCP y el kernel que quedaron corriendo en la máquina son de antes de la fase 02: hay que reiniciar `pnpm dev` y el cliente MCP.

## Decisiones nuevas (27 a 39, ver `DECISIONS.md`)

Las que más conviene que revises:

- **27:** quinta tool MCP. `CLAUDE.md` todavía dice «son cuatro» en «Qué NO hacer»; no lo toqué porque son tus reglas.
- **28:** `cambiar_parametros` del agente crea revisión; el deslizador de la persona no.
- **33:** el kernel comparte proceso entre ejecuciones. Cada script empieza con globals limpios, pero es menos aislamiento que antes. A revisar en la fase 03.
- **38:** el chat usa `claude-opus-5-5` por defecto, que es el modelo más caro de la lista. `FURNUS_MODELO` lo cambia.
- **39:** la conversación del chat vive en la memoria de la API y se pierde al reiniciarla. Quién paga los tokens queda para la fase 03.

## Qué falló o quedó flojo

- La conversación del chat no se persiste (decisión 39).
- El chat no tiene tope de costo ni de largo de historial: una conversación larga crece sin límite.
- «Medir» y «Corte» del visor siguen como «Próximamente».
- En la pantalla de una pieza sin script, el texto «Todavía no hay pieza para mostrar» se superpone con «Esperando al agente» (ya pasaba en la fase 01).
- `renderizar` es solo lectura: el visor no muestra que el agente miró la pieza.
- Quedan en `~/.furnus/proyectos/` piezas de prueba mías (`706f6219`, vacía; `16200ca6` y `c3546c7b`, de la sesión de prueba del MCP).

## Recomendaciones

1. Correr la batería de cierre con Claude Desktop o Cursor y anotar intentos por caso, como en la fase 01.
2. Poner una clave en `.env` y hacer 3 o 4 pedidos reales en el chat (uno ambiguo, uno imposible, uno con error) antes de decidir modelo y prompt.
3. Antes de la fase 03: decidir quién paga los tokens, persistir el historial del chat y definir el aislamiento real del sandbox.

Paro acá y espero tu revisión.

## Anexo · Primera pasada de pruebas con agente (parcial)

Un agente corrió los casos 1 a 3 contra el MCP **anterior a la fase 02** (4 tools, sin `cambiar_parametros`). No cuenta como evidencia limpia: ya había leído el repo y los tests. El caso 4 no se pudo hacer.

| Caso | Intentos | Resultado |
|---|---|---|
| 1 · Mesa | 1 | Sin preguntas; asumió y parametrizó todo; el volumen cierra. |
| 2 · Caja con agujero | 1 | Eligió agujero pasante y centrado en silencio. |
| 3 · Filete de 15 mm | 1 (falló) | Error con máximo (4,9 mm) y sugerencia; no insistió y preguntó. |
| 4 · Cambiar espesor | 0 | Imposible con el MCP viejo (`Required at script`). |

Ajustes hechos a partir de eso (`packages/mcp-server/src/herramientas.ts`):
- La descripción de `ejecutar_script` suma «¿agujero pasante o ciego?» a las dudas que sí cambian la forma, y un ejemplo corto de agujero (`Locations(sel.caras(...)[0].center())` + `Hole`, pasante y ciego). Verificado en el sandbox: volumen 22203 mm³ = 24000 − 1570,8 − 226,2.
- La descripción y el campo `script` dicen explícitamente que para cambiar un solo valor se usa `cambiar_parametros`.
- Toda respuesta de `ejecutar_script` y `cambiar_parametros` empieza con `resumen` (una línea: OK con medidas y validez, o el error con línea y sugerencia).

Sigue pendiente: repetir con un agente limpio y el cliente MCP reiniciado (caso 4 incluido). La pieza huérfana `398be2ef` es de la versión vieja y se borra a mano.


## Anexo · Cierre: prueba real del chat con Claude Code, typecheck e instalador (2026-11-08)

### Qué cambió desde el reporte

- El chat ya no usa la API de Anthropic: lanza el `claude` de la persona (decisiones 40 a 47). Esta ronda lo probó por primera vez contra un `claude` **real** (2.1.319, sesión `claude.ai`, sin `ANTHROPIC_API_KEY`). Lo que el reporte dice arriba sobre «servidor falso de la API» ya no aplica al chat.
- `pnpm typecheck` fallaba en `packages/mcp-server/src/herramientas.ts` (`SalidaEjecucion` contra `ResultadoEjecucion`). **La rotura venía de la ronda del `resumen`** (commit `1b6c4a5`): `resumenEjecucion` se tipó con el tipo del dominio, que exige `ejecutadoEn`, y los casos de uso devuelven `SalidaEjecucion`. Arreglado en `92a4e6a`. Con eso `pnpm typecheck`, `pnpm lint` y `pnpm test` pasan (ahora 160 tests TypeScript, 47 de ellos del instalador, más 40 en Python).
- Chip del agente: muestra «Claude Code» (decisión 53).
- Nuevo paquete `furnus` (`init`, `doctor`, `dev`), listo y **sin publicar** (decisiones 48 a 52). La antigua fase 03 (cuentas, Supabase) pasa a «distribución».

### Resultados de la prueba real del chat

Cómo se hizo: API local en el puerto 4011 con `FURNUS_HOME` temporal (no se tocó ninguna pieza de `~/.furnus/proyectos/`), `POST /api/piezas/:id/chat` y lectura de los eventos por el WebSocket. El agente es el `claude -p` del chat, con solo las 5 tools de Furnus y sin acceso a archivos ni shell; **no leyó el repo** y lo único que lo orienta es el prompt del chat. Los textos de los pedidos son los de la tarea, salvo las variantes a2 y a3, marcadas.

| Caso | Tools usadas (en orden) | Intentos | Errores recibidos | ¿Se corrigió sola? | Resultado |
|---|---|---|---|---|---|
| **a** · «caja de 50×30×20 con filetes de 15 mm en todas las aristas» | ninguna | 0 | ninguno | No aplica: ni lo intentó | Razonó la imposibilidad («15 + 15 > 20»), dio el máximo (~9 mm, «menor a 10») y ofreció 3 opciones: filete de 9 mm, otro radio, o subir el alto. Pieza sin revisión. 12,7 s |
| **a2** · variante: mismo pedido con 9,9 mm y «probalo directamente en el sandbox, no me hagas cuentas» | `ToolSearch`, `ejecutar_script`, `renderizar` | 1 | ninguno (el 9,9 entra) | No aplica | Caja 50×30×20 válida, mirada en el render. Asumió y declaró parámetros. 15,8 s |
| **a3** · variante: el pedido original (15 mm) con «probalo directamente en el sandbox, no me hagas cuentas» | `ToolSearch`, `ejecutar_script` | 1 | «No se pudo hacer el filete: el radio pedido es demasiado grande para estas aristas.» | **No.** No reintentó con otro radio: explicó el motivo, dio el máximo y preguntó entre 3 opciones. Pieza sin revisión | 16,6 s |
| **b** · «Poné el espesor en 30» (pieza con `espesor`=10, creada por la API, no por el agente) | `ToolSearch`, **`cambiar_parametros`** | 1 | ninguno | No aplica | Usó `cambiar_parametros` y **no reescribió el script**. Revisión 2, 80 × 50 × 30 mm, válida. 12,0 s |
| **c** · «hacé un soporte para celular» | `ToolSearch`, `ejecutar_script`, `renderizar` | 1 | ninguno | No aplica | Creó el soporte (63,6 × 80 × 103,4 mm, válido), lo miró en el render y **listó las suposiciones** («Asumí: ancho 80 mm, espesor 6 mm, ranura de 14 mm…, todos son parámetros»). No preguntó. 24,8 s |

Lectura honesta:

- **Cuenta como pasado:** b (cambiar un parámetro sin reescribir) y c (asumir y listar suposiciones, verificar con render).
- **a no ejercitó el lazo de error:** el agente rechazó el pedido sin llamar al kernel. Para ver el error hubo que pedírselo explícitamente (a3), y ahí **no se corrigió solo**. No es un fallo del agente: el prompt tiene dos reglas que chocan («corregí y volvé a intentar» / «si es imposible, decí el máximo y preguntá») y elegir la segunda es razonable porque bajar el radio cambia lo que la persona pidió. Queda como decisión de Matías (ver `DECISIONS.md`, sección «Prueba real del chat»).
- **No quedó probado el caso «error con arreglo posible»** (un error cuyo arreglo no cambia lo pedido, como un nombre mal escrito): ninguno de los tres pedidos produjo uno.
- No se pudo ver qué tan útil fue la `sugerencia` del kernel: el panel solo muestra el mensaje corto del error, y el agente no la citó.
- El nombre de la pieza no se evaluó (las piezas las creé yo con un nombre): ver decisión 54.
- Es **una sola corrida por caso**, con un solo modelo (el que Claude Code elige para el plan de Matías): sirve de indicio, no de estadística.

### Qué se validó con un agente limpio y qué no

| Qué | ¿Agente limpio? | Estado |
|---|---|---|
| Chat embebido con el Claude Code real (b, c, a, a3) | **Sí**: sin acceso a archivos, sin leer el repo, solo el prompt del chat | Hecho, una corrida |
| `cambiar_parametros` en lugar de reescribir el script | **Sí** (caso b) | Hecho |
| Suposiciones listadas ante un pedido sin medidas | **Sí** (caso c) | Hecho |
| Autocorrección ante un error del kernel | Parcial: se recibió el error, no hubo reintento | **Abierto** |
| Pedido ambiguo y error imposible por el MCP desde un cliente externo (Claude Desktop, Cursor) | **No** | La primera pasada del anexo anterior no cuenta (el agente había leído el repo y el MCP era el de antes de la fase 02) |
| `furnus init` en la máquina real de Matías | **No**: probado solo con directorios temporales y con un «home» falso | Pendiente |
| STEP abierto en FreeCAD o Fusion, STEP en pulgadas | **No** | Pendiente |
| Instalación de cero (`doctor --instalar`: venv + build123d) | **No**: solo con comandos simulados; no se creó un venv real | Pendiente |

### Criterio de salida de la fase 02

El criterio pide que la batería se resuelva sin ayuda **con al menos dos agentes distintos**. **Hoy hay uno: Claude Code** (a través del chat embebido). El segundo agente no se probó. Con el instalador listo, el segundo se prueba a mano: `npx furnus init` (o `node packages/cli/dist/furnus.mjs init` desde el repo), reiniciar Claude Desktop, correr `furnus doctor`, y repetir los 4 casos de `docs/GUIA_PRUEBAS_FASE_02.md` desde Claude Desktop o Cursor (Cursor todavía no lo registra `init`: es una idea anotada). Por eso la fase 02 **no se da por cerrada**.

### Qué se probó del instalador

- 47 tests, todos con directorios temporales (ninguno lee ni escribe la config real): fusión sin pisar otros servidores, copia de seguridad idéntica al original, idempotencia, `--simular`, JSON roto (no toca nada), rutas de Windows (incluida la variante de la Store), macOS y Linux, `CLAUDE_CONFIG_DIR`, `doctor` con cada falla y su arreglo, `--instalar` con venv y pip simulados, y el contrato real del MCP (exactamente las 5 tools).
- A mano, con el ejecutable empaquetado copiado **fuera del repo** y un «home» falso (`USERPROFILE`/`APPDATA` apuntando a un temporal): `init` registró el MCP y dejó la copia de seguridad; `doctor` pasó todo (Node, Python 3.12, build123d 0.13, MCP con 5 tools, registro); `dev` levantó la API empaquetada sirviendo el visor, y un script ejecutado por la API corrió en el kernel de `runtime/kernel`. La config real de Claude Desktop y de Claude Code **no se tocó** (no hay copias `.furnus-backup-` en ninguna).
- No se probó: macOS ni Linux de verdad (solo la lógica de rutas), la variante de la Microsoft Store, `claude mcp` ni Cursor.

### Pendiente para Matías

1. Probar `furnus init` en tu máquina real y reiniciar Claude Desktop / abrir una sesión nueva de Claude Code.
2. Probar con otra persona (la prueba externa de la fase 03) y anotar dónde se traba.
3. Decidir cuándo publicar en npm (y licencia y nombre).
4. Decidir qué hace el agente ante un pedido imposible (preguntar, como hoy, o bajar el valor y avisar).
5. Resolver las dudas de términos de uso del CLI con suscripción antes de mostrárselo a terceros (decisiones 40 a 47).
