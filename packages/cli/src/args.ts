export function leerArgs(argv: string[]): { comando: string | undefined; banderas: Set<string>; valores: Map<string, string> } {
  const banderas = new Set<string>();
  const valores = new Map<string, string>();
  let comando: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a.startsWith("--")) {
      const [k = "", v] = a.slice(2).split("=");
      if (v !== undefined) valores.set(k, v);
      else if (k === "solo" && argv[i + 1] && !argv[i + 1]!.startsWith("--")) valores.set(k, argv[++i]!);
      else banderas.add(k);
    } else if (!comando) comando = a;
  }
  return { comando, banderas, valores };
}
