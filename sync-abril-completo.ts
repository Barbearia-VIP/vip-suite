/**
 * sync-abril-completo.ts
 * Sincronização completa de abril/2026 para todas as unidades.
 * Usa importHistorico() que já sincroniza por blocos mensais.
 * Executa uma unidade por vez para não sobrecarregar o banco externo.
 */
import * as mysql from "mysql2/promise";
import { importHistorico } from "./server/syncEngine";

async function getUnidades(): Promise<{ extId: number; name: string }[]> {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute(
    "SELECT externalId AS extId, name FROM units WHERE externalId IS NOT NULL ORDER BY externalId"
  );
  await conn.end();
  return rows as { extId: number; name: string }[];
}

async function main() {
  console.log("=".repeat(60));
  console.log("SINCRONIZAÇÃO COMPLETA DE ABRIL/2026");
  console.log(`Iniciado em: ${new Date().toLocaleString("pt-BR")}`);
  console.log("=".repeat(60));

  const unidades = await getUnidades();
  console.log(`\nTotal de unidades: ${unidades.length}\n`);

  let ok = 0;
  let erros = 0;

  for (let i = 0; i < unidades.length; i++) {
    const u = unidades[i];
    console.log(`\n[${i + 1}/${unidades.length}] ${u.name} (extId=${u.extId})`);
    try {
      const result = await importHistorico(Number(u.extId), (msg) => {
        // Filtrar apenas mensagens de abril para não poluir o log
        if (msg.includes("2026-04") || msg.includes("Erro") || msg.includes("ERRO") || msg.includes("concluída")) {
          console.log("  " + msg);
        }
      });
      if (result.ok) {
        console.log(`  ✓ OK — ${result.totalVendas} vendas | ${result.totalVp} itens | ${result.totalClientes} clientes`);
        ok++;
      } else {
        console.log(`  ✗ Falhou`);
        erros++;
      }
    } catch (err) {
      console.error(`  ✗ Exceção:`, err instanceof Error ? err.message : err);
      erros++;
    }
    // Pausa entre unidades para não sobrecarregar o banco externo
    if (i < unidades.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`CONCLUÍDO em: ${new Date().toLocaleString("pt-BR")}`);
  console.log(`✓ ${ok} unidades sincronizadas com sucesso`);
  if (erros > 0) console.log(`✗ ${erros} unidades com erro`);
  console.log("=".repeat(60));
  process.exit(0);
}

main().catch(err => {
  console.error("ERRO FATAL:", err);
  process.exit(1);
});
