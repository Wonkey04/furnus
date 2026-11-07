# Tareas · Fase 01 · Prototipo

Criterio de salida: **un agente crea una carcasa simple, la persona la ve en el visor, cambia un parámetro y se exporta un STEP que abre en otro CAD.**

Marcá cada tarea al terminarla y hacé un commit por tarea. Al llegar al final, escribí `docs/REPORTE_FASE_01.md` y frená.

## 1. Esqueleto
- [x] Monorepo pnpm con `packages/`, `apps/`, `services/`, `docs/`
- [x] TypeScript, linter y tests configurados; `pnpm test` corre todo
- [x] README de tres líneas por paquete (qué es, qué expone, qué NO debe importar)
- [x] `.env.example` y `.gitignore`

## 2. Kernel (Python)
- [ ] Servicio local que recibe `{script, parametros, salidas}` por JSON
- [ ] Análisis estático del script (lista de imports permitidos, sin `os`/`subprocess`/`socket`/`open`)
- [ ] Ejecución en subproceso con timeout y límite de memoria, sin red
- [ ] Módulo `furnus` con `param()` y `validar()`
- [ ] Salidas: malla GLB, medidas (caja, volumen, área), validez con motivos, parámetros declarados, error con traceback legible
- [ ] Exportación a STEP
- [ ] Tests: script válido, script con error, script con import prohibido, timeout, pieza inválida

## 3. Dominio y aplicación (TypeScript)
- [ ] `Pieza`, `Revision`, `Parametro` en `packages/core`
- [ ] Puertos `KernelPort` y `RepositorioPort`
- [ ] Casos de uso: `EjecutarScript`, `CambiarParametro`, `ConsultarEstado`, `Exportar`
- [ ] `KernelPort` falso para tests; tests de dominio sin levantar nada
- [ ] Tests de contrato que corren la misma batería contra el kernel real

## 4. Persistencia local
- [ ] `adapter-local` implementa `RepositorioPort` con la estructura de `ARCHITECTURE.md`
- [ ] Tests: guardar, cargar, volver a una revisión anterior

## 5. MCP
- [ ] `packages/mcp-server` con las 4 tools sobre los casos de uso
- [ ] Descripciones claras y un ejemplo de script en la descripción de `ejecutar_script`
- [ ] Respuesta de `ejecutar_script` con errores, medidas y validez (el feedback que cierra el bucle)
- [ ] Probar que Claude Desktop (o Cursor) lo conecta

## 6. API
- [ ] HTTP: listar proyectos, estado de una pieza, servir la malla, cambiar parámetro, exportar
- [ ] WebSocket: avisar al visor cuando el agente ejecuta un script

## 7. Visor y pantallas
- [ ] Sistema de estilos con los tokens de `docs/BRAND.md` (claro y oscuro)
- [ ] Pantalla «Mis piezas»
- [ ] Pantalla «Pieza»: visor 3D con orbitar y acercar, vistas, chips de dimensiones y validez, panel de parámetros generado desde los declarados, actividad del agente
- [ ] Pantalla «Conectar agente»
- [ ] Diálogo «Exportar» (STEP funcional; STL y 3MF deshabilitados con «Próximamente»)
- [ ] Estados: vacío, cargando, error del script, pieza inválida, agente desconectado
- [ ] Revisar a 400px de ancho

## 8. Demo y cierre
- [ ] Con un agente real, pedir una carcasa simple y llegar a un STEP válido sin tocar código
- [ ] Abrir el STEP en otro CAD (FreeCAD, Fusion u otro) y confirmar que carga y mide bien
- [ ] Probar al menos un error inducido para ver que el agente se corrige con el feedback
- [ ] Escribir `docs/REPORTE_FASE_01.md`: qué se hizo, qué falló, cuántos intentos necesitó el agente, qué se aprendió y qué recomendás para la fase 02
- [ ] Parar y esperar la revisión de Matías
