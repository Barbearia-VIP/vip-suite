/**
 * InstrucoesPage.tsx — Instruções de Trabalho (SOPs) com geração por IA
 * Layout melhorado: drawer lateral com plano estruturado visualmente
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Plus, Trash2, Edit2, BookOpen, Sparkles, Loader2, Eye,
  Clock, Users, Target, AlertTriangle, Lightbulb, CheckCircle2,
  ChevronRight, X, Package, TrendingUp, Zap, FileText, User,
  ArrowRight, Circle, CheckCircle, ArrowLeft,
} from "lucide-react";
import { PermissionGuard } from "@/components/PermissionGuard";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type PlanoPassos = {
  numero: number; titulo: string; descricao: string;
  dicas?: string[]; alertas?: string[];
};
type Plano = {
  objetivo?: string; publicoAlvo?: string; frequencia?: string; tempoEstimado?: string;
  materiais?: string[]; passos?: PlanoPassos[];
  indicadoresSucesso?: string[]; errosComuns?: string[];
};
type Instrucao = {
  id: number; orgId: number; unitId: number | null; processoId: number | null;
  titulo: string; conteudo: string | null; plano: unknown;
  categoria: string | null; responsavelNome: string | null;
  status: "pendente" | "em_andamento" | "concluida" | "pausada";
  versao: string | null; geradoPorIA: number; createdAt: Date; updatedAt: Date;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pendente:     { label: "Pendente",     color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30", icon: <Circle className="w-3 h-3" /> },
  em_andamento: { label: "Em andamento", color: "text-blue-400",   bg: "bg-blue-400/10 border-blue-400/30",   icon: <Zap className="w-3 h-3" /> },
  concluida:    { label: "Concluída",    color: "text-green-400",  bg: "bg-green-400/10 border-green-400/30", icon: <CheckCircle className="w-3 h-3" /> },
  pausada:      { label: "Pausada",      color: "text-gray-400",   bg: "bg-gray-400/10 border-gray-400/30",   icon: <Circle className="w-3 h-3" /> },
};

// ── Componente PlanoView (layout rico) ────────────────────────────────────────
function PlanoView({ plano, titulo, categoria, responsavelNome, geradoPorIA, status, onStatusChange }: {
  plano: Plano;
  titulo: string;
  categoria?: string | null;
  responsavelNome?: string | null;
  geradoPorIA?: number;
  status?: string;
  onStatusChange?: (s: string) => void;
}) {
  const st = status ? (STATUS_CONFIG[status] ?? STATUS_CONFIG.pendente) : STATUS_CONFIG.pendente;
  return (
    <div className="space-y-6">
      {/* Badges e status */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {geradoPorIA ? (
            <Badge variant="outline" className="text-xs text-violet-400 border-violet-400/30 gap-1">
              <Sparkles className="w-3 h-3" /> Gerada por IA
            </Badge>
          ) : null}
          {categoria && <Badge variant="outline" className="text-xs">{categoria}</Badge>}
          {status && (
            <Badge variant="outline" className={`text-xs gap-1 ${st.color} ${st.bg}`}>
              {st.icon} {st.label}
            </Badge>
          )}
        </div>
        {responsavelNome && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
              {responsavelNome.charAt(0).toUpperCase()}
            </div>
            <span>Responsável: <span className="text-foreground font-medium">{responsavelNome}</span></span>
          </div>
        )}
        {onStatusChange && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Alterar status:</span>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => onStatusChange(key)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                  status === key ? `${cfg.color} ${cfg.bg} font-medium` : "text-muted-foreground border-white/10 hover:border-primary/40"
                }`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {plano.tempoEstimado && (
          <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-blue-400">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-semibold">Tempo</span>
            </div>
            <p className="text-sm font-bold text-foreground">{plano.tempoEstimado}</p>
          </div>
        )}
        {plano.frequencia && (
          <div className="rounded-xl bg-purple-500/5 border border-purple-500/20 p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-purple-400">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-semibold">Frequência</span>
            </div>
            <p className="text-sm font-bold text-foreground">{plano.frequencia}</p>
          </div>
        )}
        {plano.publicoAlvo && (
          <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-cyan-400">
              <Users className="w-4 h-4" />
              <span className="text-xs font-semibold">Executado por</span>
            </div>
            <p className="text-sm font-bold text-foreground">{plano.publicoAlvo}</p>
          </div>
        )}
        {plano.passos && (
          <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-xs font-semibold">Passos</span>
            </div>
            <p className="text-sm font-bold text-foreground">{plano.passos.length} etapas</p>
          </div>
        )}
      </div>

      {/* Objetivo */}
      {plano.objetivo && (
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
              <Target className="w-4 h-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-primary">Objetivo</h3>
          </div>
          <p className="text-sm text-foreground leading-relaxed">{plano.objetivo}</p>
        </div>
      )}

      {/* Materiais */}
      {plano.materiais && plano.materiais.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Package className="w-4 h-4 text-orange-400" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Materiais e Recursos</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {plano.materiais.map((m, i) => (
              <span key={i} className="text-xs px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300 font-medium">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Passos */}
      {plano.passos && plano.passos.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <ArrowRight className="w-4 h-4 text-violet-400" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Passo a Passo</h3>
          </div>
          <div className="space-y-3">
            {plano.passos.map((p, i) => (
              <div key={i} className="relative flex gap-4">
                {i < plano.passos!.length - 1 && (
                  <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-border" />
                )}
                <div className="shrink-0 w-10 h-10 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center z-10">
                  <span className="text-sm font-bold text-violet-400">{p.numero ?? i + 1}</span>
                </div>
                <div className="flex-1 pb-2">
                  <div className="rounded-xl border border-white/10 bg-card/50 p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-foreground">{p.titulo}</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">{p.descricao}</p>
                    {p.dicas && p.dicas.length > 0 && (
                      <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/20 p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
                          <span className="text-xs font-semibold text-yellow-400">Dicas</span>
                        </div>
                        <ul className="space-y-1">
                          {p.dicas.map((d, j) => (
                            <li key={j} className="text-xs text-muted-foreground flex items-start gap-2">
                              <ChevronRight className="w-3 h-3 shrink-0 mt-0.5 text-yellow-400/60" />{d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {p.alertas && p.alertas.length > 0 && (
                      <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                          <span className="text-xs font-semibold text-red-400">Atenção</span>
                        </div>
                        <ul className="space-y-1">
                          {p.alertas.map((a, j) => (
                            <li key={j} className="text-xs text-muted-foreground flex items-start gap-2">
                              <ChevronRight className="w-3 h-3 shrink-0 mt-0.5 text-red-400/60" />{a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Indicadores e Erros */}
      {((plano.indicadoresSucesso && plano.indicadoresSucesso.length > 0) ||
        (plano.errosComuns && plano.errosComuns.length > 0)) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plano.indicadoresSucesso && plano.indicadoresSucesso.length > 0 && (
            <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <h4 className="text-sm font-semibold text-green-400">Indicadores de Sucesso</h4>
              </div>
              <ul className="space-y-2">
                {plano.indicadoresSucesso.map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 mt-1.5" />{s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plano.errosComuns && plano.errosComuns.length > 0 && (
            <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h4 className="text-sm font-semibold text-red-400">Erros Comuns a Evitar</h4>
              </div>
              <ul className="space-y-2">
                {plano.errosComuns.map((e, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />{e}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function InstrucoesPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [location, navigate] = useLocation();

  const searchParams = new URLSearchParams(location.split("?")[1] ?? "");
  const processoIdParam = searchParams.get("processoId");
  const processoNomeParam = searchParams.get("processoNome");
  const responsavelNomeParam = searchParams.get("responsavelNome");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Instrucao | null>(null);
  const [viewingIT, setViewingIT] = useState<Instrucao | null>(null);
  const [search, setSearch] = useState("");
  const [showGenModal, setShowGenModal] = useState(false);
  const [genProcessoId, setGenProcessoId] = useState<number | null>(null);
  const [genProcessoNome, setGenProcessoNome] = useState("");
  const [genResponsavel, setGenResponsavel] = useState("");

  useEffect(() => {
    if (processoIdParam && processoNomeParam) {
      setGenProcessoId(Number(processoIdParam));
      setGenProcessoNome(decodeURIComponent(processoNomeParam));
      if (responsavelNomeParam) setGenResponsavel(decodeURIComponent(responsavelNomeParam));
      setShowGenModal(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processoIdParam, processoNomeParam, responsavelNomeParam]);

  const q = trpc.gestaoTotal.instrucoes.list.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id },
    { enabled: !!org?.id }
  );
  const instrucoes = (q.data ?? []) as unknown as Instrucao[];
  const filtered = instrucoes.filter(it => !search || it.titulo.toLowerCase().includes(search.toLowerCase()));

  const processosQ = trpc.gestaoTotal.processos.list.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id },
    { enabled: !!org?.id && showGenModal }
  );

  const saveM = trpc.gestaoTotal.instrucoes.save.useMutation({
    onSuccess: () => {
      utils.gestaoTotal.instrucoes.list.invalidate();
      toast.success("IT salva!");
      setShowForm(false);
      setEditing(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteM = trpc.gestaoTotal.instrucoes.delete.useMutation({
    onSuccess: () => { utils.gestaoTotal.instrucoes.list.invalidate(); toast.success("IT removida!"); },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusM = trpc.gestaoTotal.instrucoes.updateStatus?.useMutation?.({
    onSuccess: () => {
      utils.gestaoTotal.instrucoes.list.invalidate();
      utils.gestaoTotal.tarefas.list.invalidate();
    },
  });

  const generateM = trpc.gestaoTotal.instrucoes.generateFromProcesso.useMutation({
    onSuccess: (res) => {
      if (res.success) {
        utils.gestaoTotal.instrucoes.list.invalidate();
        toast.success("Instrução de Trabalho gerada com sucesso!");
        setShowGenModal(false);
        navigate("/gestao-total/instrucoes");
      } else {
        toast.error("Erro ao gerar instrução. Tente novamente.");
      }
    },
    onError: (e) => toast.error("Erro ao gerar IT: " + e.message),
  });

  const handleGenerate = () => {
    if (!org || !genProcessoNome.trim()) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processo = (processosQ.data as any[])?.find((p: any) => p.id === genProcessoId);
    const etapas = Array.isArray(processo?.etapas)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (processo.etapas as any[]).map((e: any) => ({ titulo: e.titulo, descricao: e.descricao }))
      : [];
    generateM.mutate({
      orgId: org.id,
      unitId: selectedUnit?.id,
      processoId: genProcessoId !== null ? genProcessoId : undefined,
      processoNome: genProcessoNome,
      processoDescricao: processo?.descricao ?? undefined,
      etapas,
      segmento: (org as any).segment ?? "Barbearia",
      responsavelNome: genResponsavel || undefined,
    });
  };

  const handleStatusChange = (it: Instrucao, newStatus: string) => {
    if (!org || !updateStatusM) return;
    updateStatusM.mutate({
      id: it.id,
      orgId: org.id,
      status: newStatus as Instrucao["status"],
    });
    setViewingIT(prev => prev ? { ...prev, status: newStatus as Instrucao["status"] } : null);
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Instruções de Trabalho</h1>
          <p className="text-sm text-muted-foreground">SOPs e procedimentos operacionais da unidade</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-violet-500/40 text-violet-400 hover:bg-violet-500/10"
            onClick={() => setShowGenModal(true)}
          >
            <Sparkles className="w-3.5 h-3.5" /> Gerar com IA
          </Button>
          <PermissionGuard moduleKey="gestao_total" sectionKey="instrucoes">
            <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setShowForm(true); }}>
              <Plus className="w-3.5 h-3.5" /> Nova IT
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Input
          placeholder="Buscar instrução..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm pl-9"
        />
        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      </div>

      {/* Lista de ITs */}
      {q.isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto">
            <BookOpen className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground font-medium">Nenhuma instrução de trabalho</p>
          <p className="text-sm text-muted-foreground/70">
            Acesse <strong>Processos</strong>, clique no botão <strong>IT</strong> e a IA gera automaticamente.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 mt-2"
            onClick={() => navigate("/gestao-total/processos")}
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Ir para Processos
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(it => {
            const st = STATUS_CONFIG[it.status] ?? STATUS_CONFIG.pendente;
            const plano = it.plano as Plano | null;
            return (
              <div className="glass-card group border-white/10 hover:border-primary/30 transition-all cursor-pointer bg-card/50 hover:bg-card/80" key={it.id} onClick={() => setViewingIT(it)}
              >
                <div className="p-6 pt-0 p-4 space-y-3">
                  {/* Título + badge IA */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug flex-1">{it.titulo}</h3>
                    {it.geradoPorIA ? (
                      <Badge variant="outline" className="text-xs text-violet-400 border-violet-400/30 gap-0.5 px-1.5 shrink-0">
                        <Sparkles className="w-2.5 h-2.5" /> IA
                      </Badge>
                    ) : null}
                  </div>

                  {/* Status + categoria */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${st.color} ${st.bg}`}>
                      {st.icon} {st.label}
                    </span>
                    {it.categoria && <span className="text-xs text-muted-foreground">{it.categoria}</span>}
                  </div>

                  {/* Responsável + tempo */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      {it.responsavelNome ? (
                        <>
                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                            {it.responsavelNome.charAt(0).toUpperCase()}
                          </div>
                          <span>{it.responsavelNome}</span>
                        </>
                      ) : (
                        <>
                          <User className="w-3.5 h-3.5" />
                          <span>Sem responsável</span>
                        </>
                      )}
                    </div>
                    {plano?.tempoEstimado && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{plano.tempoEstimado}</span>
                      </div>
                    )}
                  </div>

                  {/* Passos resumo */}
                  {plano?.passos && plano.passos.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-white/10">
                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                      <span>{plano.passos.length} passos</span>
                      {plano.materiais && plano.materiais.length > 0 && (
                        <>
                          <span className="text-border">·</span>
                          <Package className="w-3 h-3 text-orange-400" />
                          <span>{plano.materiais.length} materiais</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Ações hover */}
                  <div className="flex items-center justify-between pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 px-2 text-xs gap-1 text-primary hover:text-primary"
                      onClick={e => { e.stopPropagation(); setViewingIT(it); }}
                    >
                      <Eye className="w-3 h-3" /> Ver plano
                    </Button>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-primary"
                        onClick={e => { e.stopPropagation(); setEditing(it); setShowForm(true); }}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-destructive"
                        onClick={e => {
                          e.stopPropagation();
                          if (!org) return;
                          if (confirm("Remover esta instrução?")) deleteM.mutate({ id: it.id, orgId: org.id });
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Drawer lateral: Visualizar IT ── */}
      {viewingIT && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setViewingIT(null)} />
          <div className="w-full max-w-2xl bg-background border-l border-white/10 flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-5 border-b border-white/10 shrink-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4 text-violet-400" />
                  </div>
                  <h2 className="text-base font-bold text-foreground leading-snug line-clamp-2 font-display tracking-tight">{viewingIT.titulo}</h2>
                </div>
                <p className="text-xs text-muted-foreground pl-10">
                  Criada em {new Date(viewingIT.createdAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost" size="sm" className="h-8 w-8 p-0"
                  onClick={() => { setEditing(viewingIT); setShowForm(true); setViewingIT(null); }}
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setViewingIT(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {/* Conteúdo */}
            <div className="flex-1 overflow-y-auto p-5">
              {viewingIT.plano ? (
                <PlanoView
                  plano={viewingIT.plano as Plano}
                  titulo={viewingIT.titulo}
                  categoria={viewingIT.categoria}
                  responsavelNome={viewingIT.responsavelNome}
                  geradoPorIA={viewingIT.geradoPorIA}
                  status={viewingIT.status}
                  onStatusChange={updateStatusM ? (s) => handleStatusChange(viewingIT, s) : undefined}
                />
              ) : viewingIT.conteudo ? (
                <div className="rounded-xl border border-white/10 bg-card/50 p-4">
                  <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">{viewingIT.conteudo}</pre>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Sem conteúdo disponível.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Criar/Editar IT manualmente ── */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Instrução" : "Nova Instrução de Trabalho"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Título *</Label>
              <Input id="it-titulo" defaultValue={editing?.titulo ?? ""} placeholder="Nome da instrução" className="text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Categoria</Label>
                <Input id="it-categoria" defaultValue={editing?.categoria ?? ""} placeholder="Ex: Atendimento" className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Responsável</Label>
                <Input id="it-responsavel" defaultValue={editing?.responsavelNome ?? ""} placeholder="Nome" className="text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Conteúdo</Label>
              <Textarea
                id="it-conteudo"
                defaultValue={editing?.conteudo ?? ""}
                placeholder="Descreva a instrução..."
                className="text-sm min-h-[120px] resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditing(null); }}>Cancelar</Button>
              <Button
                size="sm"
                disabled={saveM.isPending}
                onClick={() => {
                  if (!org) return;
                  const titulo = (document.getElementById("it-titulo") as HTMLInputElement)?.value ?? "";
                  const categoria = (document.getElementById("it-categoria") as HTMLInputElement)?.value ?? "";
                  const responsavelNome = (document.getElementById("it-responsavel") as HTMLInputElement)?.value ?? "";
                  const conteudo = (document.getElementById("it-conteudo") as HTMLTextAreaElement)?.value ?? "";
                  if (!titulo.trim()) { toast.error("Título obrigatório"); return; }
                  saveM.mutate({ id: editing?.id, orgId: org.id, unitId: selectedUnit?.id, titulo, categoria: categoria || undefined, responsavelNome: responsavelNome || undefined, conteudo: conteudo || undefined });
                }}
              >
                {saveM.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Gerar IT por IA ── */}
      <Dialog open={showGenModal} onOpenChange={v => { setShowGenModal(v); if (!v) navigate("/gestao-total/instrucoes"); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-400" /> Gerar Instrução de Trabalho
            </DialogTitle>
            <DialogDescription>
              A IA criará um plano detalhado passo a passo para o processo selecionado.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-4">
            {genProcessoNome ? (
              <div className="rounded-xl bg-violet-500/5 border border-violet-500/30 p-3">
                <p className="text-xs text-muted-foreground font-medium mb-1">Processo selecionado</p>
                <p className="text-sm font-semibold text-foreground">{genProcessoNome}</p>
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">Processo *</Label>
                <Input
                  value={genProcessoNome}
                  onChange={e => setGenProcessoNome(e.target.value)}
                  placeholder="Nome do processo..."
                  className="text-sm"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Responsável <span className="text-muted-foreground">(opcional)</span></Label>
              <Input
                value={genResponsavel}
                onChange={e => setGenResponsavel(e.target.value)}
                placeholder="Ex: Barbeiro, Atendente..."
                className="text-sm"
              />
            </div>
            {generateM.isPending && (
              <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-4 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-violet-400 animate-spin shrink-0" />
                <div>
                  <p className="text-sm font-medium text-violet-300">Gerando Instrução de Trabalho...</p>
                  <p className="text-xs text-muted-foreground">Aguarde alguns segundos.</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setShowGenModal(false); navigate("/gestao-total/instrucoes"); }}
              disabled={generateM.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generateM.isPending || !genProcessoNome.trim()}
              className="gap-2 bg-violet-600 hover:bg-violet-700"
            >
              {generateM.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
                : <><Sparkles className="w-4 h-4" /> Gerar Instrução</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
