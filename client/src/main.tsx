import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

// Detecta se um erro é de timeout de query
const isTimeoutError = (error: unknown): boolean => {
  if (!(error instanceof TRPCClientError)) return false;
  return (
    error.message?.includes("maximum statement execution time exceeded") ||
    error.message?.includes("Query execution was interrupted") ||
    error.message?.includes("número máximo de tentativas atingido")
  );
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retenta automaticamente até 3x em caso de timeout, com backoff
      retry: (failureCount, error) => {
        if (isTimeoutError(error)) return failureCount < 3;
        return false;
      },
      retryDelay: (attemptIndex) => Math.min(3000 * (attemptIndex + 1), 15000),
      // Mantém dados em cache por mais tempo para evitar re-fetches
      staleTime: 2 * 60 * 1000, // 2 minutos
      gcTime: 5 * 60 * 1000,    // 5 minutos
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    // Não logar erros de timeout como erro — são tratados com retry automático
    if (!isTimeoutError(error)) {
      console.error("[API Query Error]", error);
    } else {
      console.warn("[API Query Timeout] Retentando query...", error?.message?.slice(0, 80));
    }
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
