Agente de chat del visor: bucle de la API de Anthropic que usa las MISMAS tools del MCP (conectadas en memoria) y emite eventos de streaming.
Expone `crearAgente()`, `Conversaciones` y los tipos de evento del chat.
NO debe contener reglas de dominio ni hablar con el kernel o el disco: todo pasa por los casos de uso de `@furnus/app`.
