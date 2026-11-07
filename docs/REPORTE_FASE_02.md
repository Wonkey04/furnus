# Reporte · Fase 02

## Resumen

Los 7 puntos del alcance están hechos y probados con tests. **El criterio de cierre todavía NO se cumple:** pide que los 4 casos (ambiguo, error imposible, error con arreglo, cambio de parámetro) pasen con un agente real y sin ayuda, y eso no se pudo probar acá. Todo lo verificado con agente fue con clientes en memoria, un cliente MCP propio y, para el chat, un servidor falso de la API de Anthropic.

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
