/**
 * InstrucoesPage.tsx — Instruções de Trabalho (SOPs) com geração por IA
 * Fluxo: Recebe processoId via query param → Gera IT com IA → Exibe plano detalhado
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Plus, Trash2, Edit2, BookOpen, Sparkles, Loader2, Eye, ChevronRight,
  Clock, Users, Target, AlertTriangle, Lightbulb, CheckCircle2, ArrowLeft,
} from "lucide-react";

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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "text-yellow-400 border-yellow-400/30" },
  em_andamento: { label: "Em andamento", color: "text-blue-400 border-blue-400/30" },
  concluida: { label: "Concluída", color: "text-green-400 border-green-400/30" },
  pausada: { label: "Pausada", color: "text-gray-400 border-gray-400/30" },
};

function PlanoView({ plano }: { plano: Plano }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {plano.objetivo && (
          <div className="col-span-2 rounded-lg bg-primary/5 border border-primary/20 p-3">
            <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1"><Target className="w-3 h-3" /> Objetivo</p>
            <p className="text-sm text-foreground">{plano.objetivo}</p>
          </div>
        )}
        {plano.publicoAlvo && (
          <div className="rounded-lg bg-muted/30 border border-border p-3">
            <p className="text-xs font-semibold mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> Público-alvo</p>
            <p className="text-xs text-muted-foreground">{plano.publicoAlvo}</p>
          </div>
        )}
        {plano.frequencia && (
          <div className="rounded-lg bg-muted/30 border border-border p-3">
            <p className="text-xs font-semibold mb-1">Frequência</p>
            <p className="text-xs text-muted-foreground">{plano.frequencia}</p>
          </div>
        )}
        {plano.tempoEstimado && (
          <div className="rounded-lg bg-muted/30 border border-border p-3">
            <p className="text-xs font-semibold mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Tempo estimado</p>
            <p className="text-xs text-muted-foreground">{plano.tempoEstimado}</p>
          </div>
        )}
      </div>
      {plano.materiais && plano.materiais.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2">Materiais necessários</p>
          <div className="flex flex-wrap gap-1.5">
            {plano.materiais.map((m, i) => (
              <Badge key={i} variant="outline" className="text-xs">{m}</Badge>
            ))}
          </div>
        </div>
      )}
      {plano.passos && plano.passos.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-3">Passo a passo</p>
          <div className="space-y-3">
            {plano.passos.map((p, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {p.numero ?? i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold mb-1">{p.titulo}</p>
                    <p className="text-xs text-muted-foreground mb-2">{p.descricao}</p>
                    {p.dicas && p.dicas.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-yellow-400 flex items-center gap-1 mb-1"><Lightbulb className="w-3 h-3" /> Dicas</p>
                        <ul className="space-y-0.5">
                          {p.dicas.map((d, j) => <li key={j} className="text-xs text-muted-foreground flex items-start gap-1"><ChevronRight className="w-3 h-3 shrink-0 mt-0.5" />{d}</li>)}
                        </ul>
                      </div>
                    )}
                    {p.alertas && p.alertas.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-red-400 flex items-center gap-1 mb-1"><AlertTriangle className="w-3 h-3" /> Atenção</p>
                        <ul className="space-y-0.5">
                          {p.alertas.map((a, j) => <li key={j} className="text-xs text-muted-foreground flex items-start gap-1"><ChevronRight className="w-3 h-3 shrink-0 mt-0.5" />{a}</li>)}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {plano.indicadoresSucesso && plano.indicadoresSucesso.length > 0 && (
          <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-3">
            <p className="text-xs font-semibold text-green-400 mb-2 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Indicadores de Sucesso</p>
            <ul className="space-y-1">
              {plano.indicadoresSucesso.map((s, i) => <li key={i} className="text-xs text-muted-foreground flex items-start gap-1"><ChevronRight className="w-3 h-3 shrink-0 mt-0.5" />{s}</li>)}
            </ul>
          </div>
        )}
        {plano.errosComuns && plano.errosComuns.length > 0 && (
          <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3">
            <p className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Erros Comuns</p>
            <ul className="space-y-1">
              {plano.errosComuns.map((e, i) => <li key={i} className="text-xs text-muted-foreground flex items-start gap-1"><ChevronRight className="w-3 h-3 shrink-0 mt-0.5" />{e}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

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
    onSuccess: () => { utils.gestaoTotal.instrucoes.list.invalidate(); toast.success("IT salva!"); setShowForm(false); setEditing(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteM = trpc.gestaoTotal.instrucoes.delete.useMutation({
    onSuccess: () => { utils.gestaoTotal.instrucoes.list.invalidate(); toast.success("IT removida!"); },
    onError: (e) => toast.error(e.message),
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
    onError: (e) => toast.error(e.message),
  });

  const handleGenerate = () => {
    if (!org || !genProcessoId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processo = (processosQ.data as any[])?.find((p: any) => p.id === genProcessoId);
    const etapas = Array.isArray(processo?.etapas)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (processo.etapas as any[]).map((e: any) => ({ titulo: e.titulo, descricao: e.descricao }))
      : [];
    generateM.mutate({
      orgId: org.id, unitId: selectedUnit?.id,
      processoId: genProcessoId,
      processoNome: genProcessoNome,
      processoDescricao: processo?.descricao ?? undefined,
      etapas,
      segmento: org.segment ?? "Barbearia",
      responsavelNome: genResponsavel || undefined,
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Instruções de Trabalho</h1>
          <p className="text-sm text-muted-foreground">{instrucoes.length} instrução{instrucoes.length !== 1 ? "ões" : ""} cadastrada{instrucoes.length !== 1 ? "s" : ""}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { setShowForm(true); setEditing(null); }} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Nova IT
        </Button>
      </div>

      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar instruções..." className="max-w-sm text-sm" />

      {!q.isLoading && instrucoes.length === 0 && (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="p-8 text-center">
            <BookOpen className="w-10 h-10 text-violet-400 mx-auto mb-3" />
            <h3 className="font-semibold text-foreground mb-1">Nenhuma instrução de trabalho ainda</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Acesse a aba <strong>Processos</strong>, clique no botão <strong>IT</strong> em qualquer processo e a IA gerará a instrução automaticamente.
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate("/gestao-total/processos")} className="gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Ir para Processos
            </Button>
          </CardContent>
        </Card>
      )}

      {q.isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(it => {
            const plano = it.plano as Plano | null;
            const st = STATUS_LABELS[it.status] ?? STATUS_LABELS.pendente;
            return (
              <Card key={it.id} className="bg-card border-border hover:border-primary/30 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-sm">{it.titulo}</CardTitle>
                        {it.geradoPorIA ? <Badge variant="outline" className="text-xs text-violet-400 border-violet-400/30">IA</Badge> : null}
                        <Badge variant="outline" className={"text-xs " + st.color}>{st.label}</Badge>
                        {it.categoria && <Badge variant="outline" className="text-xs">{it.categoria}</Badge>}
                        {it.versao && <span className="text-xs text-muted-foreground">v{it.versao}</span>}
                      </div>
                      {it.responsavelNome && <p className="text-xs text-muted-foreground mt-1">Responsável: {it.responsavelNome}</p>}
                      {plano?.tempoEstimado && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3" />{plano.tempoEstimado}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewingIT(it)} title="Ver instrução"><Eye className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditing(it); setShowForm(true); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-300" onClick={() => { if (!org) return; deleteM.mutate({ id: it.id, orgId: org.id }); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                </CardHeader>
                {plano?.passos && plano.passos.length > 0 && (
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground">{plano.passos.length} passo{plano.passos.length !== 1 ? "s" : ""} detalhado{plano.passos.length !== 1 ? "s" : ""}</p>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Formulário manual */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar IT" : "Nova Instrução de Trabalho"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Título *</Label>
              <Input defaultValue={editing?.titulo ?? ""} id="it-titulo" placeholder="Ex: IT - Abertura da unidade" className="text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Categoria</Label>
              <Input defaultValue={editing?.categoria ?? ""} id="it-categoria" placeholder="Ex: Operacional" className="text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Responsável</Label>
              <Input defaultValue={editing?.responsavelNome ?? ""} id="it-responsavel" placeholder="Nome do responsável" className="text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Conteúdo</Label>
              <Textarea defaultValue={editing?.conteudo ?? ""} id="it-conteudo" placeholder="Descreva a instrução..." className="text-sm min-h-[100px] resize-none" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditing(null); }}>Cancelar</Button>
              <Button size="sm" onClick={() => {
                if (!org) return;
                const titulo = (document.getElementById("it-titulo") as HTMLInputElement)?.value ?? "";
                const categoria = (document.getElementById("it-categoria") as HTMLInputElement)?.value ?? "";
                const responsavelNome = (document.getElementById("it-responsavel") as HTMLInputElement)?.value ?? "";
                const conteudo = (document.getElementById("it-conteudo") as HTMLTextAreaElement)?.value ?? "";
                if (!titulo.trim()) { toast.error("Título obrigatório"); return; }
                saveM.mutate({ id: editing?.id, orgId: org.id, unitId: selectedUnit?.id, titulo, categoria: categoria || undefined, responsavelNome: responsavelNome || undefined, conteudo: conteudo || undefined });
              }}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Visualizar IT completa */}
      <Dialog open={!!viewingIT} onOpenChange={v => !v && setViewingIT(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              {viewingIT?.titulo}
            </DialogTitle>
            {viewingIT && (
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {viewingIT.geradoPorIA ? <Badge variant="outline" className="text-xs text-violet-400 border-violet-400/30">IA</Badge> : null}
                {viewingIT.categoria && <Badge variant="outline" className="text-xs">{viewingIT.categoria}</Badge>}
                {viewingIT.responsavelNome && <span className="text-xs text-muted-foreground">Responsável: {viewingIT.responsavelNome}</span>}
              </div>
            )}
          </DialogHeader>
          {viewingIT && (
            <div className="py-2">
              {viewingIT.plano ? (
                <PlanoView plano={viewingIT.plano as Plano} />
              ) : viewingIT.conteudo ? (
                <pre className="whitespace-pre-wrap text-sm text-foreground">{viewingIT.conteudo}</pre>
              ) : (
                <p className="text-sm text-muted-foreground">Sem conteúdo disponível.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Gerar IT por IA */}
      <Dialog open={showGenModal} onOpenChange={v => { setShowGenModal(v); if (!v) navigate("/gestao-total/instrucoes"); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-400" /> Gerar Instrução de Trabalho
            </DialogTitle>
            <DialogDescription>
              A IA gerará um plano detalhado passo a passo para este processo.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <div className="rounded-lg bg-violet-500/5 border border-violet-500/30 p-3">
              <p className="text-xs text-muted-foreground font-medium mb-1">Processo selecionado</p>
              <p className="text-sm font-semibold text-foreground">{genProcessoNome}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Responsável pela execução <span className="text-muted-foreground">(opcional)</span></Label>
              <Input value={genResponsavel} onChange={e => setGenResponsavel(e.target.value)}
                placeholder="Ex: Barbeiro, Atendente..." className="text-sm" />
            </div>
            <p className="text-xs text-muted-foreground">
              A IA criará uma instrução completa com objetivo, materiais, passo a passo detalhado, dicas, alertas e indicadores de sucesso.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowGenModal(false); navigate("/gestao-total/instrucoes"); }}>Cancelar</Button>
            <Button onClick={handleGenerate} disabled={generateM.isPending} className="gap-2 bg-violet-600 hover:bg-violet-700">
              {generateM.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Gerando...</> : <><Sparkles className="w-4 h-4" />Gerar Instrução</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
