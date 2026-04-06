/**
 * investigate_tempo_resgate.mjs
 * Joinville (id=29), período 1/abr/2025–31/mar/2026, janela 60d
 * Referência: Resgatados=80, Tempo Médio=109.1d
 *
 * Hipóteses para o tempo médio:
 * A) DATEDIFF(primeira_visita_no_período, última_visita_antes) — gap real (deu ~700-900d, errado)
 * B) DATEDIFF(primeira_visita_no_período, data_inicio) — dias desde o início do período
 * C) Média dos dias sem visita calculada pela cadência individual
 * D) Tempo médio = média dos gaps dos "Perdidos" (não dos resgatados)
 * E) DATEDIFF(última_visita_no_período, última_visita_antes) — gap até a última visita
 * F) Apenas o gap dos clientes que voltaram dentro da janela (gap <= janela*2)
 */
import { Client as SshClient } from "ssh2";
import mysql from "mysql2/promise";
import net from "net";
import dotenv from "dotenv";
dotenv.config();

const SSH_HOST = process.env.SSH_TUNNEL_HOST;
const SSH_PORT = parseInt(process.env.SSH_TUNNEL_PORT ?? "22");
const SSH_USER = process.env.SSH_TUNNEL_USER;
const SSH_PASS = process.env.SSH_TUNNEL_PASS;
const DB_USER = process.env.DB_EXT_USER;
const DB_PASS = process.env.DB_EXT_PASS;
const DB_NAME = process.env.DB_EXT_NAME;
const LOCAL_PORT = 13417;

const DATA_INICIO = "2025-04-01";
const DATA_FIM = "2026-03-31";
const EXT_ID = 29;
const JANELA = 60;
const JANELA_ENTRADA = 110;

async function createTunnel() {
  return new Promise((resolve, reject) => {
    const ssh = new SshClient();
    ssh.on("ready", () => {
      const server = net.createServer((sock) => {
        ssh.forwardOut("127.0.0.1", LOCAL_PORT, "127.0.0.1", 3306, (err, stream) => {
          if (err) { sock.destroy(); return; }
          sock.pipe(stream).pipe(sock);
        });
      });
      server.listen(LOCAL_PORT, "127.0.0.1", () => resolve({ ssh, server }));
    });
    ssh.on("error", reject);
    ssh.connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
  });
}

