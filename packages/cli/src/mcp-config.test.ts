import { describe, expect, it } from "vitest";
import { ConfigInvalida, fusionar, type EntradaMcp } from "./mcp-config.js";

const entrada: EntradaMcp = { type: "stdio", command: "/usr/bin/node", args: ["/f/mcp.mjs"] };

describe("fusionar", () => {
  it("crea el archivo desde cero", () => {
    const f = fusionar(null, entrada);
    expect(f.estado).toBe("creado");
    expect(JSON.parse(f.texto)).toEqual({ mcpServers: { furnus: entrada } });
    expect(f.texto.endsWith("\n")).toBe(true);
  });

  it("no pisa otros servidores ni otras claves, y respeta el orden y la sangría", () => {
    const original = `{\n    "theme": "dark",\n    "mcpServers": {\n        "otro": { "command": "x", "args": [] }\n    },\n    "final": 1\n}`;
    const f = fusionar(original, entrada);
    const j = JSON.parse(f.texto) as Record<string, unknown>;
    expect(Object.keys(j)).toEqual(["theme", "mcpServers", "final"]);
    expect(Object.keys(j.mcpServers as object)).toEqual(["otro", "furnus"]);
    expect((j.mcpServers as Record<string, unknown>).otro).toEqual({ command: "x", args: [] });
    expect(f.texto).toContain('\n    "theme"'); // sangría de 4 espacios
    expect(f.texto.endsWith("\n")).toBe(false); // el original no terminaba en salto
    expect(f.cambios.join("\n")).toContain("otro");
  });

  it("es idempotente: si ya está igual, no hay cambios", () => {
    const una = fusionar("{}", entrada);
    const dos = fusionar(una.texto, entrada);
    expect(dos.estado).toBe("sin_cambios");
    expect(dos.cambios).toEqual([]);
  });

  it("actualiza solo la entrada de furnus y cuenta qué cambió", () => {
    const viejo = JSON.stringify({ mcpServers: { furnus: { command: "node", args: ["/viejo.mjs"] }, b: { command: "b" } } });
    const f = fusionar(viejo, entrada);
    expect(f.estado).toBe("actualizado");
    expect(f.cambios.join("\n")).toMatch(/comando: node → \/usr\/bin\/node/);
    expect(f.cambios.join("\n")).toMatch(/argumentos/);
    expect((JSON.parse(f.texto) as { mcpServers: { b: unknown } }).mcpServers.b).toEqual({ command: "b" });
  });

  it("acepta un archivo vacío y un BOM", () => {
    expect(fusionar("", entrada).estado).toBe("creado");
    expect(fusionar("﻿{}", entrada).estado).toBe("creado");
  });

  it("rechaza JSON roto sin devolver texto para escribir", () => {
    expect(() => fusionar('{ "mcpServers": ', entrada)).toThrow(ConfigInvalida);
    expect(() => fusionar("[]", entrada)).toThrow(ConfigInvalida);
    expect(() => fusionar('{"mcpServers": []}', entrada)).toThrow(/mcpServers/);
  });
});
