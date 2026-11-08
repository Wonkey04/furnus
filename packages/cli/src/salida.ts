/** Dónde se escribe lo que ve la persona. Los tests juntan las líneas; el ejecutable las manda a la consola. */
export interface Salida {
  linea(texto: string): void;
}

export const salidaConsola: Salida = { linea: (t) => console.log(t) };

export function salidaEnMemoria(): Salida & { lineas: string[]; texto(): string } {
  const lineas: string[] = [];
  return { lineas, linea: (t) => void lineas.push(t), texto: () => lineas.join("\n") };
}
