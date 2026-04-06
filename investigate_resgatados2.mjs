/**
 * investigate_resgatados2.mjs - versão eficiente com JOINs
 * Joinville (id=29), período 1/abr/2025–31/mar/2026, janela 60d
 * Referência: Resgatados=80, Tempo Médio=109.1d
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
const LOCAL_PORT = 13416;

const DATA_INICIO = "2025-04-01";
const DATA_FIM = "2026-03-31";
const EXT_ID = 29;
const JANELA = 60;

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

    console.log(`\n=== Joinville (id=${EXT_ID}) | Ref: Resgatados=80, Tempo Médio=109.1d ===\n`);

    // Pré-computar: primeira visita de cada cliente no período
    console.log("Calculando primeira visita no período...");
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
    console.log(`  Clientes no período: ${primeiraVisita.length}`);

    // Pré-computar: última visita de cada cliente ANTES do período
    console.log("Calculando última visita antes do período...");
    const ultimaAntes = await q(`
      SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_antes
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND DATE(v.data_criacao) < '${DATA_INICIO}'
        AND v.comanda_temp = 0 AND v.status != 0
        AND v.cliente IS NOT NULL AND v.cliente != 2
      GROUP BY v.cliente
    `);
    console.log(`  Clientes com histórico anterior: ${ultimaAntes.length}`);

    // Mapear para lookup rápido
    const mapUltimaAntes = new Map();
    for (const row of ultimaAntes) {
      mapUltimaAntes.set(row.cliente, row.ultima_antes);
    }

    // Calcular gap para cada cliente do período
    const clientes = [];
    for (const row of primeiraVisita) {
      const ultimaAntesDate = mapUltimaAntes.get(row.cliente);
      if (!ultimaAntesDate) continue; // cliente novo, sem histórico
      const gap = Math.round((new Date(row.primeira_no_periodo) - new Date(ultimaAntesDate)) / 86400000);
      clientes.push({ cliente: row.cliente, gap, ultimaAntes: ultimaAntesDate });
    }
    console.log(`  Clientes com histórico anterior que vieram no período: ${clientes.length}\n`);

    // Testar diferentes thresholds de gap
    console.log("=== Testando thresholds de gap ===");
    for (const threshold of [60, 75, 90, 100, 110, 120, 150, 180, 200, 250, 300]) {
      const filtrados = clientes.filter(c => c.gap > threshold);
      const tempoMedio = filtrados.length > 0
        ? filtrados.reduce((s, c) => s + c.gap, 0) / filtrados.length
        : 0;
      const matchN = Math.abs(filtrados.length - 80) <= 10 ? " ← PRÓXIMO!" : "";
      const matchT = Math.abs(tempoMedio - 109.1) <= 15 ? " ← TEMPO PRÓXIMO!" : "";
      console.log(`  Gap > ${threshold}d: n=${filtrados.length}, tempo_medio=${tempoMedio.toFixed(1)}d${matchN}${matchT}`);
    }

    // Hipótese especial: gap calculado como DATEDIFF(primeira_no_periodo, ultima_antes)
    // mas usando apenas clientes que não vieram nos X dias antes do início
    console.log("\n=== Testando: ausência nos X dias antes do início ===");
    for (const diasAusencia of [60, 75, 90, 100, 110, 120, 150, 180]) {
      const dataCorte = new Date(new Date(DATA_INICIO + "T12:00:00Z").getTime() - diasAusencia * 86400000).toISOString().slice(0, 10);
      const filtrados = clientes.filter(c => {
        // Não veio nos diasAusencia antes do início
        return new Date(c.ultimaAntes) < new Date(dataCorte);
      });
      const tempoMedio = filtrados.length > 0
        ? filtrados.reduce((s, c) => s + c.gap, 0) / filtrados.length
        : 0;
      const matchN = Math.abs(filtrados.length - 80) <= 10 ? " ← PRÓXIMO!" : "";
      const matchT = Math.abs(tempoMedio - 109.1) <= 15 ? " ← TEMPO PRÓXIMO!" : "";
      console.log(`  Ausência > ${diasAusencia}d antes do início (corte: ${dataCorte}): n=${filtrados.length}, tempo=${tempoMedio.toFixed(1)}d${matchN}${matchT}`);
    }

    // Hipótese: Resgatados = clientes que estavam na lista de "Perdidos" (janelaEntrada=110d)
    // e voltaram no período atual
    console.log("\n=== Hipótese: Resgatados = Perdidos do período anterior que voltaram ===");
    // Perdidos do período anterior: vieram nos 110d antes de 2025-04-01 mas não no período anterior
    const DATA_INICIO_ANT = "2024-04-01";
    const DATA_FIM_ANT = "2025-03-31";
    const JANELA_ENTRADA = Math.round(JANELA * 1.833);
    const dataAntes110_ant = new Date(new Date(DATA_INICIO_ANT + "T12:00:00Z").getTime() - JANELA_ENTRADA * 86400000).toISOString().slice(0, 10);
    const dataAntes110_cur = new Date(new Date(DATA_INICIO + "T12:00:00Z").getTime() - JANELA_ENTRADA * 86400000).toISOString().slice(0, 10);

    // Clientes que vieram nos 110d antes do início do período ATUAL mas não no período atual
    // = os "Perdidos" que calculamos antes
    const perdidosAtuais = await q(`
      SELECT DISTINCT v.cliente
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND DATE(v.data_criacao) >= '${dataAntes110_cur}'
        AND DATE(v.data_criacao) < '${DATA_INICIO}'
        AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
    `);
    const setPerdidosAtuais = new Set(perdidosAtuais.map(r => r.cliente));
    console.log(`  Perdidos (vieram nos ${JANELA_ENTRADA}d antes do início): ${setPerdidosAtuais.size}`);

    // Clientes que vieram no período ANTERIOR
    const vieramPeriodoAnt = await q(`
      SELECT DISTINCT v.cliente
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND DATE(v.data_criacao) >= '${DATA_INICIO_ANT}'
        AND DATE(v.data_criacao) <= '${DATA_FIM_ANT}'
        AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
    `);
    const setVieramAnt = new Set(vieramPeriodoAnt.map(r => r.cliente));

    // Clientes que vieram no período ATUAL
    const vieramPeriodoAtual = new Set(primeiraVisita.map(r => r.cliente));

    // Resgatados = perdidos do período anterior que voltaram no atual
    const perdidosAnteriores = [...setVieramAnt].filter(c => {
      const ultimaAntesDate = mapUltimaAntes.get(c);
      if (!ultimaAntesDate) return false;
      // Não vieram nos 110d antes do início do período atual
      return new Date(ultimaAntesDate) < new Date(dataAntes110_cur);
    });
    const resgatadosDoAnt = perdidosAnteriores.filter(c => vieramPeriodoAtual.has(c));
    const gapsDoAnt = resgatadosDoAnt.map(c => {
      const pv = primeiraVisita.find(r => r.cliente === c);
      const ua = mapUltimaAntes.get(c);
      return Math.round((new Date(pv.primeira_no_periodo) - new Date(ua)) / 86400000);
    });
    const tempoMedioAnt = gapsDoAnt.length > 0 ? gapsDoAnt.reduce((s, g) => s + g, 0) / gapsDoAnt.length : 0;
    console.log(`  Perdidos do período anterior que voltaram no atual: n=${resgatadosDoAnt.length}, tempo=${tempoMedioAnt.toFixed(1)}d`);

    // Hipótese final: Resgatados = clientes da base ativa (60d antes do FIM) 
    // que não vieram nos 110d antes do início
    const baseAtiva60 = clientes.filter(c => {
      // Vieram nos 60d antes do FIM
      const pv = primeiraVisita.find(r => r.cliente === c.cliente);
      if (!pv) return false;
      // Verificar se vieram nos 60d antes do FIM
      return true; // simplificado - precisaria da última visita no período
    });

    // Calcular última visita no período para cada cliente
    console.log("\nCalculando última visita no período...");
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

    // Resgatados = clientes que:
    // 1. Vieram no período (têm última visita no período)
    // 2. Não vieram nos 110d antes do início (última antes < dataAntes110_cur)
    // 3. Têm histórico anterior (última antes existe)
    // 4. Última visita no período está nos 60d antes do FIM (são "base ativa")
    const dataFim60 = new Date(new Date(DATA_FIM + "T12:00:00Z").getTime() - JANELA * 86400000).toISOString().slice(0, 10);
    const resgatadosBaseAtiva = clientes.filter(c => {
      const ultimaAntesDate = c.ultimaAntes;
      const ultimaNoP = mapUltimaNoPeriodo.get(c.cliente);
      if (!ultimaNoP) return false;
      // Não veio nos 110d antes do início
      if (new Date(ultimaAntesDate) >= new Date(dataAntes110_cur)) return false;
      // Última visita no período está nos 60d antes do FIM (base ativa)
      return new Date(ultimaNoP) >= new Date(dataFim60);
    });
    const tempoMedioBA = resgatadosBaseAtiva.length > 0
      ? resgatadosBaseAtiva.reduce((s, c) => s + c.gap, 0) / resgatadosBaseAtiva.length
      : 0;
    console.log(`\n=== Hipótese Final ===`);
    console.log(`  Resgatados = base ativa (60d antes FIM) + ausência >${JANELA_ENTRADA}d antes do início:`);
    console.log(`  n=${resgatadosBaseAtiva.length}, tempo=${tempoMedioBA.toFixed(1)}d`);
    console.log(`  Referência: n=80, tempo=109.1d`);

    // Testar combinações: base ativa (X dias antes FIM) + ausência (Y dias antes início)
    console.log("\n=== Combinações Base Ativa × Ausência ===");
    for (const xDias of [30, 45, 60, 75, 90]) {
      const dataFimX = new Date(new Date(DATA_FIM + "T12:00:00Z").getTime() - xDias * 86400000).toISOString().slice(0, 10);
      for (const yDias of [60, 75, 90, 100, 110, 120, 150]) {
        const dataCorteY = new Date(new Date(DATA_INICIO + "T12:00:00Z").getTime() - yDias * 86400000).toISOString().slice(0, 10);
        const res = clientes.filter(c => {
          const ultimaNoP = mapUltimaNoPeriodo.get(c.cliente);
          if (!ultimaNoP) return false;
          if (new Date(c.ultimaAntes) >= new Date(dataCorteY)) return false;
          return new Date(ultimaNoP) >= new Date(dataFimX);
        });
        const tm = res.length > 0 ? res.reduce((s, c) => s + c.gap, 0) / res.length : 0;
        const matchN = Math.abs(res.length - 80) <= 5 ? " ← N PRÓXIMO!" : "";
        const matchT = Math.abs(tm - 109.1) <= 10 ? " ← T PRÓXIMO!" : "";
        if (matchN || matchT) {
          console.log(`  BaseAtiva(${xDias}d) × Ausência(${yDias}d): n=${res.length}, tempo=${tm.toFixed(1)}d${matchN}${matchT}`);
        }
      }
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
