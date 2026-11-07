# Guía de pruebas · Fase 02

Para cerrar la fase hace falta que los 4 casos pasen **con un agente real y sin ayuda**: sin que el agente lea el repo y sin que vos le cuentes cómo se usa Furnus. Tiempo estimado: 45 a 60 minutos para el primer agente, 20 para el segundo.

Regla de oro: **no le des pistas.** Pedí las cosas como las pediría una persona que no sabe cómo funciona por dentro. Si el agente se traba, esa es justamente la información que buscamos.

---

## 0. Preparación (10 min)

1. **Cerrá todo lo viejo.** Detené `pnpm dev` si está corriendo (Ctrl+C en su terminal) y cerrá cualquier visor o API que haya quedado de antes (puertos 4010, 4020 y 5173). Si quedó algo colgado:
   ```powershell
   Get-NetTCPConnection -LocalPort 4010,4020,5173 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess
   ```
2. **Clave para el chat** (solo para la parte B). Copiá `.env.example` a `.env` y completá `ANTHROPIC_API_KEY=`. El archivo `.env` no se commitea. Opcional: `FURNUS_MODELO=claude-sonnet-5-5` si querés probar algo más barato.
3. **Levantá todo:**
   ```bash
   pnpm dev
   ```
   Abrí `http://localhost:5173`. Arriba a la derecha tiene que decir «Sin agente conectado» (todavía no conectaste ninguno).
4. **Conectá el agente externo (parte A).** Abrí la pantalla «Conectar agente» del visor y copiá la configuración que muestra. Para Claude Desktop va en `%APPDATA%\Claude\claude_desktop_config.json`; para Cursor, en su configuración de MCP. La forma es:
   ```json
   {
     "mcpServers": {
       "furnus": {
         "command": "node",
         "args": ["--import", "file:///C:/furnus/node_modules/tsx/dist/esm/index.mjs", "C:/furnus/packages/mcp-server/src/main.ts"]
       }
     }
   }
   ```
   **Reiniciá el cliente por completo** (cerrarlo, no solo abrir un chat nuevo): así carga las 5 tools, incluida `cambiar_parametros`. Cuando conecte, el visor pasa a «Agente conectado».
5. **Chequeo rápido:** pedile «¿qué herramientas de Furnus tenés?». Tienen que ser 5: `ejecutar_script`, `cambiar_parametros`, `medir`, `renderizar`, `exportar`. Si faltan, el cliente no se reinició bien.

> Cada caso va en **una conversación nueva** del agente, salvo que diga lo contrario.

---

## A. Los 4 casos con un agente externo (Claude Desktop o Cursor)

Al lado de cada caso hay qué mirar. Anotá en la tabla de resultados del final.

### Caso 1 · Pedido ambiguo

**Decile:** `Hacé una mesa.`

| Pasa si… | No pasa si… |
|---|---|
| Asume medidas razonables **sin preguntarte** las dimensiones | Te pregunta largo, ancho y alto |
| Todas las medidas quedan como parámetros (panel «Parámetros» del visor) | Hardcodea números dentro del script |
| Al final **lista lo que asumió** («Asumí: 1200 × 700 mm, alto 740…») | No avisa qué asumió |
| Si pregunta algo, es de **forma** (¿con cajones?, ¿patas rectas o cónicas?), no de medidas | Pregunta cosas de medidas |

Anotá también: cuántas veces llamó a `ejecutar_script`, si usó `renderizar` para mirar el resultado y si dejó la pieza válida.

### Caso 2 · Error imposible

**Decile:** `Hacé una caja de 20 por 20 por 10 mm con filetes de 15 mm en todas las aristas.`

| Pasa si… | No pasa si… |
|---|---|
| Descubre que no entra y te dice **cuál es el máximo** (≈ 4,9 mm) | Se frena solo con «falló, ¿qué hago?» sin dar el máximo |
| Te **pregunta** si querés ese máximo u otra cosa | Cambia a 4,9 mm en silencio y no te avisa |
| No inventa una pieza distinta a la pedida | Entrega algo sin filetes y no lo dice |

Después revisá «Mis piezas»: **no tiene que haber quedado una pieza vacía** nueva por este intento (punto 4 del brief).

Seguí la conversación y respondé `Dale, con el máximo.` Tiene que terminar con una pieza válida.

### Caso 3 · Error con arreglo posible

El objetivo es que el agente **se corrija solo en 2 intentos como máximo**, sin leer el repo. Probá estas tres variantes (cada una en conversación nueva). No las expliques: pedilas tal cual.

- **3a · Import prohibido.** `Hacé una caja de 60 x 40 x 20 mm y calculá el radio del filete con numpy.`
  Esperado: el primer intento falla con «No se puede importar…», el segundo ya no usa numpy (usa `math` o un número).
- **3b · Parámetro fuera de rango.** Primero `Hacé una caja de 60 x 40 x 20 mm con el largo como parámetro.` Después `Poné el largo en 5000.`
  Esperado: el error dice el rango permitido; el agente te lo cuenta y te propone un valor válido o te pregunta si querés ampliar el rango. No tiene que insistir con 5000.
