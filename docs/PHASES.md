# Fases

Cada fase termina con un **corte de revisión**: Matías revisa el resultado antes de lanzar la siguiente. Los tiempos son orientativos, con Claude Code a tiempo completo.

| Fase | Semanas | Foco |
|---|---|---|
| 01 · Prototipo | 1 a 3 | Un prompt termina en un STEP válido, de punta a punta |
| 02 · Afinar la API | 3 a 7 | Hacer que agentes reales usen bien las tools y la librería (la que más se estira) |
| 03 · Distribución | 7 a 9 | Instalador de un comando (`npx furnus`) y prueba con una persona externa |
| 04 · Variantes | 9 a 12 | Ramas, comparación lado a lado, aprobación, cambios en vivo |

## Qué se toca en cada fase

`●` se construye · `○` se ajusta o amplía

| Sector | Fase 01 | Fase 02 | Fase 03 | Fase 04 |
|---|---|---|---|---|
| Dominio | ● script, parámetros, 2 comandos | ○ selectores semánticos y reglas de validación | | ● ramas, variantes y fusión |
| Adaptador MCP | ● 4 tools mínimas | ○ 5 tools; descripciones y ejemplos según cómo las usen los agentes | | ○ tools de variantes |
| Sandbox del kernel | ● corre scripts de build123d con timeout | ○ librería de ayuda y errores claros para el agente | | |
| Renderizador | | ● capturas desde varios ángulos | | |
| Visor web 3D | ● orbitar y ver la malla, editar parámetros | ○ medir y cortes | | ● comparar variantes lado a lado |
| Exportadores | ● STEP | ○ STL y 3MF | | |
| API y WebSocket | ● servir la malla al visor | ● chat embebido (Claude Code del usuario) | ○ sirve el visor construido | ● cambios en vivo |
| Persistencia | ● archivos locales | | | |
| Distribución | | | ● paquete `furnus`: `init`, `doctor`, `dev` | |

## Criterios de salida

- **Fase 01:** un agente crea una carcasa simple, la persona la ve en el visor, cambia un parámetro y se exporta un STEP que abre en otro CAD.
- **Fase 02:** una batería fija de pedidos de prueba se resuelve sin ayuda con al menos dos agentes distintos.
- **Fase 03:** una persona que no sos vos instala Furnus con un comando, conecta su propio agente y llega a un STEP, sin ayuda tuya. Se anota dónde se trabó.
- **Fase 04:** dos agentes iteran a la vez en ramas distintas y Matías compara y aprueba una.

## Fase 01 en detalle

Orden sugerido (cada punto es una o más tareas en `TASKS.md`):

1. **Esqueleto del monorepo**, README de cada paquete, CI mínima de tests.
2. **Kernel:** servicio Python que recibe un script, lo ejecuta en el sandbox y devuelve malla (GLB), medidas, validez y errores. Incluye la librería `furnus` mínima (`param`, `validar`).
3. **Dominio y aplicación:** `Pieza`, `Revision`, `Parametro`; casos de uso `EjecutarScript`, `CambiarParametro`, `ConsultarEstado`, `Exportar`; puertos `KernelPort` y `RepositorioPort`; kernel falso para tests.
4. **Persistencia local** detrás de `RepositorioPort`.
5. **MCP:** las 4 tools sobre los casos de uso (en la fase 02 pasan a 5).
6. **API + WebSocket:** servir la malla y avisar cuando cambia.
7. **Visor:** orbitar, ver la pieza, panel de parámetros generado desde los declarados, chips de medidas y validez.
8. **Las 4 pantallas** según `SCREENS.md` y `BRAND.md`.
9. **Demo de punta a punta** con un agente real (ver `TASKS.md`) y reporte.

## Fase 03 en detalle (distribución)

Se reemplaza la antigua fase 03 (login, Supabase, servidor). Motivo en la decisión 48: Furnus es un producto local, el agente es el de la persona y nadie paga tokens por ella.

1. **Paquete `furnus`** (`packages/cli`): `init` registra el MCP en Claude Desktop y Claude Code con copia de seguridad; `doctor` revisa Node, Python, build123d, Claude Code y que el MCP responda (con `--instalar` prepara el kernel); `dev` levanta la API y el visor. *Hecho y probado con directorios temporales; falta probarlo en la máquina real de Matías.*
2. **Probar `init` en la máquina de Matías** con Claude Desktop y Cursor (el segundo agente que pide el criterio de la fase 02).
3. **Prueba con una persona externa**: instala sola, conecta su agente y pide una pieza. Se anota dónde se traba.
4. **Publicar en npm** solo cuando Matías lo decida (el nombre `furnus` estaba libre el 2026-11-08; no está reservado).

## Ideas futuras (no planificadas)

Cuentas, login, proyectos en un servidor (Supabase), historial en la nube y sandbox reforzado por usuario. Solo tienen sentido si el producto pasa a ser hospedado, y eso obliga a resolver quién paga los tokens y las dudas de términos de uso de la decisión 40 a 47.

Arquitectura (edificios), ensamblajes, planos 2D, monetización. No están planificados todavía.
