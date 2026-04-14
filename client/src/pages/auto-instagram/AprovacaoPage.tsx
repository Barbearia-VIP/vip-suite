import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/AppContext";
import PageHeader from "@/components/PageHeader";
import {
  MessageCircle,
  Bot,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  CheckCircle2,
  Zap,
  History,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

function toDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (!String(d).endsWith("Z") && !String(d).includes("+")) {
    return new Date(String(d).replace(" ", "T") + "Z");
  }
  return new Date(d);
}

function timeAgo(d: string | Date | null | undefined): string {
  const date = toDate(d);
  if (!date) return "—";
  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
}

function formatDate(d: string | Date | null | undefined): string {
  const date = toDate(d);
  if (!date) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "auto_approved") {
    return (
      <Badge variant="outline" className="text-blue-400 border-blue-400/30 bg-blue-400/10 gap-1 text-xs">
        <Zap className="w-3 h-3" /> Automático
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-green-400 border-green-400/30 bg-green-400/10 gap-1 text-xs">
      <CheckCircle2 className="w-3 h-3" /> Aprovado
    </Badge>
  );
}

const PAGE_SIZE = 20;

export default function HistoricoRespostasPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const historyQuery = trpc.igApproval.getHistory.useQuery(
    { unitId, page, pageSize: PAGE_SIZE, search: search || undefined },
    { enabled: unitId > 0, refetchInterval: 30000 }
  );

  const rows = historyQuery.data?.rows ?? [];
  const total = historyQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  if (!unitId) {
    return (
      <div className="p-6">
        <PageHeader title="Histórico de Respostas" description="Selecione uma unidade" />
        <div className="glass-card mt-6 border-white/10 bg-white/5">
          <div className="p-12 text-center text-muted-foreground">Selecione uma unidade no seletor do topo.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Histórico de Respostas"
        description={`${total.toLocaleString("pt-BR")} resposta${total !== 1 ? "s" : ""} enviada${total !== 1 ? "s" : ""} pelo sistema`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => historyQuery.refetch()}
            disabled={historyQuery.isFetching}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${historyQuery.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        }
      />

      {/* Barra de busca */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por usuário ou comentário..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={handleSearch}>
          Buscar
        </Button>
        {search && (
          <Button
            variant="ghost"
            onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}
          >
            Limpar
          </Button>
        )}
      </div>

      {/* Lista de respostas */}
      {historyQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass-card bg-white/5 border-white/10 p-4 animate-pulse">
              <div className="h-4 bg-muted/30 rounded w-1/4 mb-3" />
              <div className="h-3 bg-muted/20 rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted/20 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="py-16 text-center">
            <History className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-foreground font-medium">
              {search ? "Nenhum resultado encontrado" : "Nenhuma resposta enviada ainda"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {search
                ? "Tente buscar por outro termo."
                : "As respostas automáticas aparecerão aqui assim que o bot processar comentários."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((item) => (
            <div
              key={item.id}
              className="glass-card bg-white/5 border-white/10 rounded-xl overflow-hidden"
            >
              <div className="p-4 space-y-3">
                {/* Cabeçalho: autor + data + tipo */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <User className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {item.authorName ?? "Usuário desconhecido"}
                    </span>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={formatDate(item.createdAt)}>
                    <Clock className="w-3 h-3" />
                    {timeAgo(item.createdAt)}
                  </div>
                </div>

                {/* Comentário original */}
                <div className="rounded-lg bg-muted/20 border border-border/40 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Comentário
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">
                    {item.commentText ?? <span className="italic text-muted-foreground">Sem texto</span>}
                  </p>
                </div>

                {/* Resposta do sistema */}
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-medium text-primary uppercase tracking-wide">
                      Resposta do sistema
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">
                    {item.suggestedReply ?? <span className="italic text-muted-foreground">Sem resposta registrada</span>}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages} — {total.toLocaleString("pt-BR")} registros
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || historyQuery.isFetching}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || historyQuery.isFetching}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
