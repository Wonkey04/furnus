# Decisiones

Registro de lo que se decidió y por qué. Si querés desviarte de algo de acá, agregá una entrada nueva y no lo cambies en silencio.

## Decididas

| # | Decisión | Por qué |
|---|---|---|
| 1 | Producto web propio en lugar de depender del MCP de Fusion | Permite equipos y varios agentes sobre el mismo proyecto; el visor y el flujo son propios |
| 2 | 3D desde el primer día; primer público: diseñadores industriales | Un visor 2D no sirve para iterar piezas |
| 3 | El agente lo pone el usuario (BYO agent) | No vendemos un modelo ni asumimos su costo |
| 4 | **Code Mode:** el agente escribe un script de build123d en vez de llamar muchas tools | Gasta menos tokens, los agentes escriben bien código y el traceback es buen feedback |
| 5 | MCP mínimo: 4 tools (`ejecutar_script`, `medir`, `renderizar`, `exportar`) | Menos definiciones que cargar en el contexto del agente |
| 6 | El script es la fuente de verdad; los parámetros se declaran con `param()` | Persona y agente tocan el mismo documento; la persona ajusta sin pasar por el agente |
| 7 | Selectores semánticos | Evita el problema del nombrado topológico |
| 8 | Arquitectura hexagonal, dominio en TypeScript puro, kernel en Python | Cambiar kernel o base sin tocar el dominio |
| 9 | Kernel: build123d (OpenCascade) | CAD por código; STEP nativo |
| 10 | Exportación: STEP primero, luego STL y 3MF | STEP es el que le sirve a un diseñador |
| 11 | Visor: three.js | Estándar, buen soporte |
| 12 | Una sola pieza por proyecto en el prototipo | Alcance |
| 13 | Corrida por fases con corte de revisión | Revisión humana antes de seguir |
| 14 | Estilo: vidrio esmerilado en blanco y negro, entre Apple y Notion | Decidido por Matías |
| 15 | Nombre: **Furnus**; dominio furnus.dev | Decidido por Matías |
| 16 | Evaluados y descartados: Draftum, Datmate, AntroMate, ScaleMate, Tekton, Rukafe, Eidos | Choques de marca, dominios o encaje |

## Pendientes (decidir con Matías)

- **Persistencia local desde la fase 01.** Se propone en `ARCHITECTURE.md` (archivos en `~/.furnus/`). Falta que Matías lo confirme.
- **Paquete MCP:** nombre del paquete para npm (`[paquete-mcp]` en la pantalla Conectar).
- **Registro de marca:** consulta en el INPI (clases 9 y 42) y revisión con un agente de propiedad industrial. No se pudo verificar por herramientas.
- **Dominios extra:** furnus.dev está elegido; considerar furnus.app y furnus.co.
- **Seguridad del sandbox:** el de la fase 01 es solo para uso propio. Definir el aislamiento real antes de la fase 03.
- **Framework de la API:** Fastify por defecto; NestJS si Matías lo prefiere.
- **Monetización:** sin definir.

## Ideas fuera de alcance (anotá acá lo que se te ocurra)

- Arquitectura (edificios) como segundo público.
- Ensamblajes con restricciones.
- Planos 2D a partir de la pieza.
