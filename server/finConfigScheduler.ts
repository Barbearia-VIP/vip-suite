/**
 * finConfigScheduler.ts — Jobs Mensais de Configuração Financeira
 *
 * Dois jobs automáticos:
 *
 * 1. TAXAS DE CARTÃO (dia 1 de cada mês às 06:00 BRT = 09:00 UTC)
 *    Para cada unidade com taxas configuradas:
 *    - Busca vendas por cartão (crédito/débito) no Data VIP do mês anterior
 *    - Lança despesas dia a dia no gt_financeiro (upsert por dataVipRef)
 *
 * 2. SALÁRIOS CLT (diário às 07:00 BRT = 10:00 UTC)
 *    Para cada funcionário CLT ativo cujo diaPagamento == dia atual do mês:
 *    - Lança o salário como despesa no gt_financeiro do mês atual (upsert)
 *
 * Ambos os jobs se reagendam automaticamente após execução.
 */

import { getDb } from "./db";
import { gtFinConfig, gtFuncionariosClt } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { queryLocal } from "./db-local";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Retorna o intervalo completo do mês anterior */
function prevMonthRange(): { inicio: string; fim: string; referencia: string } {
  const now = new Date();
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m = now.getMonth() === 0 ? 12 : now.getMonth();
  const inicio = `${y}-${String(m).padStart(2, "0")}-01`;
  const fim = new Date(y, m, 0).toISOString().slice(0, 10);
  const referencia = `${y}-${String(m).padStart(2, "0")}`;
  return { inicio, fim, referencia };
}

/** Retorna o mês atual no formato YYYY-MM */
function currentMonthRef(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** ms até o próximo dia 1 às 09:00 UTC (taxas de cartão) */
function msUntilNextFirstOfMonth(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 9, 0, 0, 0));
  return next.getTime() - now.getTime();
}

/** ms até o próximo 10:00 UTC de hoje (ou amanhã se já passou) */
function msUntilNext10UTC(): number {
  const now = new Date();
  const todayAt10 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 10, 0, 0, 0));
  if (todayAt10.getTime() > now.getTime()) {
    return todayAt10.getTime() - now.getTime();
  }
  // já passou hoje — agendar para amanhã
  const tomorrowAt10 = new Date(todayAt10.getTime() + 24 * 60 * 60 * 1000);
  return tomorrowAt10.getTime() - now.getTime();
}

// ── Job 1: Taxas de Cartão ────────────────────────────────────────────────────

