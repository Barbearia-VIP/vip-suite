/**
 * ReunioesPage.tsx — Reuniões com agenda e CRUD
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PermissionGuard } from "@/components/PermissionGuard";
import { Plus, Trash2, Edit2, Calendar, Clock, Users } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";

type Reuniao = {
  id: number; orgId: number; unitId: number | null;
  titulo: string; data: Date; duracao: number | null;
  local: string | null; pauta: string | null; ata: string | null;
  participantes: unknown; status: "agendada" | "realizada" | "cancelada";
  createdAt: Date; updatedAt: Date;
};

function FormReuniao({ initial, onSave, onClose }: {
  initial?: Partial<Reuniao>;
  onSave: (d: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [dataHora, setDataHora] = useState((initial as Reuniao | undefined)?.data ? new Date((initial as Reuniao).data).toISOString().slice(0,16) : "");
  const [duracao, setDuracao] = useState(String(initial?.duracao ?? 60));
  const [local, setLocal] = useState(initial?.local ?? "");
  const [participantesStr, setParticipantesStr] = useState(() => {
    const p = (initial as Reuniao | undefined)?.participantes;
    return Array.isArray(p) ? (p as string[]).join(", ") : "";
  });
  const [pauta, setPauta] = useState(initial?.pauta ?? "");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5"><Label className="text-xs">Título *</Label>
        <Input value={titulo} onChange={e=>setTitulo(e.target.value)} placeholder="Reunião de equipe..." className="text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Duração (min)</Label>
        <Input type="number" value={duracao} onChange={e=>setDuracao(e.target.value)} className="text-sm" />
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Data e Hora *</Label>
        <div className="flex gap-2">
          <DatePicker
            value={dataHora ? dataHora.slice(0, 10) : ""}
            onChange={d => setDataHora(d + (dataHora ? dataHora.slice(10) : "T09:00"))}
            placeholder="Data da reunião"
            className="flex-1"
          />
          <Input
            type="time"
            value={dataHora ? dataHora.slice(11, 16) : ""}
            onChange={e => setDataHora((dataHora ? dataHora.slice(0, 10) : new Date().toISOString().slice(0, 10)) + "T" + e.target.value)}
            className="text-sm w-28"
          />
        </div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Local</Label>
        <Input value={local} onChange={e=>setLocal(e.target.value)} placeholder="Sala de reunião, online..." className="text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Participantes (separados por vírgula)</Label>
        <Input value={participantesStr} onChange={e=>setParticipantesStr(e.target.value)} placeholder="João, Maria, Pedro..." className="text-sm" />
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Pauta</Label>
        <Textarea value={pauta} onChange={e=>setPauta(e.target.value)} placeholder="Tópicos a discutir..." className="text-sm min-h-[80px]" />
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={()=>onSave({titulo,pauta:pauta||undefined,data:dataHora||undefined,duracao:duracao?parseInt(duracao):undefined,local:local||undefined,participantes:participantesStr?participantesStr.split(",").map((s:string)=>s.trim()).filter(Boolean):undefined})} disabled={!titulo.trim()||!dataHora}>Salvar</Button>
      </DialogFooter>
    </div>
  );
}

export default function ReunioesPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Reuniao|null>(null);
  const q = trpc.gestaoTotal.reunioes.list.useQuery({ orgId:org?.id??0, unitId:selectedUnit?.id }, { enabled:!!org?.id });
  const reunioes = (q.data ?? []) as unknown as Reuniao[];
  const saveM = trpc.gestaoTotal.reunioes.save.useMutation({
    onSuccess:()=>{ utils.gestaoTotal.reunioes.list.invalidate(); toast.success("Reunião salva!"); setShowForm(false); setEditing(null); },
    onError:()=>toast.error("Erro ao salvar"),
  });
  const deleteM = trpc.gestaoTotal.reunioes.delete.useMutation({
    onSuccess:()=>{ utils.gestaoTotal.reunioes.list.invalidate(); toast.success("Removida"); },
    onError:()=>toast.error("Erro ao remover"),
  });
  const STATUS_COLORS: Record<string,string> = { agendada:"text-blue-400", realizada:"text-green-400", cancelada:"text-red-400" };
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-bold text-foreground font-display tracking-tight">Reuniões</h1><p className="text-sm text-muted-foreground">{reunioes.length} reuniões registradas</p></div>
        <PermissionGuard moduleKey="gestao_total" sectionKey="reunioes">
          <Button size="sm" onClick={()=>setShowForm(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Nova Reunião</Button>
        </PermissionGuard>
      </div>
      {q.isLoading?<div className="space-y-2">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      :reunioes.length===0?<div className="glass-card bg-white/5 border-white/10"><div className="p-6 pt-0 p-8 text-center"><Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhuma reunião agendada</p><Button size="sm" variant="outline" className="mt-3" onClick={()=>setShowForm(true)}>Agendar reunião</Button></div></div>
      :<div className="glass-card bg-white/5 border-white/10"><div className="divide-y divide-border">{reunioes.map(r=>(
        <div key={r.id} className="flex items-start justify-between px-4 py-3 hover:bg-muted/30">
          <div className="flex items-start gap-3 min-w-0">
            <Calendar className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{r.titulo}</p>
              <div className="flex items-center gap-3 mt-0.5">
                <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3 h-3" />{new Date(r.data).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</div>
                {r.duracao&&<span className="text-xs text-muted-foreground">{r.duracao}min</span>}
                {Array.isArray(r.participantes)&&r.participantes.length>0&&<div className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="w-3 h-3" />{(r.participantes as string[]).length} pessoas</div>}
              </div>
              {r.local&&<p className="text-xs text-muted-foreground mt-0.5">{r.local}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className={`text-xs font-medium capitalize ${STATUS_COLORS[r.status]??""}`}>{r.status}</span>
            <PermissionGuard moduleKey="gestao_total" sectionKey="reunioes">
              <button onClick={()=>setEditing(r)} className="text-muted-foreground hover:text-foreground p-1"><Edit2 className="w-3.5 h-3.5" /></button>
              <button onClick={()=>deleteM.mutate({id:r.id,orgId:r.orgId})} className="text-muted-foreground hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
            </PermissionGuard>
          </div>
        </div>
      ))}</div></div>}
      <Dialog open={showForm} onOpenChange={setShowForm}><DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Nova Reunião</DialogTitle></DialogHeader>
        <FormReuniao onSave={d=>{if(!org?.id)return;const {data:dt,...rest}=d as {data?:string;titulo:string;duracao?:number;local?:string;pauta?:string;participantes?:string[]};saveM.mutate({orgId:org.id,unitId:selectedUnit?.id,data:dt??"",...rest});}} onClose={()=>setShowForm(false)} />
      </DialogContent></Dialog>
      <Dialog open={!!editing} onOpenChange={v=>!v&&setEditing(null)}><DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar Reunião</DialogTitle></DialogHeader>
        {editing&&<FormReuniao initial={editing} onSave={d=>{const {data:dt,...rest}=d as {data?:string;titulo:string;duracao?:number;local?:string;pauta?:string;participantes?:string[]};saveM.mutate({id:editing.id,orgId:editing.orgId,data:dt??"",...rest});}} onClose={()=>setEditing(null)} />}
      </DialogContent></Dialog>
    </div>
  );
}
