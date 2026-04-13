/**
 * finConfigScheduler.ts — Job Mensal de Taxas de Cartão
 *
 * Roda no primeiro dia de cada mês às 06:00 BRT (09:00 UTC).
 * Para cada unidade com taxas de cartão configuradas (crédito > 0 ou débito > 0):
 *   1. Calcula o intervalo do mês anterior (inicio e fim)
 *   2. Busca vendas por forma de pagamento (crédito/débito) no banco externo
 *   3. Lança despesas de taxa dia a dia no gt_financeiro (upsert por dataVipRef)
 *
 * Também reagenda a si mesmo para o próximo mês usando setTimeout preciso,
 * garantindo que o job rode mesmo após reinicializações do servidor.
 */

import { getDb } from "./db";
import { gtFinConfig } from "../drizzle/schema";
import { gt, sql } from "drizzle-orm";
import { queryLocal } from "./db-local";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Retorna o intervalo completo do mês anterior: { inicio: "YYYY-MM-DD", fim: "YYYY-MM-DD" } */
function prevMonthRange(): { inicio: string; fim: string; referencia: string } {
  const now = new Date();
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m = now.getMonth() === 0 ? 12 : now.getMonth(); // mês anterior (1-based)
  const inicio = `${y}-${String(m).padStart(2, "0")}-01`;
  const fim = new Date(y, m, 0).toISOString().slice(0, 10);
  const referencia = `${y}-${String(m).padStart(2, "0")}`;
  return { inicio, fim, referencia };
}

/** Retorna quantos ms faltam até o próximo dia 1 às 09:00 UTC */
function msUntilNextFirstOfMonth(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 9, 0, 0, 0));
  return next.getTime() - now.getTime();
}

// ── Job principal ─────────────────────────────────────────────────────────────

export async function runFinConfigMonthlyJob(): Promise<void> {
  console.log("[FinConfig] Iniciando job mensal de taxas de cartão...");
  const db = await getDb();
  if (!db) {
    console.warn("[FinConfig] Banco indisponível, job abortado.");
    return;
  }

  // Buscar todas as configs com pelo menos uma taxa > 0
  const configs = await db
    .select()
    .from(gtFinConfig)
    .where(
      sql`(CAST(taxaCredito AS DECIMAL(10,4)) > 0 OR CAST(taxaDebito AS DECIMAL(10,4)) > 0)`
    );

  if (configs.length === 0) {
    console.log("[FinConfig] Nenhuma unidade com taxas configuradas.");
    return;
  }

  const { inicio, fim } = prevMonthRange();
  let totalLancamentos = 0;

  for (const config of configs) {
    try {
      const unitId = config.unitId;
      const orgId = config.orgId;
      if (!unitId) continue;

      const taxaCreditoRate = parseFloat(String(config.taxaCredito)) / 100;
      const taxaDebitoRate = parseFloat(String(config.taxaDebito)) / 100;
      if (taxaCreditoRate === 0 && taxaDebitoRate === 0) continue;

      // Buscar externalId da unidade
      const [extRows] = await db.execute(
        sql`SELECT externalId FROM units WHERE id = ${unitId} AND externalId IS NOT NULL`
      ) as any;
      const extIdRaw = (extRows as any[])[0]?.externalId;
      if (!extIdRaw) {
        console.warn(`[FinConfig] Unidade ${unitId} sem externalId, pulando.`);
        continue;
      }
      const extId = Number(extIdRaw);

      // Buscar vendas por forma de pagamento (crédito/débito) por dia
      const rows = await queryLocal<{
        dia: string;
        tipo: string;
        total: number;
      }>(`
        SELECT
          DATE(v.data_criacao) AS dia,
          LOWER(fp.tipo) AS tipo,
          COALESCE(SUM(vpag.valor), 0) AS total
        FROM sync_vendas v
        JOIN sync_vendas_pagamentos vpag ON vpag.venda = v.id
        JOIN sync_formas_pagamentos fp ON fp.id = vpag.forma_pagamento
        WHERE v.unidade_id = ${extId}
          AND v.comanda_temp = 0
          AND v.cancelado_motivo IS NULL
          AND v.status = 1
          AND DATE(v.data_criacao) BETWEEN '${inicio}' AND '${fim}'
          AND LOWER(fp.tipo) IN ('credito', 'debito')
        GROUP BY DATE(v.data_criacao), LOWER(fp.tipo)
        ORDER BY dia
      `);

      let lancamentosUnidade = 0;
      for (const row of rows) {
        const dia = typeof row.dia === "string"
          ? row.dia.slice(0, 10)
          : new Date(row.dia).toISOString().slice(0, 10);
        const tipo = row.tipo.toLowerCase();
        const totalVendas = parseFloat(String(row.total));
        if (totalVendas <= 0) continue;
        const taxa = tipo === "credito" ? taxaCreditoRate : taxaDebitoRate;
        if (taxa === 0) continue;

        const valorTaxa = parseFloat((totalVendas * taxa).toFixed(2));
        const referencia = dia.slice(0, 7);
        const dataVipRef = `taxa_${tipo}:${unitId}:${dia}`;
        const descricao = `Taxa cartão ${tipo === "credito" ? "crédito" : "débito"} ${dia} (${(taxa * 100).toFixed(2)}% sobre R$ ${totalVendas.toFixed(2)})`;

        await db.execute(sql`
          INSERT INTO gt_financeiro
            (orgId, unitId, tipo, categoria, descricao, valor, vencimento, pago, paidAt, referencia, dataVipRef)
          VALUES
            (${orgId}, ${unitId}, 'despesa', 'Taxa Cartão', ${descricao}, ${valorTaxa}, ${dia}, 1, ${dia}, ${referencia}, ${dataVipRef})
          ON DUPLICATE KEY UPDATE
            valor = VALUES(valor),
            descricao = VALUES(descricao),
            updatedAt = NOW()
        `);
        lancamentosUnidade++;
      }

      totalLancamentos += lancamentosUnidade;
      console.log(`[FinConfig] Unidade ${unitId}: ${lancamentosUnidade} lançamento(s) de taxa (${inicio} → ${fim}).`);
    } catch (err) {
      console.error(`[FinConfig] Erro na unidade ${config.unitId}:`, err);
    }
  }

  console.log(`[FinConfig] Job concluído. Total: ${totalLancamentos} lançamento(s).`);
}

// ── Agendamento preciso ───────────────────────────────────────────────────────

let jobTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleNextRun(): void {
  const ms = msUntilNextFirstOfMonth();
  const nextDate = new Date(Date.now() + ms);
  console.log(`[FinConfig] Próxima execução agendada para ${nextDate.toISOString()} (em ${Math.round(ms / 1000 / 60 / 60)}h)`);

  if (jobTimer) clearTimeout(jobTimer);
  jobTimer = setTimeout(async () => {
    await runFinConfigMonthlyJob();
    scheduleNextRun(); // reagendar para o mês seguinte
  }, ms);
}

/** Inicia o scheduler mensal. Chamar uma vez no boot do servidor. */
export function startFinConfigScheduler(): void {
  console.log("[FinConfig] Scheduler mensal de taxas de cartão iniciado.");
  scheduleNextRun();
}

export function stopFinConfigScheduler(): void {
  if (jobTimer) {
    clearTimeout(jobTimer);
    jobTimer = null;
    console.log("[FinConfig] Scheduler mensal parado.");
  }
}
