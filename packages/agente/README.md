Agente de chat del visor: lanza el CLI de Claude Code del usuario (`claude -p`, salida `stream-json`) con el MCP de Furnus registrado y traduce su salida a eventos de chat. Sin clave de API: usa la suscripción de la persona.
Expone `AgenteCli`, `diagnosticarCli`, `ayudaClaudeCode` y los tipos de evento del chat.
NO debe contener reglas de dominio ni hablar con el kernel o el disco de piezas (todo pasa por el MCP), ni leer o guardar credenciales de Anthropic.
