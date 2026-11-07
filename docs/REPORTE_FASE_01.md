# Reporte · Fase 01

## Resumen

Todo el circuito funciona de punta a punta y está probado: **script → kernel (build123d) → malla GLB → visor 3D → parámetro → STEP**. La hipótesis 2 (el agente se corrige solo) se probó, pero **con un agente que fui yo mismo operando el MCP real por stdio**, no con Claude Desktop ni Cursor. Esa parte (y abrir el STEP en FreeCAD/Fusion) queda **sin verificar** y necesita a Matías.

## Qué se hizo

- Monorepo pnpm, TypeScript estricto, eslint (con reglas que prohíben a `core` y `app` importar adaptadores), vitest, READMEs de tres líneas, `.env.example`.
- **Kernel Python** (`services/kernel`): servicio HTTP local; análisis estático (AST), subproceso con timeout y tope de memoria (Job Object en Windows), módulo `furnus` (`param`, `validar`, `sel` con caras/aristas/agujeros), salidas GLB + medidas + validez con motivos + parámetros + traceback legible con línea; STEP en mm o pulgadas. 23 tests.
- **Dominio y aplicación**: `Pieza`, `Revision`, `Parametro`; casos de uso `EjecutarScript`, `CambiarParametro`, `ConsultarEstado`, `Exportar` (más `IrARevision`, `MedirPieza`, `CrearPieza`, `ListarPiezas`); puertos y kernel falso. Batería de contrato que corre contra el falso y contra el kernel real.
- **Persistencia local**, **MCP** (4 tools, descripción de `ejecutar_script` con reglas y ejemplo), **API Fastify + WebSocket**.
- **Visor** React + three.js: las 4 pantallas, tokens claro/oscuro, tres grises por cara, cotas reales sobre la pieza, estados vacío / cargando / error de script / pieza inválida / agente desconectado. Revisado a 400 px sin scroll horizontal.
- Tests: 61 en TypeScript (core 12, app 20, adapter-local 6, adapter-kernel 7, mcp 9, api 7) y 23 en Python. `pnpm test`, `lint` y `typecheck` pasan.

## Demo (agente = Claude operando el MCP por stdio)

Cliente: `packages/mcp-server/src/cliente-demo.ts`, con el mismo comando que muestra «Conectar agente». Pedido: una carcasa con paredes y esquinas redondeadas.

| Caso | Intentos hasta lograrlo | Qué vio el agente |
|---|---|---|
| Carcasa simple (sin error) | 1 | `ok`, caja 80×50×30, volumen, `valida: true`, 5 parámetros |
| Filete demasiado grande (radio 30 en 50 mm) | 2 | `ValueError … try a smaller value`, línea 12 y la línea de código; bajó el radio |
| Parámetro fuera de rango (`pared=10`) | 2 | «El parámetro «pared» vale 10 mm y tiene que estar entre 1 y 6 mm.» |
| Import prohibido (`import os`) | 2 | «No se puede importar «os». Solo se permiten: build123d, furnus, math.» |

Después: la persona cambió `largo` a 120 por la API (misma ruta que el visor), y `exportar` devolvió un STEP. Reimportado con build123d: caja 120×50×30, volumen 41959,67 mm³ (igual al del kernel), válido, un sólido. STL se rechaza con mensaje claro.

**Salvedad importante:** son 4 casos y el corrector soy un modelo que ya conocía el diseño del feedback. No prueba nada sobre otros agentes ni sobre pedidos ambiguos. Es la fase 02.

## Qué falló o falta

- **Claude Desktop / Cursor no se conectaron de verdad.** Solo se verificó el protocolo (tests en memoria y cliente stdio real) y el latido del agente en la API.
- **STEP en otro CAD: no se abrió** (no hay FreeCAD ni Fusion en esta máquina). Verificado solo por reimportación con OpenCascade.
- Cada ejecución tarda ~3 s (el import de build123d domina). Se nota al cambiar parámetros.
- `renderizar`, `medir` avanzado, STL/3MF, Medir y Corte del visor: fase 02, aparecen como «Próximamente» o devuelven un error honesto.
- No hay «agente editando» ni «Corrigiendo» en vivo: la UI solo se entera al terminar cada llamada. Las aristas seleccionadas del visor tampoco existen todavía.
- Las miniaturas de «Mis piezas» dibujan la caja de la pieza, no su forma.
- El sandbox sigue sin ser seguridad real (Windows, sin contenedor).
- Hay un `.tmp-furnus/` y `.tmp/` de pruebas en el repo, ignorados por git.

## Recomendaciones para la fase 02

1. Hacer la prueba real: conectar Claude Desktop con la config de `/conectar` y correr una batería fija de pedidos; medir intentos por agente.
2. Worker de kernel caliente (build123d ya importado) para bajar de ~3 s a décimas.
3. `renderizar` (capturas) y `medir` de distancias/espesor mínimo; son lo que más ayuda a corregir geometría que «parece» bien pero está mal.
4. Mensajes de `furnus`: hoy el error de filete viene de build123d en inglés; envolverlo en español con sugerencia (`max_fillet`).
5. Ampliar `sel` según lo que pidan los agentes y publicar el paquete MCP (`[paquete-mcp]`).
6. Decidir el nombre del paquete y el aislamiento real del sandbox antes de la fase 03.

Paro acá y espero tu revisión.
