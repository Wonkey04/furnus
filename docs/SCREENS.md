# Pantallas del prototipo

Cuatro pantallas. Existe un prototipo visual navegable en el canvas de diseño de Matías; esta es su descripción para implementarlas. El estilo está en `BRAND.md`.

Todas comparten un **encabezado de vidrio**: logo (cúpula) + «Furnus», navegación («Mis piezas», «Conectar agente») y un chip de estado del agente («Sin agente conectado» o «Claude Desktop conectado»).

## 1. Mis piezas (`/`)

- Título «Mis piezas», subtítulo «Guardadas en este equipo.»
- Botón primario «Nueva pieza».
- Si no hay agente conectado, un banner de vidrio: «Todavía no conectaste un agente. Sin agente podés ver y ajustar tus piezas, pero no pedirle cambios.» con botón «Conectar agente».
- Grilla de tarjetas de vidrio: miniatura isométrica de la pieza, nombre, «N operaciones · editada hoy». Cada una abre la pantalla de la pieza.

## 2. Pieza (`/pieza/:id`)

Tres paneles flotantes sobre el fondo:

- **Izquierda, «Árbol de features»:** lista de pasos de la pieza (en el prototipo visual se mostraba como features numeradas; en la implementación son las **revisiones** del script). El seleccionado se resalta. Botones «Deshacer» y «Rehacer». Un paso en curso muestra la etiqueta «agente editando».
- **Centro, visor 3D:** pieza isométrica, orbitar con arrastre y acercar con la rueda, botones de vista (Iso, Frente, Arriba, Derecha), herramientas Medir y Corte, chip de dimensiones («60 × 40 × 24 mm») y chip de validez («Geometría válida»). Las aristas seleccionadas se resaltan con trazo más grueso.
- **Derecha:** «Parámetros» generados desde los declarados en el script (input con unidad, mono) y «Actividad del agente»: lista de llamadas con estado (OK, Error con su explicación, Corrigiendo).
- Encabezado: ruta «Mis piezas / nombre», chip del agente y botón primario «Exportar».

Al cambiar un parámetro la pieza se regenera. Texto de ayuda: «Al cambiar un valor, la pieza se regenera.»

## 3. Conectar agente (`/conectar`)

- Selector de cliente: Claude Desktop, Cursor, Otro cliente MCP.
- Tres pasos en un panel de vidrio:
  1. «Copiá esta configuración»: bloque JSON con botón «Copiar» (el paquete MCP real reemplaza el marcador `[paquete-mcp]`).
  2. «Pegala en Claude Desktop»: instrucciones breves.
  3. «Verificá la conexión»: estado «Esperando conexión del agente…» y botón «Probar conexión».
- Enlaces «Volver a Mis piezas» e «Ir a la pieza».

## 4. Exportar (diálogo)

- Título «Exportar pieza», subtítulo con nombre y rama.
- Formato (radio): **STEP** (Recomendado, abrir en otro CAD), **STL** (imprimir en 3D), **3MF** (imprimir con unidades).
- Unidad: Milímetros / Pulgadas.
- Estado «La pieza es válida y se puede exportar.»
- «Cancelar» y botón primario «Descargar STEP» (cambia según el formato elegido).
- En la fase 01 solo funciona STEP; STL y 3MF llegan en la fase 02 (se muestran deshabilitados con la etiqueta «Próximamente»).

## Estados que hay que cubrir

Vacío (sin piezas), cargando (el script se está ejecutando), error del script (mostrar el traceback legible y no tapar la pieza anterior), pieza inválida (exportar deshabilitado y motivos a la vista), agente desconectado.

## Accesibilidad

Objetivos táctiles de 44px, foco visible, contraste mínimo 4.5:1, estados que no dependen del color, funciona a 400px de ancho (los paneles se apilan).
