import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/contexts/AppContext";
import PageHeader from "@/components/PageHeader";
import { FileText, Search, ChevronLeft, ChevronRight, MessageCircle, Activity, AlertTriangle, Zap } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DatePicker } from "@/components/DatePicker";

const LOG_TYPES = [
  { value: "all", label: "Todos os tipos" },
  { value: "comment_reply", label: "Resposta a comentário" },
  { value: "story_reply", label: "Resposta a story" },
  { value: "welcome", label: "Boas-vindas" },
  { value: "error", label: "Erro" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Aviso" },
];

const typeColor: Record<string, string> = {
  comment_reply: "bg-green-500/10 text-green-400 border-green-500/20",
  story_reply: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  welcome: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  error: "bg-red-500/10 text-red-400 border-red-500/20",
  info: "bg-muted/50 text-muted-foreground border-white/10",
  warning: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

const typeIcon: Record<string, React.ReactNode> = {
  comment_reply: <MessageCircle className="w-3.5 h-3.5" />,
  story_reply: <Activity className="w-3.5 h-3.5" />,
  error: <AlertTriangle className="w-3.5 h-3.5" />,
  warning: <AlertTriangle className="w-3.5 h-3.5" />,
  info: <Zap className="w-3.5 h-3.5" />,
};

export default function LogsPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const logsQuery = trpc.igLogs.getList.useQuery({
    unitId,
    page,
    pageSize: 50,
    type: typeFilter !== "all" ? typeFilter as "comment_reply" | "story_reply" | "welcome" | "error" | "info" | "warning" : undefined,
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }, { enabled: unitId > 0 });

  const logs = logsQuery.data?.rows ?? [];
  const total = logsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  if (!unitId) {
    return (
      <div className="p-6">
        <PageHeader title="Histórico de Logs" description="Selecione uma unidade" />
        <div className="glass-card mt-6 border-white/10 bg-white/5">
          <div className="p-6 pt-0 py-12 text-center text-muted-foreground">Selecione uma unidade no seletor do topo.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader title="Histórico de Logs" description={`${total} registros encontrados`} />

      {/* Filtros */}
      <div className="glass-card bg-white/5 border-white/10">
        <div className="p-6 pt-0 p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar na mensagem..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOG_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1); }} placeholder="De" className="w-36" />
            <DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setPage(1); }} placeholder="Até" min={dateFrom} className="w-36" />
          </div>
        </div>
      </div>

      {/* Lista de logs */}
      <div className="glass-card bg-white/5 border-white/10">
        <div className="p-6 pb-2 pb-2">
          <h3 className="font-semibold text-foreground text-sm font-medium flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Logs de Atividade
          </h3>
        </div>
        <div className="p-6 pt-0 p-0">
          {logsQuery.isLoading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">Nenhum log encontrado com os filtros aplicados</div>
          ) : (
            <div className="divide-y divide-border">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/20 transition-colors">
                  <span className={`mt-0.5 flex-shrink-0 ${typeColor[log.type]?.split(" ")[1] ?? "text-muted-foreground"}`}>
                    {typeIcon[log.type] ?? <Zap className="w-3.5 h-3.5" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{log.message}</p>
                    {log.metadata != null && (
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{typeof log.metadata === 'object' ? JSON.stringify(log.metadata) : String(log.metadata)}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-xs flex-shrink-0 ${typeColor[log.type] ?? ""}`}>
                    {log.type.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages} ({total} registros)
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
