# Tareas · Fase 01 · Prototipo

Criterio de salida: **un agente crea una carcasa simple, la persona la ve en el visor, cambia un parámetro y se exporta un STEP que abre en otro CAD.**

Marcá cada tarea al terminarla y hacé un commit por tarea. Al llegar al final, escribí `docs/REPORTE_FASE_01.md` y frená.

## 1. Esqueleto
- [x] Monorepo pnpm con `packages/`, `apps/`, `services/`, `docs/`
- [x] TypeScript, linter y tests configurados; `pnpm test` corre todo
- [x] README de tres líneas por paquete (qué es, qué expone, qué NO debe importar)
- [x] `.env.example` y `.gitignore`

## 2. Kernel (Python)
- [x] Servicio local que recibe `{script, parametros, salidas}` por JSON
- [x] Análisis estático del script (lista de imports permitidos, sin `os`/`subprocess`/`socket`/`open`)
- [x] Ejecución en subproceso con timeout y límite de memoria, sin red
- [x] Módulo `furnus` con `param()` y `validar()`
- [x] Salidas: malla GLB, medidas (caja, volumen, área), validez con motivos, parámetros declarados, error con traceback legible
- [x] Exportación a STEP
- [x] Tests: script válido, script con error, script con import prohibido, timeout, pieza inválida

## 3. Dominio y aplicación (TypeScript)
- [x] `Pieza`, `Revision`, `Parametro` en `packages/core`
- [x] Puertos `KernelPort` y `RepositorioPort`
- [x] Casos de uso: `EjecutarScript`, `CambiarParametro`, `ConsultarEstado`, `Exportar`
- [x] `KernelPort` falso para tests; tests de dominio sin levantar nada
- [x] Tests de contrato que corren la misma batería contra el kernel real

## 4. Persistencia local
- [x] `adapter-local` implementa `RepositorioPort` con la estructura de `ARCHITECTURE.md`
- [x] Tests: guardar, cargar, volver a una revisión anterior

## 5. MCP
- [x] `packages/mcp-server` con las 4 tools sobre los casos de uso
- [x] Descripciones claras y un ejemplo de script en la descripción de `ejecutar_script`
- [x] Respuesta de `ejecutar_script` con errores, medidas y validez (el feedback que cierra el bucle)
- [ ] Probar que Claude Desktop (o Cursor) lo conecta

## 6. API
- [x] HTTP: listar proyectos, estado de una pieza, servir la malla, cambiar parámetro, exportar
- [x] WebSocket: avisar al visor cuando el agente ejecuta un script

## 7. Visor y pantallas
- [x] Sistema de estilos con los tokens de `docs/BRAND.md` (claro y oscuro)
- [x] Pantalla «Mis piezas»
- [x] Pantalla «Pieza»: visor 3D con orbitar y acercar, vistas, chips de dimensiones y validez, panel de parámetros generado desde los declarados, actividad del agente
- [x] Pantalla «Conectar agente»
- [x] Diálogo «Exportar» (STEP funcional; STL y 3MF deshabilitados con «Próximamente»)
- [x] Estados: vacío, cargando, error del script, pieza inválida, agente desconectado
- [x] Revisar a 400px de ancho

## 8. Demo y cierre
- [ ] Con un agente real, pedir una carcasa simple y llegar a un STEP válido sin tocar código
- [ ] Abrir el STEP en otro CAD (FreeCAD, Fusion u otro) y confirmar que carga y mide bien
- [ ] Probar al menos un error inducido para ver que el agente se corrige con el feedback
- [ ] Escribir `docs/REPORTE_FASE_01.md`: qué se hizo, qué falló, cuántos intentos necesitó el agente, qué se aprendió y qué recomendás para la fase 02
- [ ] Parar y esperar la revisión de Matías
