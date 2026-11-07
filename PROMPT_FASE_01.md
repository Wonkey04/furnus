# Prompt para arrancar la fase 01

Copiá lo de abajo en Claude Code, en la carpeta vacía del repo, después de poner `CLAUDE.md`, `TASKS.md` y la carpeta `docs/`.

---

Vas a construir la fase 01 de Furnus, un CAD paramétrico 3D en la web donde un agente de IA diseña piezas escribiendo scripts de build123d.

**Primero leé, en este orden:** `CLAUDE.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/PHASES.md`, `docs/SCREENS.md`, `docs/BRAND.md` y `docs/DECISIONS.md`. Después leé `TASKS.md`. Si algo no es claro, anotá tu suposición en `docs/DECISIONS.md` y seguí; solo frená si la decisión es cara de revertir.

**Tu trabajo es la fase 01, nada más.** El criterio de salida está al principio de `TASKS.md`. No arranques la fase 02.

**Cómo trabajar:**
1. Antes de escribir código, armá un plan corto en `docs/PLAN_FASE_01.md`: orden de las tareas, qué se puede hacer en paralelo y qué riesgos ves. Seguí con el plan sin esperar aprobación.
2. Usá subagentes para lo que es independiente. Una división razonable: (a) kernel en Python, (b) dominio y aplicación en TypeScript, (c) visor y pantallas. El MCP, la API y la persistencia dependen de los puertos, así que van después de que dominio y kernel acuerden el contrato JSON de `docs/ARCHITECTURE.md`.
3. Un commit por tarea de `TASKS.md`, y marcá la casilla cuando termine. Si una tarea falla, dejala sin marcar y anotá por qué.
4. Escribí tests de lo difícil primero: ejecución del script, sandbox, validación de geometría, contrato del MCP.
5. Hacé el kernel primero y verificalo solo, con scripts de ejemplo, antes de construir nada encima.

**Lo más importante de validar:** que un agente real, con el feedback que le devuelve `ejecutar_script`, se corrija solo. En la tarea de demo, provocá errores a propósito (un filete demasiado grande, un parámetro fuera de rango, un import prohibido) y registrá cuántos intentos necesita.

**Al terminar:** escribí `docs/REPORTE_FASE_01.md` con lo hecho, lo que falló, los resultados de la demo y tus recomendaciones para la fase 02. Después frená y avisá. No sigas.

**Límites:** nada de claves en el repo, nada de código de usuario fuera del sandbox, sin colores en la interfaz (es blanco y negro), y no agregues herramientas MCP extra.
