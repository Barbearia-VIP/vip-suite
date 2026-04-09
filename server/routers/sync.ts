/**
 * sync.ts — Router tRPC para gerenciamento da replicação local
 *
 * Procedures:
 * - sync.status           → status de todas as unidades sincronizadas
 * - sync.schedulerInfo    → info do agendador (última sync, próxima, intervalo)
 * - sync.syncNow          → força sync incremental de todas as unidades agora
 * - sync.importHistorico  → importa histórico completo de uma unidade (admin)
 * - sync.importTodas      → importa histórico de todas as unidades sequencialmente (admin)
 * - sync.incremental      → força sync incremental de uma unidade (admin)
 * - sync.getUnidades      → lista unidades disponíveis no banco externo
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getSyncStatus,
  importHistorico,
  syncIncremental,
  getUnidadesExternas,
  getSchedulerInfo,
} from "../syncEngine";

export const syncRouter = router({
  // Status de todas as unidades
  status: protectedProcedure.query(async () => {
    return getSyncStatus();
  }),

  // Info do agendador automático
  schedulerInfo: protectedProcedure.query(() => {
    return getSchedulerInfo();
  }),

  // Sync incremental de todas as unidades agora (botão "Sincronizar agora")
  syncNow: protectedProcedure.mutation(async () => {
    const unidades = await getUnidadesExternas();
    let totalNovas = 0;
    const erros: { unidadeId: number; erro: string }[] = [];
    for (const uid of unidades) {
      try {
        const r = await syncIncremental(uid);
        totalNovas += r.novas;
      } catch (err) {
        erros.push({ unidadeId: uid, erro: String(err) });
      }
    }
    return { unidades: unidades.length, totalNovas, erros };
  }),

  // Lista unidades disponíveis no banco externo
  getUnidades: protectedProcedure.query(async () => {
    return getUnidadesExternas();
  }),

  // Importação histórica de uma unidade específica
  importHistorico: protectedProcedure
    .input(z.object({ unidadeId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const result = await importHistorico(input.unidadeId);
      return result;
    }),

  // Importação histórica de todas as unidades (sequencial)
  importTodas: protectedProcedure.mutation(async () => {
    const unidades = await getUnidadesExternas();
    const resultados: { unidadeId: number; ok: boolean; totalVendas: number; totalVp: number; totalClientes: number }[] = [];

    for (const uid of unidades) {
      console.log(`[Sync] Iniciando importação histórica da unidade ${uid}...`);
      const r = await importHistorico(uid);
      resultados.push({ unidadeId: uid, ...r });
      console.log(`[Sync] Unidade ${uid}: ${r.ok ? "OK" : "ERRO"} — ${r.totalVendas} vendas`);
    }

    return {
      total: unidades.length,
      sucesso: resultados.filter((r) => r.ok).length,
      resultados,
    };
  }),

  // Sync incremental de uma unidade
  incremental: protectedProcedure
    .input(z.object({ unidadeId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      return syncIncremental(input.unidadeId);
    }),

  // Sync incremental de todas as unidades
  incrementalTodas: protectedProcedure.mutation(async () => {
    const unidades = await getUnidadesExternas();
    let totalNovas = 0;
    for (const uid of unidades) {
      const r = await syncIncremental(uid);
      totalNovas += r.novas;
    }
    return { unidades: unidades.length, totalNovas };
  }),
});
