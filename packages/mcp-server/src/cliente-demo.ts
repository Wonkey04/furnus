// Cliente MCP mínimo por stdio, con el mismo comando que muestra la pantalla «Conectar agente».
// Uso: tsx src/cliente-demo.ts <tool> '<json de argumentos>' | @archivo.json
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const [tool, crudo = "{}"] = process.argv.slice(2);
const args = JSON.parse(crudo.startsWith("@") ? readFileSync(crudo.slice(1), "utf8") : crudo) as Record<string, unknown>;
if (typeof args.script_archivo === "string") {
  args.script = readFileSync(args.script_archivo, "utf8");
  delete args.script_archivo;
}

const transporte = new StdioClientTransport({
  command: "node",
  args: ["--import", `file:///${raiz.replaceAll("\\", "/")}/node_modules/tsx/dist/esm/index.mjs`, `${raiz}/packages/mcp-server/src/main.ts`],
  env: { ...process.env } as Record<string, string>,
});
const cliente = new Client({ name: "demo-agente", version: "1" });
await cliente.connect(transporte);
if (tool === "listar") {
  console.log((await cliente.listTools()).tools.map((t) => t.name).join(", "));
} else {
  const r = (await cliente.callTool({ name: tool!, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  console.log(`isError=${r.isError === true}\n${r.content[0]!.text}`);
}
await cliente.close();
