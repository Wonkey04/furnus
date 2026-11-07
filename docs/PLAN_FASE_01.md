# Plan · Fase 01

## Orden

1. **Esqueleto** (monorepo pnpm, TS, vitest, READMEs, `.env.example`, `.gitignore`).
2. **Kernel Python**, verificado solo con scripts de ejemplo antes de construir encima: análisis estático → subproceso con timeout/memoria → `furnus` (`param`, `validar`) → GLB, medidas, validez → STEP → tests.
3. **Dominio y aplicación** (`core`, `app`) con `KernelPort` falso. Se puede hacer en paralelo con el kernel porque el contrato JSON ya está en `ARCHITECTURE.md`.
4. **Tests de contrato**: misma batería contra el kernel falso y el real.
5. **Persistencia local** (`adapter-local`) detrás de `RepositorioPort`.
6. **MCP** (4 tools) y **API** (Fastify + WebSocket) sobre los casos de uso.
7. **Visor y pantallas** (React + Vite + three.js), tokens de `BRAND.md`.
8. **Demo** y `REPORTE_FASE_01.md`.

## Paralelo

Kernel (Python), dominio/aplicación (TS) y visor (solo estilos y componentes sin datos) son independientes. MCP, API y persistencia esperan a los puertos.

## Riesgos

- **Entorno:** la máquina no tenía Python ni pnpm. Se instalaron Python 3.12 (winget), pnpm (npm) y build123d en un venv en `services/kernel/.venv`.
- **Límite de memoria en Windows:** `resource.setrlimit` no existe. Se usa un Job Object (ctypes) para el límite de memoria y el kill del árbol de procesos.
- **Sin red en el subproceso:** en Windows no hay namespaces. El bloqueo es a nivel de Python (se anulan `socket` y se prohíben imports por análisis estático). No es aislamiento real; ya está avisado en `ARCHITECTURE.md`.
- **Demo con agente real:** requiere un cliente MCP (Claude Desktop o Cursor) manejado por una persona. Si no se puede automatizar, se simula el bucle con un cliente MCP programático y se aclara en el reporte qué se hizo y qué no.
- **Abrir el STEP en otro CAD:** sin FreeCAD instalado, se reimporta con build123d/OCP y se compara volumen y caja; se anota la limitación.
