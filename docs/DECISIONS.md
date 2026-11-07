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
- **Paquete MCP:** nombre del paquete para npm (`[paquete-mcp]` en la pantalla Conectar).
- **Registro de marca:** consulta en el INPI (clases 9 y 42) y revisión con un agente de propiedad industrial. No se pudo verificar por herramientas.
- **Dominios extra:** furnus.dev está elegido; considerar furnus.app y furnus.co.
- **Seguridad del sandbox:** el de la fase 01 es solo para uso propio. Definir el aislamiento real antes de la fase 03.
- **Framework de la API:** Fastify por defecto; NestJS si Matías lo prefiere.
- **Monetización:** sin definir.

## Ideas fuera de alcance (anotá acá lo que se te ocurra)

- Arquitectura (edificios) como segundo público.
- Ensamblajes con restricciones.
- Planos 2D a partir de la pieza.

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
| 32 | El punto 6 (chat embebido) de la fase 02 queda sin hacer por ahora | Pide decisiones (clave de API, quién paga los tokens); se frenó para revisión |
| 33 | Kernel persistente: el servicio mantiene UN proceso trabajador con build123d ya importado (`runner.py --servir`) y le manda cada pedido por stdin. Un timeout, una caída o un `MemoryError` lo matan y se levanta otro; también se recicla a los 200 usos o si cambia el tope de memoria. `FURNUS_KERNEL_PERSISTENTE=0` vuelve a un proceso por ejecución | Baja una ejecución de ~3 s a ~0,03 s. Cada script sigue con globals y builtins nuevos, pero comparte proceso con los anteriores: es una pérdida de aislamiento que ya no importaba con el sandbox de la fase 01 y que habrá que revisar en la fase 03 |
| 34 | `renderizar` funciona: el kernel dibuja PNG de 640×480 con un rasterizador propio (numpy + Pillow, z-buffer, proyección ortogonal, tres grises, aristas visibles, caja y ejes en el pie). Vistas: `iso`, `frente`, `arriba`, `derecha`. Vuelve a correr el script vigente en el trabajador caliente (no lee el GLB). La tool devuelve las imágenes como contenido `image` + un texto con las rutas | Sin GPU, sin ventana, sin navegador y sin dependencias nuevas pesadas (se declaran `numpy` y `pillow` en el kernel). ~0,5 s por vista en caliente. Dibuja también geometría inválida |
| 35 | `renderizar` no crea revisión ni toca el visor: solo registra la actividad `renderizar` | Es solo lectura |
