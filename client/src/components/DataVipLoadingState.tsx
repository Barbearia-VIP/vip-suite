/**
 * DataVipLoadingState
 * Componente e hook utilitário para tratar estados de carregamento e erros
 * nas páginas Data VIP.
 */

import { TRPCClientError } from "@trpc/client";
import { RefreshCw, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Hook utilitário ─────────────────────────────────────────────────────────

/**
 * Retorna true se o erro é de timeout de query (max_execution_time).
 * Nesses casos, a query deve ser tratada como "ainda carregando" e não como erro.
 */
export function isExternalDbTimeoutError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof TRPCClientError) {
    return (
      error.message?.includes("maximum statement execution time exceeded") ||
      error.message?.includes("Query execution was interrupted") ||
      error.message?.includes("número máximo de tentativas atingido") ||
      error.message?.includes("statement execution time")
    );
  }
  if (error instanceof Error) {
    return (
      error.message?.includes("maximum statement execution time exceeded") ||
      error.message?.includes("Query execution was interrupted")
    );
  }
  return false;
}

/**
 * Dado um objeto de query do tRPC/React Query, retorna se deve mostrar loading.
 * Retorna true se isLoading OU se isError mas o erro é de timeout (ainda retentando).
 */
export function useQueryLoadingState(query: {
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  failureCount?: number;
  error?: unknown;
}): { isLoading: boolean; isTimeoutRetrying: boolean } {
  const isTimeoutRetrying =
    query.isError &&
    isExternalDbTimeoutError(query.error) &&
    (query.failureCount ?? 0) < 3;

  return {
    isLoading: query.isLoading || isTimeoutRetrying,
    isTimeoutRetrying,
  };
}

// ─── Componente de loading pulsante ──────────────────────────────────────────

interface DataVipLoadingStateProps {
  /** Número de linhas de skeleton a exibir */
  rows?: number;
  /** Mensagem customizada */
  message?: string;
  /** Número da tentativa atual (1-3) */
  attempt?: number;
}

export function DataVipLoadingState({
  rows = 4,
  message,
  attempt,
}: DataVipLoadingStateProps) {
  return (
    <div className="space-y-4 p-1">
      {/* Banner informativo */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-blue-500/20 bg-blue-500/5">
        <Database className="w-4 h-4 text-blue-400 shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-blue-300">
            {message ?? "Carregando dados..."}
          </p>
          <p className="text-xs text-blue-400/60 mt-0.5">
            {attempt && attempt > 1
              ? `Tentativa ${attempt} de 3 — aguarde...`
              : "Buscando informações, aguarde um instante..."}
          </p>
        </div>
        <RefreshCw className="w-3.5 h-3.5 text-blue-400/50 animate-spin shrink-0" />
      </div>

      {/* Skeleton rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`h-${i === 0 ? "32" : i === 1 ? "48" : "24"} w-full`} />
      ))}
    </div>
  );
}

// ─── Componente de erro definitivo (após esgotar retries) ─────────────────────

interface DataVipErrorStateProps {
  onRetry?: () => void;
  message?: string;
}

export function DataVipErrorState({ onRetry, message }: DataVipErrorStateProps) {
  return (
    <div className="p-6">
      <div className="flex items-start gap-3 p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-300">
        <Database className="w-5 h-5 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-sm">Dados temporariamente indisponíveis</p>
          <p className="text-xs mt-1 text-yellow-300/80">
            {message ??
              "A consulta demorou mais do que o esperado. Tente novamente em alguns instantes."}
          </p>
        </div>
        {onRetry && (
          <Button
            size="sm"
            variant="outline"
            className="border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/20 shrink-0"
            onClick={onRetry}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Tentar novamente
          </Button>
        )}
      </div>
    </div>
  );
}
