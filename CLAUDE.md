# Furnus

CAD paramétrico 3D en la web. Un agente de IA (el del usuario, vía MCP) escribe un script de build123d, un sandbox lo ejecuta, y la persona ve la pieza en un visor 3D, ajusta parámetros y exporta un STEP.

Dominio: furnus.dev. Autor: Matías (Córdoba, Argentina). Idioma de la interfaz y de la documentación: español rioplatense (vos).

## Leé esto antes de tocar nada

Los documentos de `docs/` son la fuente de verdad. Si algo del código contradice un documento, gana el documento. Si el documento está mal, proponé el cambio en `docs/DECISIONS.md` antes de desviarte.

| Archivo | Para qué |
|---|---|
| `docs/PRODUCT.md` | Qué es, para quién, qué valida el prototipo, qué queda afuera |
| `docs/ARCHITECTURE.md` | Sectores, puertos, patrones, carpetas, contratos |
| `docs/PHASES.md` | Las 4 fases, qué se toca en cada una, criterio de salida |
| `docs/SCREENS.md` | Las 4 pantallas del prototipo |
| `docs/BRAND.md` | Nombre, filosofía, tokens, tipografía, voz |
| `docs/DECISIONS.md` | Qué se decidió, por qué, y qué sigue pendiente |
| `TASKS.md` | Lista de tareas de la fase en curso |

## Reglas de trabajo

1. **Una fase por vez.** Trabajá solo en la fase indicada en `TASKS.md`. Al llegar al criterio de salida, parás, escribís `docs/REPORTE_FASE_XX.md` y esperás la revisión de Matías. No arranques la fase siguiente.
2. **Alcance del prototipo (fase 01):** una sola pieza por proyecto, sin ensamblajes, sin login, sin multiusuario, sin variantes. Si te tienta agregarlo, anotalo en `docs/DECISIONS.md` como idea y seguí.
3. **El script es la fuente de verdad**, no la geometría. Todo lo que cambia la pieza es una revisión del script o un cambio de parámetros.
4. **Arquitectura hexagonal.** El dominio (`packages/core`) es TypeScript puro: sin I/O, sin frameworks, sin importar adaptadores. Las dependencias apuntan hacia el núcleo. Los tests del dominio usan un `KernelPort` falso.
5. **El dominio y el kernel se hablan por JSON.** No comparten código. TypeScript de un lado, Python del otro.
6. **Nada de claves ni secretos en el repo.** Usá variables de entorno y un `.env.example`.
7. **Tests primero en lo difícil**: selectores semánticos, ejecución del script, validación de geometría, contrato del MCP. Lo trivial no necesita tests.
8. **Commits chicos y frecuentes**, uno por tarea de `TASKS.md`. Mensajes en español, imperativo ("Agrega el puerto del kernel").
9. **Si algo es ambiguo y barato de revertir, decidí y dejalo anotado. Si es caro de revertir, frená y preguntá.**

## Stack (decisiones tomadas)

- Monorepo con pnpm y TypeScript (Node 20+).
- Dominio y aplicación: TypeScript puro.
- MCP: `@modelcontextprotocol/sdk`, transporte stdio.
- API: HTTP + WebSocket (Fastify). Se puede cambiar a NestJS si Matías lo pide; no lo cambies por tu cuenta.
- Visor: React + Vite + three.js.
- Kernel: Python 3.11+ con build123d (OpenCascade), expuesto como servicio local que habla JSON.
- Persistencia fase 01: archivos locales en `~/.furnus/proyectos/<id>/` (ver `docs/ARCHITECTURE.md`). Supabase llega en la fase 03.

## Estilo del código

- Nombres de dominio en español (`Pieza`, `Revision`, `Parametro`, `Selector`), nombres técnicos en inglés (`adapter`, `port`).
- Sin comentarios que repitan lo que hace el código; sí comentarios que expliquen un porqué.
- Cada paquete con su propio README de tres líneas: qué es, qué expone, qué NO debe importar.

## Qué NO hacer

- No uses un ORM ni una base de datos en la fase 01.
- No agregues un color a la interfaz: es blanco y negro (ver `docs/BRAND.md`).
- No inventes herramientas MCP extra: son cuatro (ver `docs/ARCHITECTURE.md`).
- No ejecutes scripts de usuario fuera del sandbox, ni siquiera en tests.
- No des la seguridad del sandbox por resuelta en la fase 01: es solo para uso propio y local.

## Comandos (completá a medida que existan)

```
pnpm install
pnpm test          # tests de todos los paquetes
pnpm dev           # api + visor
pnpm kernel        # levanta el servicio Python
```