export async function runFinConfigMonthlyJob(): Promise<void> {
  console.log("[FinConfig] Iniciando job mensal de taxas de cartão...");
  const db = await getDb();
  if (!db) {
    console.warn("[FinConfig] Banco indisponível, job de taxas abortado.");
    return;
  }

  const configs = await db
    .select()
    .from(gtFinConfig)
    .where(sql`(CAST(taxaCredito AS DECIMAL(10,4)) > 0 OR CAST(taxaDebito AS DECIMAL(10,4)) > 0)`);

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

      const [extRows] = await db.execute(
        sql`SELECT externalId FROM units WHERE id = ${unitId} AND externalId IS NOT NULL`
      ) as any;
      const extIdRaw = (extRows as any[])[0]?.externalId;
      if (!extIdRaw) {
        console.warn(`[FinConfig] Unidade ${unitId} sem externalId, pulando.`);
        continue;
      }
      const extId = Number(extIdRaw);

      const rows = await queryLocal<{ dia: string; tipo: string; total: number }>(`
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

  console.log(`[FinConfig] Job taxas concluído. Total: ${totalLancamentos} lançamento(s).`);
}

// ── Job 2: Salários CLT ───────────────────────────────────────────────────────

export async function runSalariosCltJob(): Promise<void> {
  const now = new Date();
  const diaAtual = now.getDate(); // dia do mês atual (1-31)
  const referencia = currentMonthRef();

  console.log(`[FinConfig] Verificando salários CLT para o dia ${diaAtual} (${referencia})...`);

  const db = await getDb();
  if (!db) {
    console.warn("[FinConfig] Banco indisponível, job de salários abortado.");
    return;
  }

  // Buscar funcionários ativos cujo diaPagamento == hoje
  const funcionarios = await db
    .select()
    .from(gtFuncionariosClt)
    .where(
      and(
        eq(gtFuncionariosClt.ativo, 1),
        eq(gtFuncionariosClt.diaPagamento, diaAtual)
      )
    );

  if (funcionarios.length === 0) {
    console.log(`[FinConfig] Nenhum funcionário CLT com pagamento no dia ${diaAtual}.`);
    return;
  }

  let totalLancamentos = 0;

  for (const func of funcionarios) {
    try {
      const salario = parseFloat(String(func.salario));
      if (salario <= 0) continue;

      // Data de vencimento: dia configurado no mês atual
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const maxDia = new Date(y, m, 0).getDate(); // último dia do mês
      const diaPag = Math.min(func.diaPagamento, maxDia);
      const vencimento = `${y}-${String(m).padStart(2, "0")}-${String(diaPag).padStart(2, "0")}`;

      // Chave única: salário do funcionário no mês
      const dataVipRef = `salario_clt:${func.id}:${referencia}`;
      const cargo = func.cargo ? ` (${func.cargo})` : "";
      const descricao = `Salário CLT — ${func.nome}${cargo} — ${referencia}`;

      await db.execute(sql`
        INSERT INTO gt_financeiro
          (orgId, unitId, tipo, categoria, descricao, valor, vencimento, pago, paidAt, referencia, dataVipRef)
        VALUES
          (${func.orgId}, ${func.unitId ?? null}, 'despesa', 'Salário CLT', ${descricao}, ${salario}, ${vencimento}, 0, NULL, ${referencia}, ${dataVipRef})
        ON DUPLICATE KEY UPDATE
          valor = VALUES(valor),
          descricao = VALUES(descricao),
          vencimento = VALUES(vencimento),
          updatedAt = NOW()
      `);
      totalLancamentos++;
      console.log(`[FinConfig] Salário lançado: ${func.nome} — R$ ${salario.toFixed(2)} (venc. ${vencimento})`);
    } catch (err) {
      console.error(`[FinConfig] Erro ao lançar salário de ${func.nome}:`, err);
    }
  }

  console.log(`[FinConfig] Job salários CLT concluído. Total: ${totalLancamentos} lançamento(s).`);
}

// ── Agendamento ───────────────────────────────────────────────────────────────

let taxasTimer: ReturnType<typeof setTimeout> | null = null;
let salariosTimer: ReturnType<typeof setTimeout> | null = null;

/** Agenda o job de taxas de cartão para o dia 1 do próximo mês às 06:00 BRT */
function scheduleTaxasNextRun(): void {
  const ms = msUntilNextFirstOfMonth();
  const nextDate = new Date(Date.now() + ms);
  console.log(`[FinConfig] Próxima execução de taxas: ${nextDate.toISOString()} (em ${Math.round(ms / 1000 / 60 / 60)}h)`);

  if (taxasTimer) clearTimeout(taxasTimer);
  taxasTimer = setTimeout(async () => {
    await runFinConfigMonthlyJob();
    scheduleTaxasNextRun();
  }, ms);
}

/** Agenda o job de salários CLT para as 07:00 BRT (10:00 UTC) de cada dia */
function scheduleSalariosNextRun(): void {
  const ms = msUntilNext10UTC();
  const nextDate = new Date(Date.now() + ms);
  console.log(`[FinConfig] Próxima verificação de salários CLT: ${nextDate.toISOString()} (em ${Math.round(ms / 1000 / 60 / 60)}h)`);

  if (salariosTimer) clearTimeout(salariosTimer);
  salariosTimer = setTimeout(async () => {
    await runSalariosCltJob();
    scheduleSalariosNextRun(); // reagendar para o próximo dia
  }, ms);
}

/** Inicia ambos os schedulers. Chamar uma vez no boot do servidor. */
export function startFinConfigScheduler(): void {
  console.log("[FinConfig] Scheduler mensal de taxas de cartão iniciado.");
  console.log("[FinConfig] Scheduler diário de salários CLT iniciado.");
  scheduleTaxasNextRun();
  scheduleSalariosNextRun();
}

export function stopFinConfigScheduler(): void {
  if (taxasTimer) { clearTimeout(taxasTimer); taxasTimer = null; }
  if (salariosTimer) { clearTimeout(salariosTimer); salariosTimer = null; }
  console.log("[FinConfig] Schedulers parados.");
}