async function main() {
  let tunnel, pool;
  try {
    tunnel = await createTunnel();
    pool = await mysql.createPool({
      host: "127.0.0.1", port: LOCAL_PORT,
      user: DB_USER, password: DB_PASS, database: DB_NAME,
      waitForConnections: true, connectionLimit: 5,
    });
    const q = async (sql) => { const [rows] = await pool.query(sql); return rows; };

    console.log(`\n=== Investigando Tempo Médio de Resgate ===`);
    console.log(`Joinville (id=${EXT_ID}) | Ref: Resgatados=80, Tempo Médio=109.1d\n`);

    // Pré-computar dados
    const primeiraVisita = await q(`
      SELECT v.cliente, MIN(DATE(v.data_criacao)) as primeira_no_periodo
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND DATE(v.data_criacao) >= '${DATA_INICIO}'
        AND DATE(v.data_criacao) <= '${DATA_FIM}'
        AND v.comanda_temp = 0 AND v.status != 0
        AND v.cliente IS NOT NULL AND v.cliente != 2
      GROUP BY v.cliente
    `);
    const mapPrimeiraVisita = new Map(primeiraVisita.map(r => [r.cliente, r.primeira_no_periodo]));

    const ultimaNoPeriodo = await q(`
      SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_no_periodo
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND DATE(v.data_criacao) >= '${DATA_INICIO}'
        AND DATE(v.data_criacao) <= '${DATA_FIM}'
        AND v.comanda_temp = 0 AND v.status != 0
        AND v.cliente IS NOT NULL AND v.cliente != 2
      GROUP BY v.cliente
    `);
    const mapUltimaNoPeriodo = new Map(ultimaNoPeriodo.map(r => [r.cliente, r.ultima_no_periodo]));

    const ultimaAntes = await q(`
      SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_antes
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND DATE(v.data_criacao) < '${DATA_INICIO}'
        AND v.comanda_temp = 0 AND v.status != 0
        AND v.cliente IS NOT NULL AND v.cliente != 2
      GROUP BY v.cliente
    `);
    const mapUltimaAntes = new Map(ultimaAntes.map(r => [r.cliente, r.ultima_antes]));

    // Identificar resgatados: base ativa (45d antes FIM) + ausência >110d antes início
    const dataFim45 = new Date(new Date(DATA_FIM + "T12:00:00Z").getTime() - 45 * 86400000).toISOString().slice(0, 10);
    const dataAntes110 = new Date(new Date(DATA_INICIO + "T12:00:00Z").getTime() - JANELA_ENTRADA * 86400000).toISOString().slice(0, 10);

    const resgatados = [];
    for (const [cliente, primeiraNoP] of mapPrimeiraVisita) {
      const ultimaAntesDate = mapUltimaAntes.get(cliente);
      if (!ultimaAntesDate) continue;
      const ultimaNoP = mapUltimaNoPeriodo.get(cliente);
      if (!ultimaNoP) continue;
      // Ausência > 110d antes do início
      if (new Date(ultimaAntesDate) >= new Date(dataAntes110)) continue;
      // Base ativa (última visita no período >= 45d antes do FIM)
      if (new Date(ultimaNoP) < new Date(dataFim45)) continue;
      
      const gapReal = Math.round((new Date(primeiraNoP) - new Date(ultimaAntesDate)) / 86400000);
      const gapDesdeInicio = Math.round((new Date(primeiraNoP) - new Date(DATA_INICIO)) / 86400000);
      const gapUltimaNoP = Math.round((new Date(ultimaNoP) - new Date(ultimaAntesDate)) / 86400000);
      const gapAteDataFim = Math.round((new Date(DATA_FIM) - new Date(ultimaAntesDate)) / 86400000);
      
      resgatados.push({
        cliente,
        primeiraNoP,
        ultimaNoP,
        ultimaAntesDate,
        gapReal,
        gapDesdeInicio,
        gapUltimaNoP,
        gapAteDataFim,
      });
    }

    console.log(`Resgatados identificados: ${resgatados.length} (ref: 80)\n`);

    // Calcular médias de diferentes formas
    const avg = arr => arr.reduce((s, v) => s + v, 0) / arr.length;

    const tmA = avg(resgatados.map(r => r.gapReal));
    const tmB = avg(resgatados.map(r => r.gapDesdeInicio));
    const tmC = avg(resgatados.map(r => r.gapUltimaNoP));
    const tmD = avg(resgatados.map(r => r.gapAteDataFim));

    console.log(`[A] DATEDIFF(primeira_no_periodo, ultima_antes): ${tmA.toFixed(1)}d`);
    console.log(`[B] DATEDIFF(primeira_no_periodo, data_inicio): ${tmB.toFixed(1)}d`);
    console.log(`[C] DATEDIFF(ultima_no_periodo, ultima_antes): ${tmC.toFixed(1)}d`);
    console.log(`[D] DATEDIFF(data_fim, ultima_antes): ${tmD.toFixed(1)}d`);
    console.log(`Referência: 109.1d\n`);

    // Hipótese E: Tempo médio dos PERDIDOS (não dos resgatados)
    // Perdidos = vieram nos 110d antes do início mas não voltaram no período
    const perdidos = [];
    for (const [cliente, ultimaAntesDate] of mapUltimaAntes) {
      if (new Date(ultimaAntesDate) < new Date(dataAntes110)) continue; // não estava nos 110d
      if (mapPrimeiraVisita.has(cliente)) continue; // voltou no período, não é perdido
      const gapAteFim = Math.round((new Date(DATA_FIM) - new Date(ultimaAntesDate)) / 86400000);
      const gapAteHoje = Math.round((new Date() - new Date(ultimaAntesDate)) / 86400000);
      perdidos.push({ cliente, ultimaAntesDate, gapAteFim, gapAteHoje });
    }
    console.log(`Perdidos: ${perdidos.length} (ref: 249)`);
    if (perdidos.length > 0) {
      const tmPerdAteFim = avg(perdidos.map(r => r.gapAteFim));
      const tmPerdAteHoje = avg(perdidos.map(r => r.gapAteHoje));
      console.log(`[E] Tempo médio dos PERDIDOS (até data_fim): ${tmPerdAteFim.toFixed(1)}d`);
      console.log(`[F] Tempo médio dos PERDIDOS (até hoje): ${tmPerdAteHoje.toFixed(1)}d`);
    }

    // Hipótese G: Tempo médio de resgate = média dos gaps dos resgatados mas limitado a janela*N
    for (const mult of [1, 1.5, 2, 2.5, 3]) {
      const limite = JANELA * mult;
      const filtrados = resgatados.filter(r => r.gapReal <= limite);
      if (filtrados.length > 0) {
        const tm = avg(filtrados.map(r => r.gapReal));
        console.log(`[G-${mult}x] Gap real <= ${limite}d: n=${filtrados.length}, tempo=${tm.toFixed(1)}d`);
      }
    }

    // Hipótese H: Tempo médio = média dos dias desde a última visita até a PRIMEIRA visita no período
    // mas usando apenas os primeiros N resgatados (ordenados por data)
    const sorted = [...resgatados].sort((a, b) => new Date(a.primeiraNoP) - new Date(b.primeiraNoP));
    for (const n of [50, 60, 70, 80, 90, 100]) {
      const slice = sorted.slice(0, n);
      const tm = avg(slice.map(r => r.gapReal));
      console.log(`[H-${n}] Primeiros ${n} resgatados (por data): tempo_medio=${tm.toFixed(1)}d`);
    }

    // Hipótese I: O "tempo médio" é calculado sobre os perdidos que NÃO voltaram
    // como DATEDIFF(data_fim, ultima_visita) para medir quanto tempo estão ausentes
    const tmPerdidosAbsencia = perdidos.length > 0
      ? avg(perdidos.map(r => r.gapAteFim))
      : 0;
    console.log(`\n[I] Tempo médio de AUSÊNCIA dos perdidos (até data_fim): ${tmPerdidosAbsencia.toFixed(1)}d`);

    // Mostrar distribuição dos gaps dos resgatados
    console.log("\n=== Distribuição dos gaps dos resgatados ===");
    const buckets = [0, 60, 90, 120, 150, 180, 240, 300, 365, 500, 1000, Infinity];
    for (let i = 0; i < buckets.length - 1; i++) {
      const count = resgatados.filter(r => r.gapReal >= buckets[i] && r.gapReal < buckets[i+1]).length;
      console.log(`  ${buckets[i]}-${buckets[i+1]}d: ${count} clientes`);
    }

    // Mostrar os primeiros 20 resgatados para inspeção
    console.log("\n=== Primeiros 20 resgatados (ordenados por gap) ===");
    const sortedByGap = [...resgatados].sort((a, b) => a.gapReal - b.gapReal);
    for (const r of sortedByGap.slice(0, 20)) {
      console.log(`  cliente=${r.cliente} ultima_antes=${r.ultimaAntesDate} primeira_no_periodo=${r.primeiraNoP} gap=${r.gapReal}d`);
    }

  } catch (err) {
    console.error("ERRO:", err.message);
    console.error(err.stack);
  } finally {
    if (pool) await pool.end();
    if (tunnel) { tunnel.server.close(); tunnel.ssh.destroy(); }
    process.exit(0);
  }
}

main();
