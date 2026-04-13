/**
 * sync.ts — Router tRPC para gerenciamento da replicação local
 *
 * Procedures:
 * - sync.status           → status de todas as unidades sincronizadas
 * - sync.schedulerInfo    → info do agendador (última sync, próxima, intervalo)
 * - sync.syncNow          → inicia sync em background (fire-and-forget) e retorna imediatamente
 * - sync.syncNowStatus    → polling do estado da sync iniciada por syncNow
 * - sync.importHistorico  → importa histórico completo de uma unidade (admin)
 * - sync.importTodas      → importa histórico de todas as unidades sequencialmente (admin)
 * - sync.incremental      → força sync incremental de uma unidade (admin)
 * - sync.getUnidades      → lista unidades disponíveis no banco externo
 */

import { z } from "zod";
import { router, protectedProcedure, sysUserProcedure } from "../_core/trpc";
import {
  getSyncStatus,
  importHistorico,
  syncIncremental,
  getUnidadesExternas,
  getSchedulerInfo,
} from "../syncEngine";

// ─── Estado em memória da sync manual em andamento ───────────────────────────
interface SyncNowState {
  running: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  totalUnidades: number;
  completedUnidades: number;
  totalNovas: number;
  erros: { unidadeId: number; erro: string }[];
  currentUnidade: number | null;
}

const syncNowState: SyncNowState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  totalUnidades: 0,
  completedUnidades: 0,
  totalNovas: 0,
  erros: [],
  currentUnidade: null,
};

async function runSyncNowBackground(): Promise<void> {
  if (syncNowState.running) return; // Já está rodando
  const unidades = await getUnidadesExternas();
  syncNowState.running = true;
  syncNowState.startedAt = new Date();
  syncNowState.finishedAt = null;
  syncNowState.totalUnidades = unidades.length;
  syncNowState.completedUnidades = 0;
  syncNowState.totalNovas = 0;
  syncNowState.erros = [];
  syncNowState.currentUnidade = null;

  // Executa em background sem bloquear a resposta HTTP
  (async () => {
    for (const uid of unidades) {
      syncNowState.currentUnidade = uid;
      try {
        const r = await syncIncremental(uid);
        syncNowState.totalNovas += r.novas;
      } catch (err) {
        syncNowState.erros.push({ unidadeId: uid, erro: String(err) });
      }
      syncNowState.completedUnidades++;
    }
    syncNowState.running = false;
    syncNowState.finishedAt = new Date();
    syncNowState.currentUnidade = null;
    console.log(`[SyncNow] Concluído: ${syncNowState.totalNovas} novas vendas, ${syncNowState.erros.length} erros`);
  })();
}

export const syncRouter = router({
  // Status de todas as unidades
  status: sysUserProcedure.query(async () => {
    return getSyncStatus();
  }),

  // Info do agendador automático
  schedulerInfo: sysUserProcedure.query(() => {
    return getSchedulerInfo();
  }),

  // Inicia sync incremental em background e retorna imediatamente (sem timeout)
  syncNow: sysUserProcedure.mutation(async () => {
    if (syncNowState.running) {
      return { started: false, message: "Sincronização já está em andamento" };
    }
    runSyncNowBackground(); // fire-and-forget
    return { started: true, message: "Sincronização iniciada em background" };
  }),

  // Polling do estado da sync em andamento
  syncNowStatus: sysUserProcedure.query(() => {
    return { ...syncNowState };
  }),

  // Lista unidades disponíveis no banco externo
  getUnidades: sysUserProcedure.query(async () => {
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
  importTodas: sysUserProcedure.mutation(async () => {
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
  incrementalTodas: sysUserProcedure.mutation(async () => {
    const unidades = await getUnidadesExternas();
    let totalNovas = 0;
    for (const uid of unidades) {
      const r = await syncIncremental(uid);
      totalNovas += r.novas;
    }
    return { unidades: unidades.length, totalNovas };
  }),
});
