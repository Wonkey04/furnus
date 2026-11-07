# Arquitectura

## Idea central

Un **núcleo** que no sabe nada de CAD, de bases de datos ni de agentes, y **adaptadores** que se enchufan alrededor (arquitectura hexagonal). Todas las dependencias apuntan hacia el núcleo.

```
 Entrada                Núcleo                       Puertos            Salida
 ───────                ──────                       ───────            ──────
 agente  ─► Adaptador MCP ─┐
                           ├─► Aplicación ─► Dominio ─► KernelPort ──► Sandbox del kernel (Python · build123d)
 visor   ─► API HTTP + WS ─┘   (casos de uso)  (TS puro)  RepositorioPort ► Archivos locales (fase 01) / Supabase (fase 03)
                                                         RenderPort ──► Renderizador headless (three.js)
                                                         EventosPort ─► Hub WebSocket (avisa a visores y agentes)
 Transversal: autenticación (fase 03) · logs y trazas · límites de uso · aislamiento del sandbox
```

## Sectores

| Sector | Qué hace | Lenguaje |
|---|---|---|
| Dominio | Pieza, Script, Revisión, Parámetro, Selector, reglas de validación | TypeScript puro |
| Aplicación | Casos de uso y definición de puertos: `EjecutarScript`, `CambiarParametro`, `ConsultarEstado`, `Exportar` (más adelante `CompararVariantes`, `AprobarFusion`) | TypeScript |
| Adaptador MCP | Expone las 4 tools, valida la entrada, arma la respuesta | TypeScript |
| API + WebSocket | Sesiones de personas, sirve la malla al visor, avisa de cambios | TypeScript |
| Sandbox del kernel | Ejecuta el script con build123d; devuelve malla, medidas, validez y errores | Python |
| Renderizador | Capturas de la pieza desde varios ángulos | TypeScript (three.js headless) |
| Visor web | Mostrar, orbitar, medir, editar parámetros | React + three.js |
| Persistencia | Guardar proyecto y revisiones | Archivos (fase 01), Supabase (fase 03) |

## El script es la fuente de verdad

La pieza es lo que resulta de **correr el script**. Un proyecto guarda una lista de **revisiones** del script. Deshacer es volver a la revisión anterior. Una variante (fase 04) es una rama de ese historial.

Persona y agente tocan el mismo documento:
- El **agente** edita el script.
- La **persona** cambia **parámetros** desde el visor. Eso vuelve a correr el script con otros valores, sin pasar por el agente.

### Convención del script

```python
from furnus import param, sel, validar
from build123d import *

largo   = param("largo", 60, min=10, max=200, unidad="mm")
ancho   = param("ancho", 40, min=10, max=200, unidad="mm")
espesor = param("espesor", 3, min=1, max=20, unidad="mm")

with BuildPart() as pieza:
    Box(largo, ancho, 24)
    fillet(sel.aristas(pieza, "superiores"), radius=2)

resultado = pieza.part   # el sandbox lee esta variable
validar(resultado)
```

Reglas:
- Todo valor que una persona querría ajustar se declara con `param(...)`. El sandbox los lista y el visor arma el panel de parámetros con ellos.
- El script termina dejando la pieza en la variable `resultado`.
- El módulo `furnus` es la **librería de ayuda** para el agente: `param`, `sel` (selectores semánticos) y `validar`. Se afina en la fase 02.

### Selectores semánticos

Referencias por significado, no por índice. "Aristas superiores" es un objeto que el kernel resuelve en cada ejecución, así no se rompen al iterar (evita el problema del nombrado topológico).

Conjunto inicial: caras `superior`, `inferior`, `frontal`, `trasera`, `izquierda`, `derecha`; aristas `superiores`, `inferiores`, `verticales`; `agujeros`. Se amplía en la fase 02 según lo que pidan los agentes.

## Las 4 tools del MCP

