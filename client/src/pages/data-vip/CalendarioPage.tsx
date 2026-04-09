/**
 * CalendarioPage.tsx — Calendário de folgas e feriados
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/_core/hooks/useAuth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Calendar, Plus, Trash2 } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";
import { DataVipLoadingState, DataVipErrorState, isExternalDbTimeoutError } from "@/components/DataVipLoadingState";

const TIPO_COLORS: Record<string, string> = {
  folga: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  feriado: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  ferias: "bg-green-500/20 text-green-400 border-green-500/30",
};

export default function CalendarioPage() {
  const { selectedUnit, userRole } = useApp();
  const { org } = useOrg();
  const { user } = useAuth();
  const isAdmin = userRole === "master" || userRole === "org_admin" || user?.role === "admin";
  const now = new Date();
  const [mes, setMes] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ colaboradorNome: "", data: "", tipo: "folga", observacao: "" });

  const q = trpc.dataVip.folgas.useQuery(
    { orgId: org?.id, unitId: selectedUnit?.id, mes },
    { enabled: !!org?.id }
  );
  const utils = trpc.useUtils();
  const save = trpc.dataVip.saveFolga.useMutation({
    onSuccess: () => { toast.success("Registro salvo"); setModalOpen(false); utils.dataVip.folgas.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.dataVip.deleteFolga.useMutation({
    onSuccess: () => { toast.success("Removido"); utils.dataVip.folgas.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const folgas = q.data ?? [];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 font-display tracking-tight"><Calendar className="w-6 h-6 text-primary" /> Calendário</h1>
          <p className="text-sm text-muted-foreground">{selectedUnit ? selectedUnit.name : "Todas as unidades"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={mes} onChange={e => setMes(e.target.value)} className="w-40 text-sm" />
          {isAdmin && (
            <Button size="sm" onClick={() => setModalOpen(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> Adicionar
            </Button>
          )}
        </div>
      </div>

      {/* Banner de carregamento */}
      {(q.isLoading || (q.isError && isExternalDbTimeoutError(q.error) && (q.failureCount ?? 0) < 3)) && (
        <DataVipLoadingState rows={2} attempt={(q.failureCount ?? 0) + 1} />
      )}
      {q.isError && !isExternalDbTimeoutError(q.error) && (
        <DataVipErrorState onRetry={() => q.refetch()} />
      )}

      <div className="glass-card overflow-hidden">
          {folgas.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Nenhum registro para este mês</div>
          ) : (
            <div className="divide-y divide-border">
              {folgas.map((f: any) => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{f.colaboradorNome || "Unidade"}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${TIPO_COLORS[f.tipo] || ""}`}>{f.tipo}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(f.data + "T12:00:00").toLocaleDateString("pt-BR")} {f.observacao && `· ${f.observacao}`}</p>
                  </div>
                  {isAdmin && <button onClick={() => del.mutate({ id: f.id })} className="text-muted-foreground hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
                </div>
              ))}
            </div>
          )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Novo Registro</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Colaborador (opcional)</Label><Input value={form.colaboradorNome} onChange={e => setForm(f => ({ ...f, colaboradorNome: e.target.value }))} placeholder="Nome do colaborador" /></div>
            <div><Label>Data</Label><DatePicker value={form.data} onChange={v => setForm(f => ({ ...f, data: v }))} placeholder="Selecionar data" /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="folga">Folga</SelectItem>
                  <SelectItem value="feriado">Feriado</SelectItem>
                  <SelectItem value="ferias">Férias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Observação (opcional)</Label><Input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate({ orgId: org!.id, unitId: selectedUnit?.id, colaboradorNome: form.colaboradorNome || undefined, data: form.data, tipo: form.tipo as any, observacao: form.observacao || undefined })} disabled={save.isPending || !form.data}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
