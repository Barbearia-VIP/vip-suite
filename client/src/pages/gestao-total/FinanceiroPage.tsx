/**
 * FinanceiroPage.tsx — DRE + lançamentos de receitas/despesas
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
import { Plus, Trash2, Edit2, TrendingUp, TrendingDown, DollarSign, CheckCircle2, Clock } from "lucide-react";

type Lancamento = {
  id: number; tipo: "receita" | "despesa"; categoria: string | null;
  descricao: string; valor: string; pago: number;
  vencimento: Date | null; formaPagamento: string | null;
  referencia: string | null; orgId: number; unitId: number | null; createdAt: Date;
};
function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}
function getCurrentRef() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function FormLancamento({ initial, onSave, onClose }: {
  initial?: Partial<Lancamento>;
  onSave: (d: { tipo: "receita" | "despesa"; descricao: string; valor: number; categoria?: string; vencimento?: string; pago: boolean; formaPagamento?: string; referencia?: string; }) => void;
  onClose: () => void;
}) {
  const [tipo, setTipo] = useState<"receita" | "despesa">(initial?.tipo ?? "despesa");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [valor, setValor] = useState(initial?.valor ?? "");
  const [categoria, setCategoria] = useState(initial?.categoria ?? "");
  const [vencimento, setVencimento] = useState(initial?.vencimento ? new Date(initial.vencimento).toISOString().split("T")[0] : "");
  const [pago, setPago] = useState(initial?.pago === 1);
  const [formaPagamento, setFormaPagamento] = useState(initial?.formaPagamento ?? "");
  const [referencia, setReferencia] = useState(initial?.referencia ?? getCurrentRef());
  const CATS_D = ["Folha de Pagamento","Aluguel","Produtos","Marketing","Manutenção","Utilidades","Impostos","Outros"];
  const CATS_R = ["Serviços","Produtos","Outros"];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Tipo *</Label>
          <Select value={tipo} onValueChange={v => setTipo(v as "receita"|"despesa")}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="receita">Receita</SelectItem><SelectItem value="despesa">Despesa</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Categoria</Label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="text-sm"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
            <SelectContent>{(tipo==="despesa"?CATS_D:CATS_R).map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Descrição *</Label>
        <Input value={descricao} onChange={e=>setDescricao(e.target.value)} placeholder="Descreva o lançamento..." className="text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Valor (R$) *</Label>
          <Input type="number" value={valor} onChange={e=>setValor(e.target.value)} placeholder="0,00" className="text-sm" />
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Referência</Label>
          <Input value={referencia} onChange={e=>setReferencia(e.target.value)} placeholder="2026-03" className="text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Vencimento</Label>
          <Input type="date" value={vencimento} onChange={e=>setVencimento(e.target.value)} className="text-sm" />
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Forma de Pagamento</Label>
          <Select value={formaPagamento} onValueChange={setFormaPagamento}>
            <SelectTrigger className="text-sm"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
            <SelectContent>
              {["dinheiro","pix","cartao_debito","cartao_credito","transferencia","boleto"].map(v=><SelectItem key={v} value={v}>{v.replace("_"," ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="pago" checked={pago} onChange={e=>setPago(e.target.checked)} className="w-4 h-4 rounded" />
        <Label htmlFor="pago" className="text-xs cursor-pointer">Já pago / recebido</Label>
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={()=>onSave({tipo,descricao,valor:parseFloat(valor as string),categoria:categoria||undefined,vencimento:vencimento||undefined,pago,formaPagamento:formaPagamento||undefined,referencia:referencia||undefined})} disabled={!descricao.trim()||!valor}>Salvar</Button>
      </DialogFooter>
    </div>
  );
}
export default function FinanceiroPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Lancamento|null>(null);
  const [filterTipo, setFilterTipo] = useState<"todos"|"receita"|"despesa">("todos");
  const [referencia, setReferencia] = useState(getCurrentRef());
  const [tab, setTab] = useState<"lancamentos"|"dre">("lancamentos");
  const listQ = trpc.gestaoTotal.financeiro.list.useQuery({ orgId:org?.id??0, unitId:selectedUnit?.id, referencia, tipo:filterTipo==="todos"?undefined:filterTipo }, { enabled:!!org?.id });
  const dreQ = trpc.gestaoTotal.financeiro.dre.useQuery({ orgId:org?.id??0, unitId:selectedUnit?.id, referencia }, { enabled:!!org?.id&&tab==="dre" });
  const lancamentos = (listQ.data??[]) as Lancamento[];
  const dre = dreQ.data;
  const totalR = lancamentos.filter(l=>l.tipo==="receita").reduce((s,l)=>s+Number(l.valor),0);
  const totalD = lancamentos.filter(l=>l.tipo==="despesa").reduce((s,l)=>s+Number(l.valor),0);
  const saveM = trpc.gestaoTotal.financeiro.save.useMutation({
    onSuccess:()=>{ utils.gestaoTotal.financeiro.list.invalidate(); utils.gestaoTotal.financeiro.dre.invalidate(); toast.success("Salvo!"); setShowForm(false); setEditing(null); },
    onError:()=>toast.error("Erro ao salvar"),
  });
  const deleteM = trpc.gestaoTotal.financeiro.delete.useMutation({
    onSuccess:()=>{ utils.gestaoTotal.financeiro.list.invalidate(); utils.gestaoTotal.financeiro.dre.invalidate(); toast.success("Removido"); },
    onError:()=>toast.error("Erro ao remover"),
  });
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-bold text-foreground">Financeiro</h1><p className="text-sm text-muted-foreground">Receitas e despesas operacionais</p></div>
        <div className="flex items-center gap-2">
          <Input type="month" value={referencia} onChange={e=>setReferencia(e.target.value)} className="text-sm w-40" />
          <Button size="sm" onClick={()=>setShowForm(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Novo</Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[{label:"Receitas",val:totalR,icon:TrendingUp,cls:"text-green-400"},{label:"Despesas",val:totalD,icon:TrendingDown,cls:"text-red-400"},{label:"Resultado",val:totalR-totalD,icon:DollarSign,cls:totalR-totalD>=0?"text-green-400":"text-red-400"}].map(k=>(
          <Card key={k.label} className="bg-card border-border"><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><k.icon className={`w-4 h-4 ${k.cls}`} /><p className="text-xs text-muted-foreground">{k.label}</p></div>
            <p className={`text-xl font-bold ${k.cls}`}>{fmt(k.val)}</p>
          </CardContent></Card>
        ))}
      </div>
      <div className="flex border border-border rounded-lg overflow-hidden w-fit">
        {(["lancamentos","dre"] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`px-4 py-1.5 text-xs transition-colors capitalize ${tab===t?"bg-primary text-primary-foreground":"text-muted-foreground hover:text-foreground"}`}>{t==="dre"?"DRE":"Lançamentos"}</button>
        ))}
      </div>
      {tab==="lancamentos"&&<>
        <div className="flex gap-2">
          {(["todos","receita","despesa"] as const).map(t=>(
            <button key={t} onClick={()=>setFilterTipo(t)} className={`text-xs px-3 py-1 rounded-full border transition-colors capitalize ${filterTipo===t?"bg-primary text-primary-foreground border-primary":"border-border text-muted-foreground hover:text-foreground"}`}>{t}</button>
          ))}
        </div>
        {listQ.isLoading?<div className="space-y-2">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        :lancamentos.length===0?<Card className="bg-card border-border"><CardContent className="p-8 text-center"><DollarSign className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Nenhum lançamento em {referencia}</p><Button size="sm" variant="outline" className="mt-3" onClick={()=>setShowForm(true)}>Adicionar</Button></CardContent></Card>
        :<Card className="bg-card border-border"><div className="divide-y divide-border">{lancamentos.map(l=>(
          <div key={l.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-2 h-2 rounded-full shrink-0 ${l.tipo==="receita"?"bg-green-400":"bg-red-400"}`} />
              <div className="min-w-0"><p className="text-sm text-foreground truncate">{l.descricao}</p><p className="text-xs text-muted-foreground">{l.categoria??l.tipo}</p></div>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-2">
              <div className="text-right">
                <p className={`text-sm font-semibold ${l.tipo==="receita"?"text-green-400":"text-red-400"}`}>{l.tipo==="receita"?"+":"-"}{fmt(Number(l.valor))}</p>
                <div className="flex items-center gap-1 justify-end">{l.pago?<CheckCircle2 className="w-3 h-3 text-green-400"/>:<Clock className="w-3 h-3 text-yellow-400"/>}<span className="text-xs text-muted-foreground">{l.pago?"Pago":"Pendente"}</span></div>
              </div>
              <button onClick={()=>setEditing(l)} className="text-muted-foreground hover:text-foreground p-1"><Edit2 className="w-3.5 h-3.5" /></button>
              <button onClick={()=>deleteM.mutate({id:l.id,orgId:l.orgId})} className="text-muted-foreground hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}</div></Card>}
      </>}
      {tab==="dre"&&<Card className="bg-card border-border"><CardHeader className="pb-2"><CardTitle className="text-sm">DRE — {referencia}</CardTitle></CardHeader><CardContent>
        {dreQ.isLoading?<div className="space-y-2">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-8 rounded" />)}</div>
        :dre?<div className="space-y-2">
          {[{label:"Receita Total",val:dre.receitas,cls:"text-green-400"},{label:"(-) Despesas",val:-dre.despesas,cls:"text-red-400"},{label:"= Resultado",val:dre.lucro,cls:dre.lucro>=0?"text-green-400 text-base font-bold":"text-red-400 text-base font-bold"},{label:"Margem",text:`${dre.margem.toFixed(1)}%`,val:0,cls:"text-muted-foreground"}].map(r=>(
            <div key={r.label} className="flex justify-between py-2 border-b border-border/50 last:border-0"><span className="text-sm text-foreground">{r.label}</span><span className={`text-sm ${r.cls}`}>{r.text??fmt(r.val)}</span></div>
          ))}
        </div>:<p className="text-sm text-muted-foreground text-center py-4">Sem dados para {referencia}</p>}
      </CardContent></Card>}
      <Dialog open={showForm} onOpenChange={setShowForm}><DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Novo Lançamento</DialogTitle></DialogHeader>
        <FormLancamento onSave={d=>{if(!org?.id)return;saveM.mutate({orgId:org.id,unitId:selectedUnit?.id,...d});}} onClose={()=>setShowForm(false)} />
      </DialogContent></Dialog>
      <Dialog open={!!editing} onOpenChange={v=>!v&&setEditing(null)}><DialogContent className="max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar Lançamento</DialogTitle></DialogHeader>
        {editing&&<FormLancamento initial={editing} onSave={d=>saveM.mutate({id:editing.id,orgId:editing.orgId,...d})} onClose={()=>setEditing(null)} />}
      </DialogContent></Dialog>
    </div>
  );
}