| Tool | Entrada | Salida |
|---|---|---|
| `ejecutar_script` | `script`, `parametros?` | `ok`, `traceback?`, `medidas` (caja, volumen, área), `valida` (bool + motivos), `parametros` declarados, `revision` |
| `medir` | consulta (distancia entre selectores, espesor mínimo, caja) | valor con unidad |
| `renderizar` | `vistas[]` (iso, frente, arriba, derecha) | imágenes PNG |
| `exportar` | `formato` (step, stl, 3mf), `unidad` | ruta o bytes del archivo |

Sobre el feedback: después de **cada** `ejecutar_script` vuelven errores, medidas y validez. Eso es lo que hace que el agente se corrija. Las capturas son opcionales (cuestan tokens).

Las descripciones de las tools y los ejemplos que reciben los agentes son parte del producto y se afinan en la fase 02.

## Contrato entre dominio y kernel (JSON)

```jsonc
// pedido
{ "script": "...", "parametros": { "largo": 60 }, "salidas": ["malla", "medidas"] }
// respuesta
{ "ok": true,
  "malla": { "formato": "glb", "ruta": "..." },
  "medidas": { "caja": [60, 40, 24], "volumen": 57600.0 },
  "valida": true, "motivos": [],
  "parametros": [{ "nombre": "largo", "valor": 60, "min": 10, "max": 200, "unidad": "mm" }],
  "error": null }
```

## Sandbox

**Fase 01 (uso propio, local):** el script corre en un subproceso de Python con tiempo máximo, límite de memoria, sin red y con una lista de imports permitidos (build123d, math, y `furnus`). Un análisis estático del script descarta `os`, `subprocess`, `socket`, `open` y similares antes de correr.

**Esto NO es seguridad real.** Sirve mientras el único que ejecuta código es Matías. Antes de que un tercero use el sistema (fase 03) hay que reforzarlo con aislamiento de verdad (contenedor por ejecución o similar).

## Patrones

| Patrón | Dónde | Qué resuelve |
|---|---|---|
| Hexagonal | Toda la app | Cambiar kernel, base o cliente de IA sin tocar el dominio |
| Command | Acciones sobre el script | `EjecutarScript` y `CambiarParametro` son comandos; deshacer vuelve a la revisión anterior |
| Historial de revisiones | Dominio y repositorio | Variantes como ramas, historial gratis, piezas reproducibles |
| Specification | Selectores | Referencias que no se rompen al iterar |
| Code Mode (código en sandbox) | Sandbox del kernel | El agente escribe build123d en vez de llamar decenas de tools |
| Publish / Subscribe | EventosPort | El visor y los agentes ven los cambios en vivo |

## Estructura de carpetas

```
packages/
  core/               dominio (TS puro): pieza, script, revisión, parámetros, selectores
  app/                casos de uso y definición de puertos
  mcp-server/         entrada: las 5 tools (decisión 27)
  agente/             chat embebido: bucle de la API de Anthropic sobre las mismas tools del MCP
  api/                entrada: HTTP + WebSocket
  adapter-local/      repositorio en archivos (fase 01)
  adapter-supabase/   repositorio y auth (fase 03)
apps/
  viewer/             React + Vite + three.js
services/
  kernel/             Python · build123d: sandbox, librería `furnus`, export, render
docs/                 los documentos de este proyecto
```

Los tests del núcleo usan un `KernelPort` falso. Aparte van **tests de contrato**: la misma batería corre contra el kernel real para asegurar que cumple lo que el dominio espera.

## Persistencia en la fase 01

```
~/.furnus/proyectos/<id>/
  proyecto.json          nombre, fechas, revisión actual
  revisiones/0001.py     una por revisión del script
  parametros.json        valores actuales de los parámetros
  salidas/               malla, capturas y exportaciones de la última ejecución
```

Se implementa detrás de `RepositorioPort`, así en la fase 03 se cambia por Supabase sin tocar el dominio.
