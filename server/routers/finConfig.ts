/**
 * finConfig.ts — Configuração Financeira da Gestão Total
 * Gerencia taxas de cartão, taxa bancária e funcionários CLT.
 * Gera saídas automáticas no gt_financeiro com base nos dados do Data VIP.
 */
import { z } from "zod";
import { router, protectedProcedure, sysUserProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { gtFinConfig, gtFuncionariosClt, gtFinanceiro } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Retorna a configuração de taxas da org/unidade (cria se não existir) */
async function getOrCreateConfig(db: Awaited<ReturnType<typeof getDb>>, orgId: number, unitId?: number | null) {
  if (!db) throw new Error("DB unavailable");
  const cond = unitId
    ? and(eq(gtFinConfig.orgId, orgId), eq(gtFinConfig.unitId, unitId))
    : and(eq(gtFinConfig.orgId, orgId), sql`unitId IS NULL`);
  const rows = await db.select().from(gtFinConfig).where(cond).limit(1);
  if (rows.length > 0) return rows[0];
  // Criar registro padrão
  await db.insert(gtFinConfig).values({
    orgId,
    unitId: unitId ?? null,
    taxaCredito: "0",
    taxaDebito: "0",
    taxaBancaria: "0",
    taxaBancariaAtiva: 0,
    taxaBancariaDia: 1,
  });
  const rows2 = await db.select().from(gtFinConfig).where(cond).limit(1);
  return rows2[0];
}

// ── Router principal ─────────────────────────────────────────────────────────
export const finConfigRouter = router({

  // ── Taxas: obter configuração ─────────────────────────────────────────────
  getTaxas: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      return getOrCreateConfig(db, input.orgId, input.unitId);
    }),

  // ── Taxas: salvar configuração ────────────────────────────────────────────
  saveTaxas: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number(),
      taxaCredito: z.number().min(0).max(100),
      taxaDebito: z.number().min(0).max(100),
      taxaBancaria: z.number().min(0),
      taxaBancariaAtiva: z.boolean(),
      taxaBancariaDia: z.number().min(1).max(31),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const config = await getOrCreateConfig(db, input.orgId, input.unitId);
      await db.update(gtFinConfig)
        .set({
          taxaCredito: String(input.taxaCredito),
          taxaDebito: String(input.taxaDebito),
          taxaBancaria: String(input.taxaBancaria),
          taxaBancariaAtiva: input.taxaBancariaAtiva ? 1 : 0,
          taxaBancariaDia: input.taxaBancariaDia,
        })
        .where(eq(gtFinConfig.id, config.id));

      // Após salvar, aplicar automaticamente as taxas de cartão do mês atual
      let lancamentos = 0;
      let lancamentoMsg = "";
      if (input.taxaCredito > 0 || input.taxaDebito > 0) {
        try {
          const now = new Date();
          const y = now.getFullYear();
          const m = now.getMonth() + 1;
          const inicio = `${y}-${String(m).padStart(2, "0")}-01`;
          const fim = new Date(y, m, 0).toISOString().slice(0, 10);

          const { queryLocal } = await import("../db-local");
          const [extRows] = await db.execute(
            sql`SELECT externalId FROM units WHERE id = ${input.unitId} AND externalId IS NOT NULL`
          ) as any;
          const extIdRaw = (extRows as any[])[0]?.externalId;

          if (extIdRaw) {
            const extId = Number(extIdRaw);
            const taxaCreditoRate = input.taxaCredito / 100;
            const taxaDebitoRate = input.taxaDebito / 100;

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

            for (const row of rows) {
              const dia = typeof row.dia === "string" ? row.dia.slice(0, 10) : new Date(row.dia).toISOString().slice(0, 10);
              const tipo = row.tipo.toLowerCase();
              const totalVendas = parseFloat(String(row.total));
              if (totalVendas <= 0) continue;
              const taxa = tipo === "credito" ? taxaCreditoRate : taxaDebitoRate;
              if (taxa === 0) continue;
              const valorTaxa = parseFloat((totalVendas * taxa).toFixed(2));
              const referencia = dia.slice(0, 7);
              const dataVipRef = `taxa_${tipo}:${input.unitId}:${dia}`;
              const descricao = `Taxa cartão ${tipo === "credito" ? "crédito" : "débito"} ${dia} (${(taxa * 100).toFixed(2)}% sobre R$ ${totalVendas.toFixed(2)})`;
              await db.execute(sql`
                INSERT INTO gt_financeiro
                  (orgId, unitId, tipo, categoria, descricao, valor, vencimento, pago, paidAt, referencia, dataVipRef)
                VALUES
                  (${input.orgId}, ${input.unitId}, 'despesa', 'Taxa Cartão', ${descricao}, ${valorTaxa}, ${dia}, 1, ${dia}, ${referencia}, ${dataVipRef})
                ON DUPLICATE KEY UPDATE
                  valor = VALUES(valor),
                  descricao = VALUES(descricao),
                  updatedAt = NOW()
              `);
              lancamentos++;
            }
            lancamentoMsg = `${lancamentos} saída(s) de taxa lançadas no Financeiro.`;
          }
        } catch (e) {
          // Não bloquear o salvamento se o banco externo falhar
          lancamentoMsg = "Taxas salvas. Lançamento automático indisponível (banco externo offline).";
        }
      }

      return { success: true, lancamentos, msg: lancamentoMsg || "Taxas salvas com sucesso." };
    }),

  // ── Funcionários CLT: listar ──────────────────────────────────────────────
  listFuncionarios: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const cond = input.unitId
        ? and(eq(gtFuncionariosClt.orgId, input.orgId), eq(gtFuncionariosClt.unitId, input.unitId))
        : eq(gtFuncionariosClt.orgId, input.orgId);
      return db.select().from(gtFuncionariosClt).where(cond).orderBy(gtFuncionariosClt.nome);
    }),

  // ── Funcionários CLT: criar ───────────────────────────────────────────────
  createFuncionario: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      nome: z.string().min(1),
      cargo: z.string().optional(),
      salario: z.number().min(0),
      diaPagamento: z.number().min(1).max(31).default(5),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.insert(gtFuncionariosClt).values({
        orgId: input.orgId,
        unitId: input.unitId ?? null,
        nome: input.nome,
        cargo: input.cargo ?? null,
        salario: String(input.salario),
        diaPagamento: input.diaPagamento,
        ativo: 1,
      });
      return { success: true };
    }),

  // ── Funcionários CLT: atualizar ───────────────────────────────────────────
  updateFuncionario: sysUserProcedure
    .input(z.object({
      id: z.number(),
      orgId: z.number(),
      nome: z.string().min(1),
      cargo: z.string().optional(),
      salario: z.number().min(0),
      diaPagamento: z.number().min(1).max(31),
      ativo: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(gtFuncionariosClt)
        .set({
          nome: input.nome,
          cargo: input.cargo ?? null,
          salario: String(input.salario),
          diaPagamento: input.diaPagamento,
          ativo: input.ativo ? 1 : 0,
        })
        .where(and(eq(gtFuncionariosClt.id, input.id), eq(gtFuncionariosClt.orgId, input.orgId)));
      return { success: true };
    }),

  // ── Funcionários CLT: excluir ─────────────────────────────────────────────
  deleteFuncionario: sysUserProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(gtFuncionariosClt)
        .where(and(eq(gtFuncionariosClt.id, input.id), eq(gtFuncionariosClt.orgId, input.orgId)));
      return { success: true };
    }),

  // ── Job: aplicar taxas de cartão por período ──────────────────────────────
  /**
   * Lê as vendas do Data VIP por forma de pagamento (crédito/débito) e cria
   * lançamentos de despesa no gt_financeiro com a taxa calculada.
   * Chave de deduplicação: dataVipRef = 'taxa_credito:{unitId}:{YYYY-MM-DD}'
   */
  aplicarTaxasCartao: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number(),
      inicio: z.string(), // YYYY-MM-DD
      fim: z.string(),    // YYYY-MM-DD
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      // Buscar configuração de taxas
      const config = await getOrCreateConfig(db, input.orgId, input.unitId);
      const taxaCredito = parseFloat(String(config.taxaCredito)) / 100;
      const taxaDebito = parseFloat(String(config.taxaDebito)) / 100;

      if (taxaCredito === 0 && taxaDebito === 0) {
        return { success: true, lancamentos: 0, msg: "Taxas zeradas, nenhum lançamento criado." };
      }

      // Buscar externalId da unidade
      const { queryLocal } = await import("../db-local");
      const [extRows] = await db.execute(
        sql`SELECT externalId FROM units WHERE id = ${input.unitId} AND externalId IS NOT NULL`
      ) as any;
      const extIdRaw = (extRows as any[])[0]?.externalId;
      if (!extIdRaw) return { success: false, lancamentos: 0, msg: "Unidade sem externalId." };
      const extId = Number(extIdRaw);

      // Buscar vendas por forma de pagamento (crédito/débito) por dia
      const rows = await queryLocal<{
        dia: string;
        tipo: string; // 'credito' | 'debito' | outros
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
          AND DATE(v.data_criacao) BETWEEN '${input.inicio}' AND '${input.fim}'
          AND LOWER(fp.tipo) IN ('credito', 'debito')
        GROUP BY DATE(v.data_criacao), LOWER(fp.tipo)
        ORDER BY dia
      `);

      let lancamentos = 0;
      for (const row of rows) {
        const dia = typeof row.dia === "string" ? row.dia.slice(0, 10) : new Date(row.dia).toISOString().slice(0, 10);
        const tipo = row.tipo.toLowerCase();
        const totalVendas = parseFloat(String(row.total));
        if (totalVendas <= 0) continue;

        const taxa = tipo === "credito" ? taxaCredito : taxaDebito;
        if (taxa === 0) continue;

        const valorTaxa = parseFloat((totalVendas * taxa).toFixed(2));
        const referencia = dia.slice(0, 7);
        const dataVipRef = `taxa_${tipo}:${input.unitId}:${dia}`;
        const descricao = `Taxa cartão ${tipo === "credito" ? "crédito" : "débito"} ${dia} (${(taxa * 100).toFixed(2)}% sobre R$ ${totalVendas.toFixed(2)})`;

        await db.execute(sql`
          INSERT INTO gt_financeiro
            (orgId, unitId, tipo, categoria, descricao, valor, vencimento, pago, paidAt, referencia, dataVipRef)
          VALUES
            (${input.orgId}, ${input.unitId}, 'despesa', 'Taxa Cartão', ${descricao}, ${valorTaxa}, ${dia}, 1, ${dia}, ${referencia}, ${dataVipRef})
          ON DUPLICATE KEY UPDATE
            valor = VALUES(valor),
            descricao = VALUES(descricao),
            updatedAt = NOW()
        `);
        lancamentos++;
      }

      return { success: true, lancamentos, msg: `${lancamentos} lançamento(s) de taxa criados.` };
    }),

  // ── Job: lançar taxa bancária mensal ──────────────────────────────────────
  /**
   * Cria um lançamento mensal de despesa para a taxa bancária.
   * Chave de deduplicação: dataVipRef = 'taxa_bancaria:{unitId}:{YYYY-MM}'
   */
  lancarTaxaBancaria: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number(),
      referencia: z.string(), // YYYY-MM
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const config = await getOrCreateConfig(db, input.orgId, input.unitId);
      if (!config.taxaBancariaAtiva || parseFloat(String(config.taxaBancaria)) <= 0) {
        return { success: true, msg: "Taxa bancária inativa ou zerada." };
      }

      const valor = parseFloat(String(config.taxaBancaria));
      const dia = String(config.taxaBancariaDia).padStart(2, "0");
      const [ano, mes] = input.referencia.split("-");
      const vencimento = `${ano}-${mes}-${dia}`;
      const dataVipRef = `taxa_bancaria:${input.unitId}:${input.referencia}`;

      await db.execute(sql`
        INSERT INTO gt_financeiro
          (orgId, unitId, tipo, categoria, descricao, valor, vencimento, pago, referencia, dataVipRef)
        VALUES
          (${input.orgId}, ${input.unitId}, 'despesa', 'Taxa Bancária', ${`Taxa bancária ${input.referencia}`}, ${valor}, ${vencimento}, 0, ${input.referencia}, ${dataVipRef})
        ON DUPLICATE KEY UPDATE
          valor = VALUES(valor),
          updatedAt = NOW()
      `);

      return { success: true, msg: `Taxa bancária de R$ ${valor.toFixed(2)} lançada para ${input.referencia}.` };
    }),

  // ── Job: lançar salários CLT mensais ─────────────────────────────────────
  /**
   * Para cada funcionário CLT ativo, cria um lançamento de despesa no mês.
   * Chave de deduplicação: dataVipRef = 'salario_clt:{funcId}:{YYYY-MM}'
   */
  lancarSalariosClt: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      referencia: z.string(), // YYYY-MM
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const cond = input.unitId
        ? and(
            eq(gtFuncionariosClt.orgId, input.orgId),
            eq(gtFuncionariosClt.unitId, input.unitId),
            eq(gtFuncionariosClt.ativo, 1)
          )
        : and(eq(gtFuncionariosClt.orgId, input.orgId), eq(gtFuncionariosClt.ativo, 1));

      const funcionarios = await db.select().from(gtFuncionariosClt).where(cond);
      if (funcionarios.length === 0) return { success: true, lancamentos: 0, msg: "Nenhum funcionário CLT ativo." };

      const [ano, mes] = input.referencia.split("-");
      let lancamentos = 0;

      for (const func of funcionarios) {
        const salario = parseFloat(String(func.salario));
        if (salario <= 0) continue;
        const dia = String(func.diaPagamento).padStart(2, "0");
        const vencimento = `${ano}-${mes}-${dia}`;
        const dataVipRef = `salario_clt:${func.id}:${input.referencia}`;
        const cargo = func.cargo ? ` (${func.cargo})` : "";
        const descricao = `Salário CLT — ${func.nome}${cargo} — ${input.referencia}`;

        await db.execute(sql`
          INSERT INTO gt_financeiro
            (orgId, unitId, tipo, categoria, descricao, valor, vencimento, pago, referencia, dataVipRef)
          VALUES
            (${input.orgId}, ${func.unitId ?? null}, 'despesa', 'Salário CLT', ${descricao}, ${salario}, ${vencimento}, 0, ${input.referencia}, ${dataVipRef})
          ON DUPLICATE KEY UPDATE
            valor = VALUES(valor),
            descricao = VALUES(descricao),
            updatedAt = NOW()
        `);
        lancamentos++;
      }

      return { success: true, lancamentos, msg: `${lancamentos} salário(s) CLT lançados para ${input.referencia}.` };
    }),

  // ── Resumo: o que já foi lançado automaticamente no mês ──────────────────
  resumoLancamentos: sysUserProcedure
    .input(z.object({ orgId: z.number(), unitId: z.number(), referencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [rows] = await db.execute(sql`
        SELECT categoria, SUM(valor) as total, COUNT(*) as qtd
        FROM gt_financeiro
        WHERE orgId = ${input.orgId}
          AND unitId = ${input.unitId}
          AND tipo = 'despesa'
          AND referencia = ${input.referencia}
          AND (
            dataVipRef LIKE CONCAT('taxa_credito:', ${input.unitId}, ':%')
            OR dataVipRef LIKE CONCAT('taxa_debito:', ${input.unitId}, ':%')
            OR dataVipRef LIKE CONCAT('taxa_bancaria:', ${input.unitId}, ':%')
            OR dataVipRef LIKE 'salario_clt:%'
          )
        GROUP BY categoria
      `) as any;
      return (rows as any[]).map(r => ({
        categoria: r.categoria as string,
        total: parseFloat(r.total),
        qtd: Number(r.qtd),
      }));
    }),
});
