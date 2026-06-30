import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { getDbPool } from "../db";
import { TRPCError } from "@trpc/server";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  /**
   * Detailed health check
   * Verifica saúde de MySQL e Redis
   */
  healthCheck: publicProcedure.query(async () => {
    const startTime = Date.now();
    const status = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      mysql: {
        status: "unknown" as "healthy" | "degraded" | "unhealthy" | "unknown",
        responseTime: 0,
        poolSize: 0,
        activeConnections: 0,
        error: null as string | null,
      },
      redis: {
        status: "unknown" as "healthy" | "degraded" | "unhealthy" | "unknown",
        responseTime: 0,
        error: null as string | null,
      },
    };

    // Verificar MySQL
    try {
      const mysqlStart = Date.now();
      const pool = getDbPool();
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
      status.mysql.responseTime = Date.now() - mysqlStart;
      status.mysql.status = status.mysql.responseTime > 1000 ? "degraded" : "healthy";

      // Tentar obter stats do pool
      if ((pool as any).pool) {
        const poolStats = (pool as any).pool;
        if (poolStats) {
          status.mysql.poolSize = poolStats._allConnections?.length || 0;
          status.mysql.activeConnections = poolStats._inUseConnections?.length || 0;
        }
      }
    } catch (error) {
      status.mysql.status = "unhealthy";
      status.mysql.error = error instanceof Error ? error.message : String(error);
    }

    // Determinar status geral
    const overallStatus =
      status.mysql.status === "unhealthy"
        ? "unhealthy"
        : status.mysql.status === "degraded"
          ? "degraded"
          : "healthy";

    return {
      ...status,
      status: overallStatus,
      totalResponseTime: Date.now() - startTime,
    };
  }),

  /**
   * System info
   * Retorna informações detalhadas do sistema
   */
  info: publicProcedure.query(async () => {
    const memory = process.memoryUsage();
    const uptime = process.uptime();

    return {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      uptime: {
        seconds: Math.floor(uptime),
        formatted: formatUptime(uptime),
      },
      memory: {
        rss: Math.round(memory.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        external: Math.round(memory.external / 1024 / 1024),
      },
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };
  }),

  /**
   * Database connection test
   * Testa conexão com o banco de dados
   */
  testDatabase: publicProcedure.query(async () => {
    try {
      const start = Date.now();
      const pool = getDbPool();
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
      const responseTime = Date.now() - start;

      return {
        success: true,
        responseTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Database connection failed",
      });
    }
  }),
});

// Helper para formatar uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}
