/**
 * MarketingPage.tsx — Gestão de campanhas de marketing
 * Schema: id, orgId, unitId, nome, descricao, canal, status, budget, gasto, alcance, cliques, conversoes, dataInicio, dataFim
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, Megaphone } from "lucide-react";

type Campanha = {
  id: number; orgId: number; unitId: number | null;
  nome: string; descricao: string | null;
  canal: "instagram" | "facebook" | "whatsapp" | "email" | "google" | "offline" | "outro";
  status: "planejamento" | "ativa" | "pausada" | "concluida";
  budget: string | null; gasto: string | null;
  alcance: number | null; cliques: number | null; conversoes: number | null;
  dataInicio: Date | null; dataFim: Date | null;
  createdAt: Date; updatedAt: Date;
};
const STATUS_COLORS: Record<string, string> = {
  planejamento: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  ativa: "bg-green-500/20 text-green-400 border-green-500/30",
  pausada: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  concluida: "bg-muted text-muted-foreground border-border",
};
const CANAL_ICONS: Record<string, string> = {
  instagram: "IG", facebook: "FB", whatsapp: "WA", email: "EM", google: "GG", offline: "OF", outro: "OT",
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

function FormCampanha({ initial, onSave, onClose }: {
  initial?: Partial<Campanha>;
  onSave: (d: { nome: string; descricao?: string; canal: "instagram"|"facebook"|"whatsapp"|"email"|"google"|"offline"|"outro"; status: "planejamento"|"ativa"|"pausada"|"concluida"; budget?: number; gasto?: number; alcance?: number; cliques?: number; conversoes?: number; dataInicio?: string; dataFim?: string }) => void;
  onClose: () => void;
}) {
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [canal, setCanal] = useState<"instagram"|"facebook"|"whatsapp"|"email"|"google"|"offline"|"outro">(initial?.canal ?? "instagram");
  const [status, setStatus] = useState<"planejamento"|"ativa"|"pausada"|"concluida">(initial?.status ?? "planejamento");
  const [budget, setBudget] = useState(initial?.budget ?? "");
  const [gasto, setGasto] = useState(initial?.gasto ?? "");
  const [dataInicio, setDataInicio] = useState(initial?.dataInicio ? new Date(initial.dataInicio).toISOString().split("T")[0] : "");
  const [dataFim, setDataFim] = useState(initial?.dataFim ? new Date(initial.dataFim).toISOString().split("T")[0] : "");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label className="text-xs">Nome da Campanha *</Label>
        <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Promoção Dia dos Pais" className="text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Canal</Label>
          <Select value={canal} onValueChange={v => setCanal(v as typeof canal)}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["instagram", "facebook", "whatsapp", "email", "google", "offline", "outro"].map(c => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={v => setStatus(v as typeof status)}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="planejamento">Planejamento</SelectItem>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="pausada">Pausada</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Budget (R$)</Label>
          <Input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0" className="text-sm" />
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Gasto (R$)</Label>
          <Input type="number" value={gasto} onChange={e => setGasto(e.target.value)} placeholder="0" className="text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Data Início</Label>
          <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="text-sm" />
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Data Fim</Label>
          <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="text-sm" />
        </div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Descrição / Objetivo</Label>
        <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Objetivo da campanha..." className="text-sm min-h-[60px]" />
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={() => onSave({ nome, descricao: descricao || undefined, canal, status, budget: budget ? parseFloat(budget) : undefined, gasto: gasto ? parseFloat(gasto) : undefined, dataInicio: dataInicio || undefined, dataFim: dataFim || undefined })} disabled={!nome.trim()}>
          Salvar
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function MarketingPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campanha | null>(null);
  const [filterStatus, setFilterStatus] = useState("todos");

  const q = trpc.gestaoTotal.marketing.list.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id, status: filterStatus !== "todos" ? filterStatus : undefined },
    { enabled: !!org?.id }
  );
  const campanhas = (q.data ?? []) as unknown as Campanha[];

  const saveM = trpc.gestaoTotal.marketing.save.useMutation({
    onSuccess: () => { utils.gestaoTotal.marketing.list.invalidate(); toast.success("Campanha salva!"); setShowForm(false); setEditing(null); },
    onError: () => toast.error("Erro ao salvar"),
  });
  const deleteM = trpc.gestaoTotal.marketing.delete.useMutation({
    onSuccess: () => { utils.gestaoTotal.marketing.list.invalidate(); toast.success("Removida"); },
    onError: () => toast.error("Erro ao remover"),
  });

  const ativas = campanhas.filter(c => c.status === "ativa").length;
  const totalBudget = campanhas.reduce((s, c) => s + Number(c.budget ?? 0), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Marketing</h1>
          <p className="text-sm text-muted-foreground">{ativas} campanhas ativas • {fmt(totalBudget)} budget total</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Nova Campanha
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["todos", "planejamento", "ativa", "pausada", "concluida"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} className={`text-xs px-3 py-1 rounded-full border transition-colors capitalize ${filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>{s}</button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)}</div>
      ) : campanhas.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <Megaphone className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma campanha cadastrada</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>Criar campanha</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campanhas.map(c => (
            <Card key={c.id} className="bg-card border-border hover:border-primary/40 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="w-7 h-7 rounded bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {CANAL_ICONS[c.canal] ?? "??"}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-sm truncate">{c.nome}</CardTitle>
                      <p className="text-xs text-muted-foreground capitalize mt-0.5">{c.canal}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <Badge variant="outline" className={`text-xs ${STATUS_COLORS[c.status] ?? ""}`}>{c.status}</Badge>
                    <button onClick={() => setEditing(c)} className="text-muted-foreground hover:text-foreground p-0.5 ml-1"><Edit2 className="w-3 h-3" /></button>
                    <button onClick={() => deleteM.mutate({ id: c.id, orgId: c.orgId })} className="text-muted-foreground hover:text-red-400 p-0.5"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-2">
                  {c.budget && <div><p className="text-xs text-muted-foreground">Budget</p><p className="text-sm font-semibold">{fmt(Number(c.budget))}</p></div>}
                  {c.gasto && <div><p className="text-xs text-muted-foreground">Gasto</p><p className="text-sm font-semibold">{fmt(Number(c.gasto))}</p></div>}
                  {c.alcance && <div><p className="text-xs text-muted-foreground">Alcance</p><p className="text-sm font-semibold">{c.alcance.toLocaleString("pt-BR")}</p></div>}
                  {c.conversoes && <div><p className="text-xs text-muted-foreground">Conversões</p><p className="text-sm font-semibold text-green-400">{c.conversoes}</p></div>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Nova Campanha</DialogTitle></DialogHeader>
          <FormCampanha onSave={d => { if (!org?.id) return; saveM.mutate({ orgId: org.id, unitId: selectedUnit?.id, ...d }); }} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar Campanha</DialogTitle></DialogHeader>
          {editing && <FormCampanha initial={editing} onSave={d => saveM.mutate({ id: editing.id, orgId: editing.orgId, ...d })} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
