import { syncIncremental, getUnidadesExternas } from "./server/syncEngine";

async function main() {
  console.log("Buscando unidades externas...");
  const unidades = await getUnidadesExternas();
  console.log("Unidades:", unidades);

  for (const uid of unidades) {
    console.log(`\nSincronizando unidade ${uid}...`);
    const r = await syncIncremental(uid, (msg) => console.log(" ", msg));
    console.log("  Resultado:", JSON.stringify(r));
  }
  console.log("\n✓ Sincronização concluída!");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
