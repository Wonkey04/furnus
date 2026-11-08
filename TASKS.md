# Tareas · Fase 02 · Agente real

Criterio de cierre: los 4 casos de prueba (ambiguo, error imposible, error con arreglo, cambio de parámetro) pasan con un agente real sin ayuda, y una persona puede pedir una pieza desde el chat del visor y ajustarla con el panel. Ver el brief de la fase 02.

## Hechas en esta pasada
- [x] 1. Errores con contexto: `sugerencia` en el error, radio máximo de filetes/chaflanes, nombre parecido, firma correcta
- [x] 2. `cambiar_parametros(pieza, valores)` con revisión nueva
- [x] 3. Descripción de `ejecutar_script`: suposiciones, cuándo preguntar, pedidos imposibles
- [x] 4. Sin piezas huérfanas
- [x] 6. Chat embebido en el visor: panel «Chat» junto a la pieza, streaming por WebSocket, clave en `.env`
- [x] 7. Renderizador: `renderizar` devuelve PNG de iso / frente / arriba / derecha
- [x] 5. Kernel persistente: ~3 s → ~0,03 s por ejecución en caliente (el primer arranque sigue pagando el import)

## Pendientes

## Pruebas con agente real (necesitan a Matías)
- [x] Probar el chat del visor con el Claude Code real (2026-11-08, ver «Cierre» en `docs/REPORTE_FASE_02.md`): `cambiar_parametros` y suposiciones OK; la autocorrección ante un error quedó abierta
- [ ] Resolver las dudas sobre términos de uso del CLI con suscripción (sección «Dudas sobre los términos de uso» de `docs/DECISIONS.md`)
- [ ] Reiniciar el cliente MCP (carga la tool nueva) y repetir «poné el espesor en 30» con id explícito
- [ ] Error con arreglo posible, sin que el agente lea el repo
- [ ] Abrir un STEP en FreeCAD o Fusion y probar el STEP en pulgadas
- [ ] Repetir con un segundo agente (Cursor u otro): ahora se hace con `furnus init` + `furnus doctor` (Claude Desktop). Es lo que impide cerrar la fase 02

## Fase 03 · Distribución (reemplaza a «cuentas», decisión 48)
- [x] Paquete `furnus` (`packages/cli`): `init`, `doctor`, `dev`, con tests en directorios temporales. Listo para publicar, **sin publicar**
- [x] La API sirve el visor construido y el kernel se ubica con `FURNUS_KERNEL_DIR` (el paquete no tiene el monorepo)
- [ ] Probar `furnus init` y `furnus doctor` en la máquina real de Matías (Windows con Claude Desktop y Claude Code)
- [ ] Probar `furnus doctor --instalar` desde cero (venv + build123d de verdad)
- [ ] Probar el segundo agente por MCP (Claude Desktop, Cursor) con los 4 casos
- [ ] Prueba con una persona externa: anotar dónde se traba
- [ ] Decidir cuándo publicar en npm (nombre `furnus` libre al 2026-11-08, licencia hoy `UNLICENSED`)
- [ ] Decidir qué hace el agente ante un pedido imposible (decisión abierta en `docs/DECISIONS.md`)
