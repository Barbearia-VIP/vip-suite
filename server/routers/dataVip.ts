/**
 * server/routers/dataVip.ts
 *
 * Router de sincronização do módulo Data VIP.
 * Busca dados de vendas da API externa (franquiabv.com.br) e armazena no banco.
 * Suporta seleção de intervalo de datas pelo usuário.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { moduleConfigs, syncLog, units, vendas } from "../../drizzle/schema";
import { and, eq, gte, lte, desc, count, sum, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ─── TIPOS ────────────────────────────────────────────────────────────────────

interface VendaPayload {
  vendaId?: string;
  vendaData?: string;
  produto?: string;
  valorBruto?: number | string;
  valorLiquido?: number | string;
  formaPagamento?: string;
  convenio?: string;
  colaboradorId?: string;
  colaborador?: string;
  colaboradorNome?: string;
  caixaId?: string;
  caixaNome?: string;
  clienteId?: string;
  clienteNome?: string;
  telefone?: string;
  [key: string]: unknown;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const API_BASE_URL = "https://franquiabv.com.br/api/unidade/vendasV2";

function parseApiDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  // Formatos possíveis: "2024-03-15", "15/03/2024", "2024-03-15T10:30:00"
  const clean = dateStr.trim();
  // ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    const d = new Date(clean.includes("T") ? clean : `${clean}T12:00:00-03:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  // BR format dd/mm/yyyy
  const brMatch = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    const d = new Date(`${brMatch[3]}-${brMatch[2]}-${brMatch[1]}T12:00:00-03:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function sanitizeNumber(val?: number | string): number | null {
  if (val === undefined || val === null || val === "") return null;
  const n = typeof val === "string" ? parseFloat(val.replace(",", ".")) : val;
  return isNaN(n) ? null : n;
}

async function fetchVendasFromApi(
  apiUnidadeId: string,
  apiHash: string,
  inicio: string,
  fim: string
): Promise<{ vendas: VendaPayload[]; error?: string }> {
  const url = `${API_BASE_URL}?id=${encodeURIComponent(apiUnidadeId)}&hash=${encodeURIComponent(apiHash)}&inicio=${inicio}&fim=${fim}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      return { vendas: [], error: `API retornou status ${response.status} ${response.statusText}` };
    }
    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { vendas: [], error: "Resposta da API não é JSON válido" };
    }
    // A API pode retornar array direto ou { vendas: [...] } ou { data: [...] }
    const list: VendaPayload[] = Array.isArray(data)
      ? (data as VendaPayload[])
      : ((data as Record<string, unknown>).vendas as VendaPayload[]) ||
        ((data as Record<string, unknown>).data as VendaPayload[]) ||
        [];
    return { vendas: list };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { vendas: [], error: "Timeout: a API não respondeu em 2 minutos" };
    }
    return { vendas: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── ROUTER ───────────────────────────────────────────────────────────────────

export const dataVipRouter = router({

  /**
   * Sincroniza vendas de uma unidade específica com intervalo de datas definido pelo usuário.
   * Usa as chaves apiUnidadeId e apiHash armazenadas em module_configs.
   */
  sync: protectedProcedure
    .input(z.object({
      unitId: z.number().int().positive(),
      inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato: YYYY-MM-DD"),
      fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato: YYYY-MM-DD"),
    }))
    .mutation(async ({ input }) => {
      const t0 = Date.now();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      // Buscar a unidade
      const [unit] = await db.select().from(units).where(eq(units.id, input.unitId)).limit(1);
      if (!unit) throw new TRPCError({ code: "NOT_FOUND", message: "Unidade não encontrada" });

      // Buscar configurações do módulo data_vip para esta unidade
      const [config] = await db
        .select()
        .from(moduleConfigs)
        .where(and(eq(moduleConfigs.unitId, input.unitId), eq(moduleConfigs.module, "data_vip")))
        .limit(1);

      const cfg = config?.config as Record<string, string> | null;
      const apiUnidadeId = cfg?.apiUnidadeId;
      const apiHash = cfg?.apiHash;

      if (!apiUnidadeId || !apiHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Chaves de API não configuradas para esta unidade. Acesse Configurações > Data VIP.",
        });
      }

      // Registrar início da sincronização
      const [logEntry] = await db.insert(syncLog).values({
        unitId: input.unitId,
        status: "running",
        registrosImportados: 0,
        iniciadoEm: new Date(),
      }).$returningId();

      try {
        // Buscar dados da API externa
        const { vendas: vendasApi, error } = await fetchVendasFromApi(
          apiUnidadeId,
          apiHash,
          input.inicio,
          input.fim
        );

        if (error) {
          await db.update(syncLog)
            .set({ status: "error", erro: error, finalizadoEm: new Date() })
            .where(eq(syncLog.id, logEntry.id));
          throw new TRPCError({ code: "BAD_REQUEST", message: `Erro na API: ${error}` });
        }

        if (vendasApi.length === 0) {
          await db.update(syncLog)
            .set({ status: "success", registrosImportados: 0, finalizadoEm: new Date() })
            .where(eq(syncLog.id, logEntry.id));
          return {
            ok: true,
            message: "Nenhum dado retornado pela API para o período selecionado",
            fetchedCount: 0,
            insertedCount: 0,
            durationMs: Date.now() - t0,
          };
        }

        // Apagar registros existentes do período para esta unidade (upsert por período)
        await db.delete(vendas).where(
          and(
            eq(vendas.unitId, input.unitId),
            gte(vendas.dataVenda, new Date(`${input.inicio}T00:00:00-03:00`)),
            lte(vendas.dataVenda, new Date(`${input.fim}T23:59:59-03:00`))
          )
        );

        // Transformar e inserir em lotes de 500
        const BATCH = 500;
        const records = vendasApi
          .filter(v => v.vendaId)
          .map(v => ({
            unitId: input.unitId,
            externalId: String(v.vendaId).slice(0, 100),
            clienteNome: v.clienteNome ? String(v.clienteNome).slice(0, 255) : null,
            clienteId: v.clienteId ? String(v.clienteId).slice(0, 100) : null,
            colaboradorNome: (v.colaboradorNome || v.colaborador)
              ? String(v.colaboradorNome || v.colaborador).slice(0, 255)
              : null,
            colaboradorId: v.colaboradorId ? String(v.colaboradorId).slice(0, 100) : null,
            valorBruto: sanitizeNumber(v.valorBruto)?.toString() ?? "0",
            valorLiquido: sanitizeNumber(v.valorLiquido)?.toString() ?? "0",
            desconto: "0",
            servicos: v.produto ? JSON.stringify([{ nome: v.produto, formaPagamento: v.formaPagamento }]) : null,
            dataVenda: parseApiDate(v.vendaData) ?? new Date(),
          }));

        for (let i = 0; i < records.length; i += BATCH) {
          await db.insert(vendas).values(records.slice(i, i + BATCH));
        }

        const insertedCount = records.length;
        const durationMs = Date.now() - t0;

        // Atualizar log
        await db.update(syncLog)
          .set({ status: "success", registrosImportados: insertedCount, finalizadoEm: new Date() })
          .where(eq(syncLog.id, logEntry.id));

        return {
          ok: true,
          message: `Sincronização concluída: ${insertedCount} registros importados`,
          fetchedCount: vendasApi.length,
          insertedCount,
          durationMs,
          periodo: { inicio: input.inicio, fim: input.fim },
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        await db.update(syncLog)
          .set({ status: "error", erro: msg, finalizadoEm: new Date() })
          .where(eq(syncLog.id, logEntry.id));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),

  /**
   * Retorna o histórico de sincronizações de uma unidade.
   */
  syncHistory: protectedProcedure
    .input(z.object({ unitId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(syncLog)
        .where(eq(syncLog.unitId, input.unitId))
        .orderBy(desc(syncLog.iniciadoEm))
        .limit(20);
    }),

  /**
   * Retorna KPIs de faturamento para uma unidade em um período.
   */
  kpis: protectedProcedure
    .input(z.object({
      unitId: z.number().int().positive().optional(),
      inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const conditions = [
        gte(vendas.dataVenda, new Date(`${input.inicio}T00:00:00-03:00`)),
        lte(vendas.dataVenda, new Date(`${input.fim}T23:59:59-03:00`)),
      ];
      if (input.unitId) conditions.push(eq(vendas.unitId, input.unitId));

      const [result] = await db.select({
        totalFaturamento: sql<string>`COALESCE(SUM(${vendas.valorLiquido}), 0)`,
        totalAtendimentos: count(vendas.id),
        ticketMedio: sql<string>`COALESCE(AVG(${vendas.valorLiquido}), 0)`,
      }).from(vendas).where(and(...conditions));

      return {
        totalFaturamento: parseFloat(result?.totalFaturamento ?? "0"),
        totalAtendimentos: Number(result?.totalAtendimentos ?? 0),
        ticketMedio: parseFloat(String(result?.ticketMedio ?? "0")),
      };
    }),

  /**
   * Retorna lista de unidades com suas configurações de Data VIP.
   */
  unitsConfig: protectedProcedure
    .input(z.object({ orgId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const unitsList = await db.select().from(units)
        .where(eq(units.orgId, input.orgId));

      const configs = await db.select().from(moduleConfigs)
        .where(and(
          eq(moduleConfigs.module, "data_vip"),
          // unitId in unitsList
        ));

      const configMap = new Map(configs.map(c => [c.unitId, c.config as Record<string, string>]));

      return unitsList.map(u => ({
        ...u,
        dataVipConfig: configMap.get(u.id) ?? null,
        hasApiKeys: !!(configMap.get(u.id)?.apiUnidadeId && configMap.get(u.id)?.apiHash),
      }));
    }),
});
