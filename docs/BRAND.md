# Marca y sistema de diseño

## Nombre

**Furnus.** Viene del latín *furnus* (horno) y del género del hornero, *Furnarius*, el ave nacional argentina. El hornero construye con barro, y con mucha precisión, una casa en forma de horno. Es lo que hace el producto: construir una pieza con exactitud. Dominio: furnus.dev.

El nombre se escribe siempre «Furnus». El producto no tiene un asistente propio: el agente es el del usuario.

## Filosofía

1. **La pieza es la protagonista.** La interfaz se vuelve vidrio y se corre del medio.
2. **Precisión silenciosa.** Las medidas siempre a la vista, en tipografía monoespaciada. Nunca se redondea ni se esconde un número.
3. **Persona y agente son pares.** Los dos tocan el mismo script; lo que hace el agente se muestra igual que lo que hace la persona.
4. **Honestidad geométrica.** Cada pieza dice si es válida. Un error se muestra completo.
5. **Traé tu propio agente.** La marca no se parece a ningún proveedor de IA: sin brillos, chispas ni robots.

## Voz

- Español rioplatense con *vos*. Frases cortas, verbos concretos: «Exportar», «Conectar agente», «Probar conexión».
- Se dice «pieza», no «modelo» ni «asset».
- Los errores explican qué falló y cómo seguir: «La pared supera el espesor disponible.»
- Sin signos de exclamación, sin emoji, sin promesas («revolucionario», «mágico»).

## Estilo visual

**Blanco y negro, de verdad.** Todo es una escala de grises. No hay color de marca ni de estado. El estado se comunica con forma y texto: punto lleno, contorno punteado, etiqueta invertida.

**Vidrio esmerilado, entre Apple y Notion.** Paneles que flotan sobre un fondo gris claro con manchas de luz difusas. Cada panel: relleno translúcido, `backdrop-filter: blur(24px) saturate(150%)`, borde de 1px y un brillo interno superior.

**Tipografía.** Inter para la interfaz (títulos en 700 con espaciado −0.03em). IBM Plex Mono para medidas, parámetros, nombres de función, código y etiquetas de panel en mayúsculas.

**Forma.** Radios: 18px paneles, 22px diálogos, 12px botones, 8px inputs, píldora en chips. Objetivos táctiles de 44px mínimo.

**Logo.** Una cúpula en trazo fino (el nido del hornero) con entrada en arco y una línea de base, seguida del nombre en Inter 600. Siempre en el color de tinta, nunca rellena.

**La cota** (línea de medida con extremos en T y la medida en mono) es el motivo gráfico técnico. Aparece sobre la pieza en el visor y en los chips de dimensiones. Siempre mide algo real.

**La pieza** siempre en isométrico, con tres grises fijos por cara (arriba el más claro, izquierda intermedio, derecha el más oscuro) y aristas en el color de tinta. La arista seleccionada se engrosa; no cambia de color.

**Iconos:** de trazo, 1.6px, extremos redondeados, 16 a 20px. Nunca rellenos.

## Tokens

Definir como variables CSS con dos temas (claro por defecto, oscuro con `prefers-color-scheme` y `[data-theme]`).

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--ground` | #ececee | #0b0b0c | Fondo de la app |
| `--blob` | #ffffff | #2a2a2e | Manchas de luz detrás del vidrio |
| `--glass-fill` | rgba(255,255,255,0.62) | rgba(36,36,40,0.55) | Relleno del vidrio |
| `--glass-border` | rgba(0,0,0,0.08) | rgba(255,255,255,0.12) | Borde del vidrio |
| `--glass-highlight` | rgba(255,255,255,0.9) | rgba(255,255,255,0.08) | Brillo interno superior |
| `--ink` | #111111 | #f5f5f6 | Texto principal, aristas, logo |
| `--ink-2` | #555555 | #b8b8bd | Texto secundario |
| `--ink-3` | #626262 | #9a9aa0 | Etiquetas y ayudas (mín. 12px) |
| `--line` | rgba(0,0,0,0.12) | rgba(255,255,255,0.16) | Bordes de controles, cotas |
| `--fill-soft` | rgba(0,0,0,0.05) | rgba(255,255,255,0.08) | Botones secundarios, inputs, chips |
| `--action` | #111111 | #f5f5f6 | Botón primario y etiqueta de error |
| `--on-action` | #ffffff | #111111 | Texto sobre `--action` |
| `--piece-light` | #ffffff | #e4e4e7 | Cara superior de la pieza |
| `--piece-mid` | #bdbdbd | #8a8a8f | Cara izquierda |
| `--piece-dark` | #8e8e8e | #55555a | Cara derecha |

Espaciado: 4, 8, 12, 16, 24, 32, 48 px. Sombras: `--shadow-glass: 0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)` (claro); `--shadow-float` para diálogos; `--shadow-button` para el botón primario.

Fondo de pantalla: `--ground` con dos o tres `radial-gradient` de `--blob` difusos.

## Estados (sin color)

- Activo / válido: punto lleno en tinta con halo suave.
- Inactivo / sin conexión: punto en `--ink-3`.
- En curso («Corrigiendo»): contorno punteado y punto hueco.
- Error: etiqueta invertida (`--action` sobre `--on-action`). Es la única inversión de la interfaz; la explicación va debajo en texto secundario.

## Botones

- Primario: `--action`, texto `--on-action`, `--shadow-button`, radio 12px, alto 48px. Uno solo por vista.
- Secundario: `--fill-soft`, borde `--line`, alto 44px.
- Enlace: texto `--ink-2`, alto táctil 44px.
- Deshabilitado: borde punteado y texto `--ink-3`.
- Foco: contorno de 2px en `--ink` con 2px de separación.

## Qué no hacer

Agregar un color de acento, usar degradados de color, usar emoji, apilar más de dos paneles de vidrio, o distinguir un estado solo por color.

## Fuente de verdad visual

El sistema de diseño completo (tokens, componentes con vista previa y portada) está publicado en el artefacto «Furnus» de Matías. Si hay diferencias con este documento, avisá y se actualiza uno de los dos.
