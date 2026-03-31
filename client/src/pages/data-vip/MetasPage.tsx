/**
 * MetasPage.tsx — Definição e acompanhamento de metas mensais
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Target, Plus, Trash2 } from "lucide-react";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export default function MetasPage() {
  const { selectedUnit, userRole } = useApp();
  const { org, units } = useOrg();
  const { user } = useAuth();
  const isAdmin = userRole === "master" || userRole === "org_admin" || user?.role === "admin";
  const [ano, setAno] = useState(new Date().getFullYear());
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ unitId: "", periodo: "", metaFaturamento: "", alertaAbaixoPercent: "80" });

  const q = trpc.dataVip.metas.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, ano },
    { enabled: !!org?.id }
  );
  const utils = trpc.useUtils();
  const saveMeta = trpc.dataVip.saveMeta.useMutation({
    onSuccess: () => { toast.success("Meta salva"); setModalOpen(false); utils.dataVip.metas.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMeta = trpc.dataVip.deleteMeta.useMutation({
    onSuccess: () => { toast.success("Meta removida"); utils.dataVip.metas.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const metas = q.data ?? [];
  const periodoOptions = useMemo(() => {
    const list = [];
    for (let m = 1; m <= 12; m++) {
      const val = `${ano}-${String(m).padStart(2, "0")}`;
      list.push({ val, label: `${MESES[m-1]} ${ano}` });
    }
    return list;
  }, [ano]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="w-6 h-6 text-red-400" /> Metas
          </h1>
          <p className="text-sm text-muted-foreground">{selectedUnit ? selectedUnit.name : "Todas as unidades"}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={ano} onChange={e => setAno(Number(e.target.value))} className="text-sm bg-muted border border-border rounded px-2 py-1.5">
            {[ano-1, ano, ano+1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {isAdmin && (
            <Button size="sm" onClick={() => setModalOpen(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> Nova Meta
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3">
        {q.isLoading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
          : metas.length === 0
            ? <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">Nenhuma meta cadastrada para {ano}.</CardContent></Card>
            : metas.map((m: any) => {
                const pct = m.percentual;
                const color = pct >= 100 ? "bg-green-500" : pct >= m.alertaAbaixoPercent ? "bg-yellow-500" : "bg-red-500";
                return (
                  <Card key={m.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium">{m.unitName || "Rede"} — {MESES[parseInt(m.periodo.split("-")[1])-1]} {m.periodo.split("-")[0]}</p>
                          <p className="text-xs text-muted-foreground">Meta: {fmt(m.metaFaturamento)} · Realizado: {fmt(m.realizado)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${pct >= 100 ? "text-green-400" : pct >= m.alertaAbaixoPercent ? "text-yellow-400" : "text-red-400"}`}>{pct}%</span>
                          {isAdmin && <button onClick={() => deleteMeta.mutate({ id: m.id })} className="text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })
        }
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nova Meta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Unidade</Label>
              <Select value={form.unitId} onValueChange={v => setForm(f => ({ ...f, unitId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {(units ?? []).map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Período</Label>
              <Select value={form.periodo} onValueChange={v => setForm(f => ({ ...f, periodo: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{periodoOptions.map(p => <SelectItem key={p.val} value={p.val}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Meta de Faturamento (R$)</Label>
              <Input type="number" value={form.metaFaturamento} onChange={e => setForm(f => ({ ...f, metaFaturamento: e.target.value }))} placeholder="Ex: 50000" />
            </div>
            <div>
              <Label>Alerta abaixo de (%)</Label>
              <Input type="number" value={form.alertaAbaixoPercent} onChange={e => setForm(f => ({ ...f, alertaAbaixoPercent: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMeta.mutate({ orgId: org!.id, unitId: form.unitId ? Number(form.unitId) : undefined, periodo: form.periodo, metaFaturamento: Number(form.metaFaturamento), alertaAbaixoPercent: Number(form.alertaAbaixoPercent) })} disabled={saveMeta.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
