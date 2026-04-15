/**
 * trigger_sync.mjs
 * Dispara sincronização incremental manual para todas as unidades
 * chamando diretamente o syncEngine (sem depender de autenticação HTTP).
 */
import mysql from "mysql2/promise";
import { readFileSync } from "fs";

// Carregar .env
try {
  const env = readFileSync("/home/ubuntu/vip-suite/.env", "utf8");
  env.split("\n").forEach(line => {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  });
} catch {}

// Importar syncEngine compilado (TypeScript via tsx)
const { syncIncremental, getUnidadesExternas } = await import("./server/syncEngine.ts");

const inicio = Date.now();
console.log(`\n[${new Date().toLocaleString("pt-BR")}] Iniciando sincronização manual de todas as unidades...\n`);

const unidades = await getUnidadesExternas();
console.log(`Total de unidades: ${unidades.length}\n`);

let ok = 0, erros = 0;
for (const uid of unidades) {
  const t = Date.now();
  const result = await syncIncremental(uid, (msg) => process.stdout.write(`  ${msg}\n`));
  const elapsed = ((Date.now() - t) / 1000).toFixed(1);
  if (result.ok) {
    ok++;
    console.log(`✅ Unidade ${uid}: ${result.novas} vendas atualizadas (${elapsed}s)`);
  } else {
    erros++;
    console.log(`❌ Unidade ${uid}: ERRO (${elapsed}s)`);
  }
}

const totalSec = ((Date.now() - inicio) / 1000).toFixed(0);
console.log(`\n=== Sincronização concluída em ${totalSec}s ===`);
console.log(`✅ ${ok} unidades OK | ❌ ${erros} com erro`);
process.exit(0);
