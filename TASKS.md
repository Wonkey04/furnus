# Tareas · Fase 02 · Agente real

Criterio de cierre: los 4 casos de prueba (ambiguo, error imposible, error con arreglo, cambio de parámetro) pasan con un agente real sin ayuda, y una persona puede pedir una pieza desde el chat del visor y ajustarla con el panel. Ver el brief de la fase 02.

## Hechas en esta pasada
- [x] 1. Errores con contexto: `sugerencia` en el error, radio máximo de filetes/chaflanes, nombre parecido, firma correcta
- [x] 2. `cambiar_parametros(pieza, valores)` con revisión nueva
- [x] 3. Descripción de `ejecutar_script`: suposiciones, cuándo preguntar, pedidos imposibles
- [x] 4. Sin piezas huérfanas

## Pendientes
- [ ] 5. Kernel persistente (bajar de ~3 s a menos de 1 s)
- [ ] 6. Chat embebido en el visor (API de Anthropic, streaming, clave en `.env`)
- [ ] 7. Renderizador (`renderizar`)

## Pruebas con agente real (necesitan a Matías)
- [ ] Reiniciar el cliente MCP (carga la tool nueva) y repetir «poné el espesor en 30» con id explícito
- [ ] Error con arreglo posible, sin que el agente lea el repo
- [ ] Abrir un STEP en FreeCAD o Fusion y probar el STEP en pulgadas
- [ ] Repetir con un segundo agente (Cursor u otro)
