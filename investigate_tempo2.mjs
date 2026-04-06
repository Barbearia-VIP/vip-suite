/**
 * investigate_tempo2.mjs
 * Hipótese: Tempo Médio de Resgate = média de DATEDIFF(data_fim, ultima_visita)
 * para os PERDIDOS (dentro da janela de entrada)
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
const LOCAL_PORT = 13418;

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

    console.log(`\n=== Investigando Tempo Médio de Resgate = 109.1d ===\n`);

    const dataAntes110 = new Date(new Date(DATA_INICIO + "T12:00:00Z").getTime() - JANELA_ENTRADA * 86400000).toISOString().slice(0, 10);

    // Perdidos: vieram nos 110d antes do início mas não voltaram no período
    const perdidos = await q(`
      SELECT sub.cliente, sub.ultima_antes,
        DATEDIFF('${DATA_FIM}', sub.ultima_antes) as dias_ate_fim,
        DATEDIFF(NOW(), sub.ultima_antes) as dias_ate_hoje,
        DATEDIFF('${DATA_INICIO}', sub.ultima_antes) as dias_ate_inicio
      FROM (
        SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_antes
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '${dataAntes110}'
          AND DATE(v.data_criacao) < '${DATA_INICIO}'
          AND v.comanda_temp = 0 AND v.status != 0
          AND v.cliente IS NOT NULL AND v.cliente != 2
        GROUP BY v.cliente
      ) sub
      WHERE NOT EXISTS (
        SELECT 1 FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
        WHERE uu2.unidade = ${EXT_ID} AND v2.cliente = sub.cliente
          AND DATE(v2.data_criacao) >= '${DATA_INICIO}'
          AND DATE(v2.data_criacao) <= '${DATA_FIM}'
          AND v2.comanda_temp = 0 AND v2.status != 0
      )
    `);

    console.log(`Perdidos: ${perdidos.length} (ref: 249)`);
    
    const avg = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
    
    const diasAteFim = perdidos.map(r => Number(r.dias_ate_fim));
    const diasAteHoje = perdidos.map(r => Number(r.dias_ate_hoje));
    const diasAteInicio = perdidos.map(r => Number(r.dias_ate_inicio));
    
    console.log(`[1] Média DATEDIFF(data_fim, ultima_antes): ${avg(diasAteFim).toFixed(1)}d`);
    console.log(`[2] Média DATEDIFF(NOW(), ultima_antes): ${avg(diasAteHoje).toFixed(1)}d`);
    console.log(`[3] Média DATEDIFF(data_inicio, ultima_antes): ${avg(diasAteInicio).toFixed(1)}d`);
    console.log(`Referência: 109.1d\n`);
    
    // Distribuição dos dias_ate_inicio dos perdidos
    console.log("=== Distribuição de dias_ate_inicio dos perdidos ===");
    const buckets = [0, 30, 60, 75, 90, 100, 110, 120, 150, 180, Infinity];
    for (let i = 0; i < buckets.length - 1; i++) {
      const count = diasAteInicio.filter(d => d >= buckets[i] && d < buckets[i+1]).length;
      console.log(`  ${buckets[i]}-${buckets[i+1]}d: ${count} clientes`);
    }
    
    // Média de dias_ate_inicio (= quantos dias antes do início foi a última visita)
    console.log(`\nMédia de dias_ate_inicio: ${avg(diasAteInicio).toFixed(1)}d`);
    console.log(`Mediana de dias_ate_inicio: ${diasAteInicio.sort((a,b)=>a-b)[Math.floor(diasAteInicio.length/2)]}d`);
    
    // Hipótese: Tempo Médio = média dos dias_ate_inicio dos perdidos
    // (quanto tempo em média eles estão ausentes desde a última visita até o início do período)
    // Isso seria ~110d se a maioria veio logo antes do corte de 110d
    
    // Verificar: qual é a distribuição da última visita dos perdidos?
    const ultimasAntes = perdidos.map(r => r.ultima_antes.toISOString ? r.ultima_antes.toISOString().slice(0, 10) : String(r.ultima_antes).slice(0, 10));
    const contPorMes = {};
    for (const d of ultimasAntes) {
      const mes = d.slice(0, 7);
      contPorMes[mes] = (contPorMes[mes] || 0) + 1;
    }
    console.log("\n=== Distribuição por mês da última visita dos perdidos ===");
    for (const [mes, count] of Object.entries(contPorMes).sort()) {
      console.log(`  ${mes}: ${count} clientes`);
    }
    
    // Hipótese: Tempo Médio de Resgate = DATEDIFF(data_inicio, ultima_visita_antes)
    // = quanto tempo faz que o cliente perdido não vem desde o início do período
    // Para os perdidos que vieram nos 110d antes do início:
    // - Mínimo: 1d (veio no dia anterior ao início)
    // - Máximo: 110d (veio exatamente no limite)
    // - Média esperada: ~55d (distribuição uniforme)
    // Mas a referência é 109.1d, então deve ser algo diferente
    
    // Hipótese alternativa: Tempo Médio = DATEDIFF(data_fim, ultima_visita_antes)
    // Para perdidos que vieram nos 110d antes do início:
    // - data_fim = 2026-03-31
    // - ultima_antes está entre 2024-12-12 e 2025-03-31
    // - DATEDIFF = 365+110 a 365+0 = 365 a 475d
    // Isso não bate com 109.1d
    
    // Hipótese: O "Tempo Médio de Resgate" é calculado sobre os RESGATADOS
    // mas usando a cadência individual de cada cliente
    // Cadência = intervalo médio entre visitas
    // Tempo de resgate = gap / cadência (em múltiplos da cadência)
    
    // Hipótese: Tempo Médio = média dos gaps dos perdidos calculado como
    // DATEDIFF(data_fim, ultima_visita) - JANELA_ENTRADA
    const diasExcesso = diasAteFim.map(d => d - JANELA_ENTRADA);
    console.log(`\n[4] Média (dias_ate_fim - ${JANELA_ENTRADA}): ${avg(diasExcesso).toFixed(1)}d`);
    
    // Hipótese: Tempo Médio = DATEDIFF(data_inicio, ultima_visita) para perdidos
    // = quantos dias antes do início foi a última visita
    // Já calculado: avg(diasAteInicio) acima
    
    // Hipótese: O sistema usa DATEDIFF(data_fim, ultima_visita) / (365/12) para converter em meses
    // 109.1d / 30.4 = 3.6 meses
    
    // Hipótese: Tempo médio = DATEDIFF(data_fim, ultima_visita) para os RESGATADOS
    // mas usando a última visita ANTES do período (não a última visita no período)
    // Já calculado: [D] = 1083.8d (errado)
    
    // Hipótese: O "Tempo Médio de Resgate" é calculado como a média dos
    // DATEDIFF(primeira_visita_no_periodo, ultima_visita_antes) para os resgatados
    // mas APENAS para os resgatados que voltaram nos primeiros 110d do período
    
    // Buscar resgatados
    const dataFim45 = new Date(new Date(DATA_FIM + "T12:00:00Z").getTime() - 45 * 86400000).toISOString().slice(0, 10);
    const resgatados = await q(`
      SELECT sub.cliente, sub.ultima_antes,
        (SELECT MIN(DATE(v2.data_criacao)) FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
         WHERE uu2.unidade = ${EXT_ID} AND v2.cliente = sub.cliente
           AND DATE(v2.data_criacao) >= '${DATA_INICIO}' AND DATE(v2.data_criacao) <= '${DATA_FIM}'
           AND v2.comanda_temp = 0 AND v2.status != 0) as primeira_no_periodo,
        (SELECT MAX(DATE(v3.data_criacao)) FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
         WHERE uu3.unidade = ${EXT_ID} AND v3.cliente = sub.cliente
           AND DATE(v3.data_criacao) >= '${DATA_INICIO}' AND DATE(v3.data_criacao) <= '${DATA_FIM}'
           AND v3.comanda_temp = 0 AND v3.status != 0) as ultima_no_periodo
      FROM (
        SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_antes
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '${dataAntes110}'
          AND DATE(v.data_criacao) < '${DATA_INICIO}'
          AND v.comanda_temp = 0 AND v.status != 0
          AND v.cliente IS NOT NULL AND v.cliente != 2
        GROUP BY v.cliente
      ) sub
      WHERE EXISTS (
        SELECT 1 FROM vendas v4 JOIN usuarios uu4 ON v4.usuario = uu4.id
        WHERE uu4.unidade = ${EXT_ID} AND v4.cliente = sub.cliente
          AND DATE(v4.data_criacao) >= '${DATA_INICIO}' AND DATE(v4.data_criacao) <= '${DATA_FIM}'
          AND v4.comanda_temp = 0 AND v4.status != 0
      )
      AND EXISTS (
        SELECT 1 FROM vendas v5 JOIN usuarios uu5 ON v5.usuario = uu5.id
        WHERE uu5.unidade = ${EXT_ID} AND v5.cliente = sub.cliente
          AND DATE(v5.data_criacao) >= '${dataFim45}' AND DATE(v5.data_criacao) <= '${DATA_FIM}'
          AND v5.comanda_temp = 0 AND v5.status != 0
      )
    `);
    
    console.log(`\nResgatados (base ativa 45d + ausência 110d): ${resgatados.length} (ref: 80)`);
    
    if (resgatados.length > 0) {
      const gapsReais = resgatados.map(r => {
        const ua = new Date(r.ultima_antes);
        const pnp = new Date(r.primeira_no_periodo);
        return Math.round((pnp - ua) / 86400000);
      });
      
      // Testar: apenas resgatados que voltaram nos primeiros X dias do período
      for (const xDias of [30, 60, 90, 110, 120, 150, 180]) {
        const dataCorte = new Date(new Date(DATA_INICIO + "T12:00:00Z").getTime() + xDias * 86400000).toISOString().slice(0, 10);
        const filtrados = resgatados.filter(r => {
          const pnp = new Date(r.primeira_no_periodo);
          return pnp <= new Date(dataCorte);
        });
        if (filtrados.length > 0) {
          const gaps = filtrados.map(r => {
            const ua = new Date(r.ultima_antes);
            const pnp = new Date(r.primeira_no_periodo);
            return Math.round((pnp - ua) / 86400000);
          });
          const tm = avg(gaps);
          const matchN = Math.abs(filtrados.length - 80) <= 10 ? " ← N!" : "";
          const matchT = Math.abs(tm - 109.1) <= 10 ? " ← T PRÓXIMO!" : "";
          console.log(`  Voltaram nos primeiros ${xDias}d do período: n=${filtrados.length}, tempo=${tm.toFixed(1)}d${matchN}${matchT}`);
        }
      }
      
      // Testar: gap calculado como DATEDIFF(primeira_no_periodo, data_inicio)
      const gapsDesdeInicio = resgatados.map(r => {
        const pnp = new Date(r.primeira_no_periodo);
        return Math.round((pnp - new Date(DATA_INICIO)) / 86400000);
      });
      console.log(`\n  DATEDIFF(primeira_no_periodo, data_inicio): média=${avg(gapsDesdeInicio).toFixed(1)}d`);
      
      // Testar: gap = DATEDIFF(data_inicio, ultima_antes)
      const gapsAteInicio = resgatados.map(r => {
        const ua = new Date(r.ultima_antes);
        return Math.round((new Date(DATA_INICIO) - ua) / 86400000);
      });
      console.log(`  DATEDIFF(data_inicio, ultima_antes): média=${avg(gapsAteInicio).toFixed(1)}d`);
      
      // Distribuição dos gapsAteInicio
      console.log("\n  Distribuição de DATEDIFF(data_inicio, ultima_antes) dos resgatados:");
      for (const [b0, b1] of [[0,30],[30,60],[60,90],[90,110],[110,120],[120,150],[150,180],[180,Infinity]]) {
        const c = gapsAteInicio.filter(g => g >= b0 && g < b1).length;
        console.log(`    ${b0}-${b1}d: ${c}`);
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
