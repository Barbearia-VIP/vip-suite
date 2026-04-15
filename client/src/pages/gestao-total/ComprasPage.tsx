/**
 * ComprasPage.tsx — Gestão de compras com fornecedores e aprovação
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
import { Plus, Trash2, Edit2, ShoppingCart, CheckCircle2, Clock, XCircle } from "lucide-react";

type ItemCompra = { descricao: string; qtd: number; valorUnit: number; total: number };
type Compra = {
  id: number; orgId: number; unitId: number | null;
  fornecedorId: number | null; fornecedorNome: string | null;
  status: "rascunho" | "aguardando_aprovacao" | "aprovado" | "recebido" | "cancelado";
  itens: unknown; total: string | null;
  observacoes: string | null; aprovadoPor: string | null; aprovadoEm: Date | null;
  createdAt: Date; updatedAt: Date;
};
function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
}
const STATUS_ICONS: Record<string,React.ReactNode> = {
  rascunho: <Clock className="w-4 h-4 text-muted-foreground" />,
  aguardando_aprovacao: <Clock className="w-4 h-4 text-yellow-400" />,
  aprovado: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  recebido: <CheckCircle2 className="w-4 h-4 text-blue-400" />,
  cancelado: <XCircle className="w-4 h-4 text-red-400" />,
};
function FormCompra({ initial, onSave, onClose }: {
  initial?: Partial<Compra>;
  onSave: (d: { fornecedorNome?: string; status?: "rascunho"|"aguardando_aprovacao"|"aprovado"|"recebido"|"cancelado"; itens?: ItemCompra[]; total?: number; observacoes?: string; }) => void;
  onClose: () => void;
}) {
  const [fornecedor, setFornecedor] = useState(initial?.fornecedorNome ?? "");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(initial?.total ?? "");
  const [status, setStatus] = useState<"rascunho"|"aguardando_aprovacao"|"aprovado"|"recebido"|"cancelado">(initial?.status ?? "aguardando_aprovacao");
  const [observacoes, setObservacoes] = useState(initial?.observacoes ?? "");
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Descrição do Pedido *</Label>
        <Input value={descricao} onChange={e=>setDescricao(e.target.value)} placeholder="Ex: Shampoo profissional, 10 unidades" className="text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Valor Total (R$)</Label>
          <Input type="number" value={valor} onChange={e=>setValor(e.target.value)} placeholder="0,00" className="text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={v=>setStatus(v as typeof status)}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="aguardando_aprovacao">Aguardando Aprovação</SelectItem>
              <SelectItem value="aprovado">Aprovado</SelectItem>
              <SelectItem value="recebido">Recebido</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Fornecedor</Label>
        <Input value={fornecedor} onChange={e=>setFornecedor(e.target.value)} placeholder="Nome do fornecedor" className="text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Observações</Label>
        <Textarea value={observacoes} onChange={e=>setObservacoes(e.target.value)} placeholder="Detalhes adicionais..." className="text-sm min-h-[60px]" />
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={()=>onSave({fornecedorNome:fornecedor||undefined,status,total:valor?parseFloat(valor as string):undefined,observacoes:observacoes||undefined,itens:descricao?[{descricao,qtd:1,valorUnit:valor?parseFloat(valor as string):0,total:valor?parseFloat(valor as string):0}]:undefined})} disabled={!descricao.trim()}>Salvar</Button>
      </DialogFooter>
    </div>
  );
}
export default function ComprasPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Compra|null>(null);
  const [filterStatus, setFilterStatus] = useState("todos");
  const q = trpc.gestaoTotal.compras.list.useQuery({ orgId:org?.id??0, unitId:selectedUnit?.id }, { enabled:!!org?.id });
  const compras = (q.data ?? []) as unknown as Compra[];
  const filtered = filterStatus==="todos"?compras:compras.filter(c=>c.status===filterStatus);
  const saveM = trpc.gestaoTotal.compras.save.useMutation({
    onSuccess:()=>{ utils.gestaoTotal.compras.list.invalidate(); toast.success("Compra salva!"); setShowForm(false); setEditing(null); },
    onError:()=>toast.error("Erro ao salvar"),
  });
  const deleteM = trpc.gestaoTotal.compras.delete.useMutation({
    onSuccess:()=>{ utils.gestaoTotal.compras.list.invalidate(); toast.success("Removida"); },
    onError:()=>toast.error("Erro ao remover"),
  });
  const totalPendente = compras.filter(c=>c.status==="aguardando_aprovacao").reduce((s,c)=>s+Number(c.total??0),0);
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Compras</h1>
          <p className="text-sm text-muted-foreground">{compras.filter(c=>c.status==="aguardando_aprovacao").length} aguardando aprovação • {fmt(totalPendente)}</p>
        </div>
        <Button size="sm" onClick={()=>setShowForm(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Nova Compra</Button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {["todos","rascunho","aguardando_aprovacao","aprovado","recebido","cancelado"].map(s=>(
          <button key={s} onClick={()=>setFilterStatus(s)} className={`text-xs px-3 py-1 rounded-full border transition-colors capitalize ${filterStatus===s?"bg-primary text-primary-foreground border-primary":"border-white/10 text-muted-foreground hover:text-foreground"}`}>{s}</button>
        ))}
      </div>
      {q.isLoading?<div className="space-y-2">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      :filtered.length===0?<div className="glass-card bg-white/5 border-white/10"><div className="p-6 pt-0 p-8 text-center"><ShoppingCart className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhuma compra registrada</p><Button size="sm" variant="outline" className="mt-3" onClick={()=>setShowForm(true)}>Solicitar compra</Button></div></div>
      :<div className="glass-card bg-white/5 border-white/10"><div className="divide-y divide-border">{filtered.map(c=>(
        <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
          <div className="flex items-center gap-3 min-w-0">
            {STATUS_ICONS[c.status]??<Clock className="w-4 h-4 text-muted-foreground" />}
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{Array.isArray(c.itens)&&(c.itens as ItemCompra[]).length>0?(c.itens as ItemCompra[])[0].descricao:"Pedido de compra"}</p>
              <p className="text-xs text-muted-foreground">{c.fornecedorNome??""}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-2">
            {c.total&&<span className="text-sm font-semibold text-foreground">{fmt(Number(c.total))}</span>}
            <span className="text-xs font-medium capitalize text-muted-foreground">{c.status.replace("_"," ")}</span>
            <button onClick={()=>setEditing(c)} className="text-muted-foreground hover:text-foreground p-1"><Edit2 className="w-3.5 h-3.5" /></button>
            <button onClick={()=>deleteM.mutate({id:c.id,orgId:c.orgId})} className="text-muted-foreground hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      ))}</div></div>}
      <Dialog open={showForm} onOpenChange={setShowForm}><DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Nova Compra</DialogTitle></DialogHeader>
        <FormCompra onSave={d=>{if(!org?.id)return;saveM.mutate({orgId:org.id,unitId:selectedUnit?.id,...d});}} onClose={()=>setShowForm(false)} />
      </DialogContent></Dialog>
      <Dialog open={!!editing} onOpenChange={v=>!v&&setEditing(null)}><DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar Compra</DialogTitle></DialogHeader>
        {editing&&<FormCompra initial={editing} onSave={d=>saveM.mutate({id:editing.id,orgId:editing.orgId,...d})} onClose={()=>setEditing(null)} />}
      </DialogContent></Dialog>
    </div>
  );
}
