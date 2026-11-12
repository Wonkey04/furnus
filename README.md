# Furnus

CAD paramétrico 3D en la web. Un agente de IA (el tuyo, vía MCP) escribe un script de [build123d](https://github.com/gumyr/build123d), un sandbox lo ejecuta, y vos ves la pieza en un visor 3D, ajustás parámetros y exportás un STEP.

> Estado: prototipo de uso propio y local. El sandbox **no** está pensado para correr código de terceros.

## Cómo funciona

1. Le pedís una pieza a tu agente (Claude Desktop, Claude Code, Cursor…) o al chat del visor.
2. El agente escribe un script de build123d con parámetros declarados y lo ejecuta con el MCP de Furnus.
3. Recibe feedback (errores, medidas, validez de la geometría, capturas) y se corrige solo.
4. Vos orbitás la pieza, cambiás parámetros desde el panel y exportás un STEP.

El script es la fuente de verdad: todo cambio es una revisión del script o un cambio de parámetros.

## Herramientas MCP

`ejecutar_script`, `cambiar_parametros`, `medir`, `renderizar`, `exportar`.

## Estructura

| Carpeta | Qué es |
|---|---|
| `packages/core` | Dominio en TypeScript puro (sin I/O) |
| `packages/app` | Casos de uso |
| `packages/adapter-kernel` | Adaptador hacia el kernel Python (JSON) |
| `packages/adapter-local` | Persistencia en `~/.furnus/proyectos/<id>/` |
| `packages/api` | HTTP + WebSocket (Fastify) |
| `packages/mcp-server` | Servidor MCP por stdio |
| `packages/agente` | Chat del visor vía `claude -p` |
| `packages/cli` | Paquete `furnus` (`init`, `doctor`, `dev`) |
| `apps/viewer` | Visor React + Vite + three.js |
| `services/kernel` | Kernel Python con build123d (OpenCascade) |
| `docs/` | Fuente de verdad: producto, arquitectura, fases, marca, decisiones |

Arquitectura hexagonal: las dependencias apuntan al dominio, y dominio y kernel se hablan solo por JSON.

## Requisitos

- Node 20+ y pnpm
- Python 3.11+ (para el kernel con build123d)
- Para el chat del visor: Claude Code instalado y con sesión iniciada (usa tu suscripción, sin clave de API)

## Puesta en marcha

```bash
pnpm install
cp .env.example .env
pnpm dev        # API + visor
```

Otros comandos:

```bash
pnpm kernel       # levanta solo el servicio Python
pnpm typecheck
pnpm lint
pnpm test         # incluye los tests del kernel Python
```

Para registrar el MCP en tus clientes: `npx furnus init`, y `npx furnus doctor` para revisar el entorno.

## Documentación

Empezá por [`CLAUDE.md`](CLAUDE.md) y [`docs/PRODUCT.md`](docs/PRODUCT.md). El trabajo en curso está en [`TASKS.md`](TASKS.md).

## Autor

Matías, Córdoba, Argentina · furnus.dev