- **3c · Método mal llamado.** Es difícil de provocar a propósito. Si en cualquier momento de las pruebas el agente escribe mal un método o un argumento de build123d, anotá cuántos intentos le llevó corregirlo.

| Pasa si… | No pasa si… |
|---|---|
| Se corrige en ≤ 2 intentos usando el mensaje y la `sugerencia` del error | Necesita 3 o más intentos |
| No abre archivos del repo ni busca en internet para entender el error | Lee el código fuente de Furnus |

### Caso 4 · Cambio de parámetro con id explícito

Continuá en la conversación del caso 1 (la mesa). **Decile:** `Poné el espesor de la tapa en 30.`

| Pasa si… | No pasa si… |
|---|---|
| Llama a **`cambiar_parametros`** con el id de la pieza | Reenvía todo el script con `ejecutar_script` |
| En el visor aparece una **revisión nueva** en el árbol de features | Responde «ya está en 30» sin llamar a ninguna tool (pasó en la fase 01) |
| La respuesta trae las medidas nuevas y la pieza sigue válida | |

Después probá un valor fuera de rango: `Poné el espesor en 500.` Tiene que explicar el rango, no romper nada.

### Extra · Ver la pieza

En cualquier conversación: `Mirá la pieza y decime si las patas están bien puestas.` Tiene que llamar a `renderizar` y describir lo que ve. Anotá si te parece que entendió las imágenes.

---

## B. El chat del visor con clave real (15 min)

Con `pnpm dev` corriendo y la clave en `.env`, abrí una pieza nueva («Nueva pieza») y usá el panel **Chat**. Repetí en versión corta:

1. `Hacé una mesa` → ¿arma la pieza, aparece en el visor y lista las suposiciones?
2. `Poné el espesor de la tapa en 30` → ¿usa `cambiar_parametros` (lo ves en la línea de la tool del chat)?
3. `Hacé una caja de 20x20x10 con filetes de 15` → ¿informa el máximo y pregunta?
4. Cerrá la pestaña y volvé a abrir la pieza → ¿se restaura la conversación?
5. Mandá un pedido largo y apretá **Parar** a mitad → ¿corta limpio y se puede seguir escribiendo?

Mirá también: cuánto tarda el primer texto, si el estado «Trabajando…» se entiende, y **cuánto gastó** en la consola de Anthropic (el modelo por defecto es `claude-opus-5-5`, el más caro).

---

## C. Exportación y otro CAD (15 min)

1. En el visor, con la mesa: **Exportar → STEP → milímetros**. Guardá el archivo.
2. Abrilo en **FreeCAD** o Fusion. Tiene que cargar sin errores y medir **1200 × 700 × 740 mm** (con la tapa en 30 mm, las patas de 60 mm).
3. Volvé a exportar eligiendo **pulgadas**. Abrilo: tiene que cargar con la misma pieza y las mismas medidas (FreeCAD la muestra en mm igual; en Fusion mirá la unidad del documento). Si aparece 25,4 veces más grande o más chica, anotalo: es el error que queremos descartar.

---

## D. Segundo agente (20 min)

Repetí los casos 1, 2 y 4 con otro cliente (Cursor u otro que no sea el primero). Interesa si el comportamiento depende del cliente o de cómo está escrita la descripción de las tools.

---

## Tabla de resultados

Copiala y completala. «Intentos» = veces que llamó a `ejecutar_script` hasta llegar a una pieza válida.

| Caso | Agente | ¿Pasó? | Intentos | Qué hizo / qué faltó |
|---|---|---|---|---|
| 1 · Ambiguo | | | | |
| 2 · Imposible | | | | |
| 3a · Import prohibido | | | | |
| 3b · Fuera de rango | | | | |
| 4 · Cambiar parámetro | | | | |
| Extra · Renderizar | | | | |
| Chat (B) | | | | |
| STEP mm / pulgadas (C) | | | | |
| 2º agente (D) | | | | |

## Si algo sale mal

- **El visor dice «Sin agente conectado» con el cliente abierto:** reiniciá el cliente MCP; revisá que la ruta de `main.ts` sea la de tu carpeta.
- **El agente no ve `cambiar_parametros` o `renderizar` con imágenes:** el cliente quedó con la versión vieja del servidor; cerralo del todo y abrilo de nuevo.
- **El chat dice «Chat sin configurar»:** falta `ANTHROPIC_API_KEY` en `.env` o reiniciar `pnpm dev` después de ponerla.
- **Un error que no entendés:** copiá el texto completo que devolvió la tool (o el detalle en «Actividad del agente») y pasámelo.
- **Limpieza:** las piezas de prueba viven en `~/.furnus/proyectos/<id>/`; podés borrar las carpetas que no quieras.

## Cuándo se cierra la fase

Cuando los casos 1, 2, 3 y 4 pasan con un agente real y sin ayuda, el chat permite pedir una pieza y ajustarla con el panel, y el STEP abre bien en otro CAD. Lo que falle va al reporte como hallazgo, no como bloqueo: con eso decidimos qué ajustar en las descripciones, el prompt del chat o los mensajes de error antes de la fase 03.
