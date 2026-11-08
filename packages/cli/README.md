Instalador de un comando de Furnus (`npx furnus`): `init` registra el servidor MCP en Claude Desktop y Claude Code, `doctor` revisa el entorno y `dev` levanta la API y el visor.
Expone el ejecutable `furnus` (y las funciones `init`, `doctor` y `planDev` para probarlas con directorios temporales).
NO debe importar otros paquetes `@furnus/*` ni tocar las piezas del usuario; solo lee y escribe las configs de los clientes MCP, siempre con copia de seguridad.
