/**
 * IndicadoresPage.tsx — Indicadores estratégicos com CRUD e progresso visual
 * Alinhado com router: list, save, delete
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, TrendingUp, TrendingDown, Minus } from "lucide-react";

type Indicador = {
  id: number; nome: string; descricao: string | null;
  tipo: "numero" | "percentual" | "moeda" | "tempo";
  valorAtual: string | null; meta: string | null;
  periodo: string | null; tendencia: string | null; cor: string | null;
  orgId: number; unitId: number | null;
  updatedAt: Date;
};

function TrendIcon({ atual, meta }: { atual: string | null; meta: string | null }) {
  if (!atual || !meta) return <Minus className="w-4 h-4 text-muted-foreground" />;
  const a = parseFloat(atual), m = parseFloat(meta);
  if (a >= m) return <TrendingUp className="w-4 h-4 text-green-400" />;
  if (a >= m * 0.8) return <Minus className="w-4 h-4 text-yellow-400" />;
  return <TrendingDown className="w-4 h-4 text-red-400" />;
}

function ProgressBar({ atual, meta, tipo }: { atual: string | null; meta: string | null; tipo: string }) {
  if (!atual || !meta) return null;
  const pct = Math.min(100, Math.round((parseFloat(atual) / parseFloat(meta)) * 100));
  const color = pct >= 100 ? "bg-green-500" : pct >= 80 ? "bg-yellow-500" : "bg-red-500";
  function fmt(v: string) {
    const n = parseFloat(v);
    if (tipo === "moeda") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
    if (tipo === "percentual") return `${n}%`;
    return v;
  }
  return (
    <div className="space-y-1 mt-2">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Atual: {fmt(atual)}</span>
        <span>Meta: {fmt(meta)}</span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-right text-muted-foreground">{pct}% da meta</p>
    </div>
  );
}

function FormIndicador({ initial, onSave, onClose }: {
  initial?: Partial<Indicador>;
  onSave: (data: {
    nome: string; descricao?: string; tipo: "numero" | "percentual" | "moeda" | "tempo";
    valorAtual?: number; meta?: number; periodo?: string;
  }) => void;
  onClose: () => void;
}) {
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [tipo, setTipo] = useState<"numero" | "percentual" | "moeda" | "tempo">(initial?.tipo ?? "numero");
  const [valorAtual, setValorAtual] = useState(initial?.valorAtual ?? "");
  const [meta, setMeta] = useState(initial?.meta ?? "");
  const [periodo, setPeriodo] = useState(initial?.periodo ?? "");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Nome *</Label>
        <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Taxa de retenção de clientes" className="text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Descrição</Label>
        <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Como este indicador é calculado..." className="text-sm min-h-[60px]" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo</Label>
          <Select value={tipo} onValueChange={v => setTipo(v as typeof tipo)}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="numero">Número</SelectItem>
              <SelectItem value="percentual">Percentual</SelectItem>
              <SelectItem value="moeda">Moeda (R$)</SelectItem>
              <SelectItem value="tempo">Tempo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Período (ex: 2026-03)</Label>
          <Input value={periodo} onChange={e => setPeriodo(e.target.value)} placeholder="AAAA-MM" className="text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Valor Atual</Label>
          <Input type="number" value={valorAtual} onChange={e => setValorAtual(e.target.value)} placeholder="0" className="text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Meta</Label>
          <Input type="number" value={meta} onChange={e => setMeta(e.target.value)} placeholder="0" className="text-sm" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={() => onSave({
          nome, descricao: descricao || undefined, tipo,
          valorAtual: valorAtual ? parseFloat(valorAtual) : undefined,
          meta: meta ? parseFloat(meta) : undefined,
          periodo: periodo || undefined,
        })} disabled={!nome.trim()}>
          Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function IndicadoresPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Indicador | null>(null);
  const [filterTipo, setFilterTipo] = useState("todos");

  const q = trpc.gestaoTotal.indicadores.list.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id },
    { enabled: !!org?.id }
  );
  const indicadores = (q.data ?? []) as unknown as Indicador[];
  const filtered = filterTipo === "todos" ? indicadores : indicadores.filter(i => i.tipo === filterTipo);

  const saveM = trpc.gestaoTotal.indicadores.save.useMutation({
    onSuccess: () => { utils.gestaoTotal.indicadores.list.invalidate(); toast.success("Indicador salvo!"); setShowForm(false); setEditing(null); },
    onError: () => toast.error("Erro ao salvar"),
  });
  const deleteM = trpc.gestaoTotal.indicadores.delete.useMutation({
    onSuccess: () => { utils.gestaoTotal.indicadores.list.invalidate(); toast.success("Removido"); },
    onError: () => toast.error("Erro ao remover"),
  });

  const TIPOS = ["todos", "numero", "percentual", "moeda", "tempo"];
  const TIPO_LABELS: Record<string, string> = { todos: "Todos", numero: "Número", percentual: "Percentual", moeda: "Moeda", tempo: "Tempo" };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Indicadores Estratégicos</h1>
          <p className="text-sm text-muted-foreground">{indicadores.length} indicadores cadastrados</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Novo Indicador
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TIPOS.map(t => (
          <button key={t} onClick={() => setFilterTipo(t)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              filterTipo === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
            }`}>
            {TIPO_LABELS[t]}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <TrendingUp className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum indicador cadastrado</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>Criar indicador</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(ind => (
            <Card key={ind.id} className="bg-card border-border hover:border-primary/40 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <CardTitle className="text-sm truncate">{ind.nome}</CardTitle>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">{ind.tipo} {ind.periodo && `• ${ind.periodo}`}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <TrendIcon atual={ind.valorAtual} meta={ind.meta} />
                    <button onClick={() => setEditing(ind)} className="text-muted-foreground hover:text-foreground p-0.5">
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteM.mutate({ id: ind.id, orgId: ind.orgId })} className="text-muted-foreground hover:text-red-400 p-0.5">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ProgressBar atual={ind.valorAtual} meta={ind.meta} tipo={ind.tipo} />
                {ind.descricao && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{ind.descricao}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo Indicador</DialogTitle></DialogHeader>
          <FormIndicador
            onSave={d => { if (!org?.id) return; saveM.mutate({ orgId: org.id, unitId: selectedUnit?.id, ...d }); }}
            onClose={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Indicador</DialogTitle></DialogHeader>
          {editing && <FormIndicador
            initial={editing}
            onSave={d => saveM.mutate({ id: editing.id, orgId: editing.orgId, ...d })}
            onClose={() => setEditing(null)}
          />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
