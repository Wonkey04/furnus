# Producto

## En una frase

Furnus es un CAD paramétrico 3D en la web donde un agente de IA diseña piezas a partir de un pedido, y la persona las ve, las ajusta y las exporta.

## Objetivo general

Que diseñadores industriales, y más adelante arquitectos, diseñen con sus propios agentes de IA y de forma colaborativa, sin depender de Fusion ni de AutoCAD. El agente lo pone el usuario (Claude Desktop, Cursor o uno gratuito) con su propia cuenta. Furnus no vende un modelo.

## Para quién

Primer público: **diseñadores industriales que iteran mucho** sobre piezas sueltas (carcasas, soportes, botellas, perillas). El visor tiene que ser 3D desde el primer día. Un visor 2D no sirve para este público.

## Por qué ahora y por qué así

- Los agentes escriben muy bien código. Por eso el agente no llama decenas de tools: escribe un **script de build123d** y un sandbox lo ejecuta (enfoque tipo "Code Mode"). Gasta menos tokens y se corrige con el traceback.
- Los modelos fallan al "imaginar" geometría 3D. Se compensa con feedback: errores, medidas, validez de la geometría y capturas desde varios ángulos vuelven al agente después de cada ejecución.
- Una web permite que equipos y varios agentes trabajen sobre el mismo proyecto, algo que un MCP local de Fusion no ofrece.

## Qué debe validar el prototipo

**Una sola pregunta: ¿puede un agente diseñar una pieza 3D usable?** Se desglosa en cuatro hipótesis:

1. El agente **crea piezas** a través del MCP escribiendo scripts.
2. El agente **se corrige** con el feedback que recibe (traceback, medidas, validez, capturas).
3. La persona **ve y edita** la pieza en un visor 3D (orbitar, medir, cambiar parámetros).
4. La pieza **sale como un STEP válido** que abre en otro CAD.

**Criterio de éxito:** un prompt termina en un STEP válido, sin tocar código.

La hipótesis más riesgosa es la 2. Si el agente no se corrige solo, lo demás no alcanza.

## Qué queda afuera del prototipo

Login, cuentas, multiusuario, variantes y ramas, aprobación de cambios, ensamblajes, planos 2D, arquitectura (edificios), pagos. Todo eso está en `PHASES.md` para fases posteriores.

## Filosofía (resumen; el detalle está en `BRAND.md`)

1. La pieza es la protagonista.
2. Precisión silenciosa: las medidas siempre a la vista.
3. Persona y agente son pares: tocan el mismo script.
4. Honestidad geométrica: cada pieza dice si es válida.
5. Traé tu propio agente: la marca no se parece a ningún proveedor de IA.

## Glosario

- **Pieza:** el objeto 3D de un proyecto. En el prototipo hay una por proyecto.
- **Script:** código build123d con parámetros declarados. Es la fuente de verdad.
- **Revisión:** una versión guardada del script.
- **Parámetro:** una variable declarada en el script que la persona puede cambiar desde el visor sin pasar por el agente.
- **Selector semántico:** una forma de referirse a una parte de la pieza ("aristas superiores") que sobrevive a los cambios de geometría.
- **Sandbox:** el entorno aislado donde corre el script del agente.
- **Cota:** la línea de medida de un plano. Es el motivo gráfico técnico de la marca.
