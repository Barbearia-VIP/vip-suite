/**
 * FinanceiroPage.tsx — DRE + lançamentos de receitas/despesas + recorrência
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

import { toast } from "sonner";
import {
  Plus, Trash2, Edit2, TrendingUp, TrendingDown, DollarSign,
  CheckCircle2, Clock, RefreshCw, Database, Repeat2, XCircle, Info,
} from "lucide-react";
import { PermissionGuard } from "@/components/PermissionGuard";
import { DatePicker } from "@/components/DatePicker";

type Lancamento = {
  id: number; tipo: "receita" | "despesa"; categoria: string | null;
  descricao: string; valor: string; pago: number;
  vencimento: Date | null; paidAt: Date | null; formaPagamento: string | null;
  referencia: string | null; orgId: number; unitId: number | null; createdAt: Date;
  dataVipRef: string | null;
  recorrente: number;
  recorrenciaMeses: number | null;
  recorrenciaParentId: number | null;
  recorrenciaDia: number | null;
  recorrenciaRef: string | null;
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function getCurrentRef() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type SavePayload = {
  tipo: "receita" | "despesa";
  descricao: string;
  valor: number;
  categoria?: string;
  vencimento?: string;
  pago: boolean;
  formaPagamento?: string;
  referencia?: string;
  recorrente: boolean;
  recorrenciaMeses?: number;
  recorrenciaDia?: number;
};

function FormLancamento({ initial, onSave, onClose }: {
  initial?: Partial<Lancamento>;
  onSave: (d: SavePayload) => void;
  onClose: () => void;
}) {
  const [tipo, setTipo] = useState<"receita" | "despesa">(initial?.tipo ?? "despesa");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [valor, setValor] = useState(initial?.valor ?? "");
  const [categoria, setCategoria] = useState(initial?.categoria ?? "");
  const [vencimento, setVencimento] = useState(
    initial?.vencimento ? new Date(initial.vencimento).toISOString().split("T")[0] : ""
  );
  const [pago, setPago] = useState(initial?.pago === 1);
  const [formaPagamento, setFormaPagamento] = useState(initial?.formaPagamento ?? "");
  const [referencia, setReferencia] = useState(initial?.referencia ?? getCurrentRef());

  // Recorrência
  const [recorrente, setRecorrente] = useState(initial?.recorrente === 1);
  const [recorrenciaMeses, setRecorrenciaMeses] = useState<string>(
    initial?.recorrenciaMeses ? String(initial.recorrenciaMeses) : ""
  );
  const [recorrenciaDia, setRecorrenciaDia] = useState<string>(
    initial?.recorrenciaDia ? String(initial.recorrenciaDia) : ""
  );

  const CATS_D = ["Folha de Pagamento", "Aluguel", "Produtos", "Marketing", "Manutenção", "Utilidades", "Impostos", "Outros"];
  const CATS_R = ["Serviços", "Produtos", "Outros"];
  const isEditing = !!initial?.id;

  function handleSave() {
    const v = parseFloat(valor as string);
    if (!descricao.trim() || isNaN(v) || v <= 0) return;
    onSave({
      tipo, descricao, valor: v,
      categoria: categoria || undefined,
      vencimento: vencimento || undefined,
      pago,
      formaPagamento: formaPagamento || undefined,
      referencia: referencia || undefined,
      recorrente: !isEditing && recorrente,
      recorrenciaMeses: recorrente && recorrenciaMeses ? parseInt(recorrenciaMeses) : undefined,
      recorrenciaDia: recorrente && recorrenciaDia ? parseInt(recorrenciaDia) : undefined,
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo *</Label>
          <Select value={tipo} onValueChange={v => setTipo(v as "receita" | "despesa")}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="receita">Receita</SelectItem>
              <SelectItem value="despesa">Despesa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Categoria</Label>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="text-sm"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
            <SelectContent>
              {(tipo === "despesa" ? CATS_D : CATS_R).map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Descrição *</Label>
        <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descreva o lançamento..." className="text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Valor (R$) *</Label>
          <Input type="number" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" className="text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Referência</Label>
          <Input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="2026-03" className="text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Vencimento</Label>
          <DatePicker value={vencimento} onChange={setVencimento} placeholder="Data de vencimento" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Forma de Pagamento</Label>
          <Select value={formaPagamento} onValueChange={setFormaPagamento}>
            <SelectTrigger className="text-sm"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
            <SelectContent>
              {["dinheiro", "pix", "cartao_debito", "cartao_credito", "transferencia", "boleto"].map(v => (
                <SelectItem key={v} value={v}>{v.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="pago" checked={pago} onChange={e => setPago(e.target.checked)} className="w-4 h-4 rounded" />
        <Label htmlFor="pago" className="text-xs cursor-pointer">Já pago / recebido</Label>
      </div>

      {/* ── Seção de Recorrência ── */}
      {!isEditing && (
        <div className={`rounded-lg border p-3 space-y-3 transition-colors ${recorrente ? "border-amber-500/40 bg-amber-500/5" : "border-white/10 bg-white/3"}`}>
          <button
            type="button"
            onClick={() => setRecorrente(v => !v)}
            className="w-full flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Repeat2 className={`w-4 h-4 ${recorrente ? "text-amber-400" : "text-muted-foreground"}`} />
              <div className="text-left">
                <p className={`text-xs font-medium ${recorrente ? "text-amber-300" : "text-foreground"}`}>Vencimento recorrente</p>
                <p className="text-[10px] text-muted-foreground">Lança automaticamente todo mês</p>
              </div>
            </div>
            {/* Toggle visual */}
            <div className={`relative inline-flex h-6 w-11 items-center rounded-full border-2 border-transparent transition-colors ${recorrente ? "bg-amber-500" : "bg-input"}`}>
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${recorrente ? "translate-x-5" : "translate-x-0"}`} />
            </div>
          </button>

          {recorrente && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs">Dia do vencimento</Label>
                <Input
                  type="number" min={1} max={31}
                  value={recorrenciaDia}
                  onChange={e => setRecorrenciaDia(e.target.value)}
                  placeholder="Ex: 5 (dia 5 de cada mês)"
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Deixe vazio para usar o dia do vencimento acima</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Duração (meses)</Label>
                <Input
                  type="number" min={1} max={120}
                  value={recorrenciaMeses}
                  onChange={e => setRecorrenciaMeses(e.target.value)}
                  placeholder="Ex: 12 (1 ano)"
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Deixe vazio para repetir indefinidamente</p>
              </div>
            </div>
          )}

          {recorrente && (
            <div className="flex items-start gap-1.5 text-[10px] text-amber-400/80 bg-amber-500/10 rounded px-2 py-1.5">
              <Info className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                O sistema vai gerar automaticamente esta {tipo} todo mês
                {recorrenciaDia ? ` no dia ${recorrenciaDia}` : ""}
                {recorrenciaMeses ? ` por ${recorrenciaMeses} meses` : " indefinidamente"}.
                Você pode cancelar a qualquer momento na aba <strong>Recorrentes</strong>.
              </span>
            </div>
          )}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={handleSave} disabled={!descricao.trim() || !valor}>
          {recorrente && !isEditing ? "Salvar e Ativar Recorrência" : "Salvar"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function FinanceiroPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Lancamento | null>(null);
  const [filterTipo, setFilterTipo] = useState<"todos" | "receita" | "despesa">("todos");
  const [referencia, setReferencia] = useState(getCurrentRef());
  const [tab, setTab] = useState<"lancamentos" | "dre" | "recorrentes">("lancamentos");
  const [pagoDialog, setPagoDialog] = useState<{ id: number; orgId: number; pago: boolean; paidAt: string } | null>(null);

  const listQ = trpc.gestaoTotal.financeiro.list.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id, referencia, tipo: filterTipo === "todos" ? undefined : filterTipo },
    { enabled: !!org?.id }
  );
  const dreQ = trpc.gestaoTotal.financeiro.dre.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id, referencia },
    { enabled: !!org?.id && tab === "dre" }
  );
  const recorrentesQ = trpc.gestaoTotal.financeiro.listRecorrentes.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id },
    { enabled: !!org?.id && tab === "recorrentes" }
  );
  const syncStatusQ = trpc.gestaoTotal.financeiro.syncDataVipStatus.useQuery(
    { orgId: org?.id ?? 0, unitId: selectedUnit?.id ?? 0 },
    { enabled: !!org?.id && !!selectedUnit?.id }
  );

  const lancamentos = (listQ.data ?? []) as Lancamento[];
  const dre = dreQ.data;
  const recorrentes = (recorrentesQ.data ?? []) as Lancamento[];

  const totalR = lancamentos.filter(l => l.tipo === "receita").reduce((s, l) => s + Number(l.valor), 0);
  const totalD = lancamentos.filter(l => l.tipo === "despesa").reduce((s, l) => s + Number(l.valor), 0);

  const saveM = trpc.gestaoTotal.financeiro.save.useMutation({
    onSuccess: () => {
      utils.gestaoTotal.financeiro.list.invalidate();
      utils.gestaoTotal.financeiro.dre.invalidate();
      utils.gestaoTotal.financeiro.listRecorrentes.invalidate();
      toast.success("Salvo com sucesso!");
      setShowForm(false);
      setEditing(null);
    },
    onError: () => toast.error("Erro ao salvar"),
  });
  const deleteM = trpc.gestaoTotal.financeiro.delete.useMutation({
    onSuccess: () => {
      utils.gestaoTotal.financeiro.list.invalidate();
      utils.gestaoTotal.financeiro.dre.invalidate();
      toast.success("Removido");
    },
    onError: () => toast.error("Erro ao remover"),
  });
  const marcarPagoM = trpc.gestaoTotal.financeiro.marcarPago.useMutation({
    onSuccess: () => {
      utils.gestaoTotal.financeiro.list.invalidate();
      utils.gestaoTotal.financeiro.dre.invalidate();
      toast.success(pagoDialog?.pago ? "Marcado como pago!" : "Marcado como pendente");
      setPagoDialog(null);
    },
    onError: () => toast.error("Erro ao atualizar pagamento"),
  });
  const cancelarRecorrenciaM = trpc.gestaoTotal.financeiro.cancelarRecorrencia.useMutation({
    onSuccess: () => {
      utils.gestaoTotal.financeiro.listRecorrentes.invalidate();
      utils.gestaoTotal.financeiro.list.invalidate();
      toast.success("Recorrência cancelada");
    },
    onError: () => toast.error("Erro ao cancelar recorrência"),
  });
  const syncM = trpc.gestaoTotal.financeiro.syncDataVip.useMutation({
    onSuccess: (data) => {
      utils.gestaoTotal.financeiro.list.invalidate();
      utils.gestaoTotal.financeiro.dre.invalidate();
      utils.gestaoTotal.financeiro.syncDataVipStatus.invalidate();
      toast.success(`Sincronizado: ${data.total} registros`);
    },
    onError: () => toast.error("Erro ao sincronizar"),
  });

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Receitas e despesas operacionais</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={referencia} onChange={e => setReferencia(e.target.value)} className="text-sm w-40" />
          {selectedUnit && (
            <Button size="sm" variant="outline" onClick={() => syncM.mutate({ orgId: org?.id ?? 0, unitId: selectedUnit.id })} disabled={syncM.isPending} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${syncM.isPending ? "animate-spin" : ""}`} /> Sincronizar Data VIP
            </Button>
          )}
          <PermissionGuard moduleKey="gestao_total" sectionKey="financeiro">
            <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Novo
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {/* Banner sync Data VIP */}
      {syncStatusQ.data && (
        <div className="glass-card bg-blue-500/10 border-blue-500/30">
          <div className="p-3 flex items-center gap-3">
            <Database className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-blue-300 font-medium">Sincronização Data VIP ativa</p>
              <p className="text-[10px] text-blue-400/70 mt-0.5">
                {syncStatusQ.data.totalRegistros} registros · Período: {syncStatusQ.data.periodoInicio} a {syncStatusQ.data.periodoFim} · Última atualização: {new Date(syncStatusQ.data.ultimaAtualizacao).toLocaleString("pt-BR")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Receitas", val: totalR, icon: TrendingUp, cls: "text-green-400" },
          { label: "Despesas", val: totalD, icon: TrendingDown, cls: "text-red-400" },
          { label: "Resultado", val: totalR - totalD, icon: DollarSign, cls: totalR - totalD >= 0 ? "text-green-400" : "text-red-400" },
        ].map(k => (
          <div className="glass-card bg-white/5 border-white/10" key={k.label}>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <k.icon className={`w-4 h-4 ${k.cls}`} />
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
              <p className={`text-xl font-bold ${k.cls}`}>{fmt(k.val)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border border-white/10 rounded-lg overflow-hidden w-fit">
        {(["lancamentos", "dre", "recorrentes"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 text-xs transition-colors capitalize flex items-center gap-1.5 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "recorrentes" && <Repeat2 className="w-3 h-3" />}
            {t === "dre" ? "DRE" : t === "recorrentes" ? "Recorrentes" : "Lançamentos"}
            {t === "recorrentes" && recorrentes.length > 0 && (
              <span className="bg-amber-500 text-black text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{recorrentes.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Lançamentos */}
      {tab === "lancamentos" && (
        <>
          <div className="flex gap-2">
            {(["todos", "receita", "despesa"] as const).map(t => (
              <button key={t} onClick={() => setFilterTipo(t)} className={`text-xs px-3 py-1 rounded-full border transition-colors capitalize ${filterTipo === t ? "bg-primary text-primary-foreground border-primary" : "border-white/10 text-muted-foreground hover:text-foreground"}`}>{t}</button>
            ))}
          </div>
          {listQ.isLoading
            ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
            : lancamentos.length === 0
              ? (
                <div className="glass-card bg-white/5 border-white/10">
                  <div className="p-8 text-center">
                    <DollarSign className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhum lançamento em {referencia}</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowForm(true)}>Adicionar</Button>
                  </div>
                </div>
              )
              : (
                <div className="glass-card bg-white/5 border-white/10">
                  <div className="divide-y divide-border">
                    {lancamentos.map(l => (
                      <div key={l.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${l.tipo === "receita" ? "bg-green-400" : "bg-red-400"}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm text-foreground truncate">{l.descricao}</p>
                              {l.dataVipRef && (
                                <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Data VIP</span>
                              )}
                              {l.recorrenciaParentId && !l.dataVipRef && (
                                <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-0.5">
                                  <Repeat2 className="w-2.5 h-2.5" /> Recorrente
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {l.categoria ?? l.tipo}
                              {l.vencimento && ` · Venc. ${new Date(l.vencimento).toLocaleDateString("pt-BR")}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          <div className="text-right">
                            <p className={`text-sm font-semibold ${l.tipo === "receita" ? "text-green-400" : "text-red-400"}`}>
                              {l.tipo === "receita" ? "+" : "-"}{fmt(Number(l.valor))}
                            </p>
                            <div className="flex items-center gap-1 justify-end">
                              {l.pago ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : <Clock className="w-3 h-3 text-yellow-400" />}
                              <span className="text-xs text-muted-foreground">{l.pago ? "Pago" : "Pendente"}</span>
                            </div>
                          </div>
                          {/* Botão marcar pago — visível para despesas pendentes e lançamentos CLT/taxa */}
                          {!l.pago && l.tipo === "despesa" && (
                            <button
                              onClick={() => setPagoDialog({ id: l.id, orgId: l.orgId, pago: true, paidAt: new Date().toISOString().slice(0, 10) })}
                              className="text-muted-foreground hover:text-green-400 p-1 transition-colors"
                              title="Marcar como pago"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {l.pago && l.tipo === "despesa" && (
                            <button
                              onClick={() => setPagoDialog({ id: l.id, orgId: l.orgId, pago: false, paidAt: "" })}
                              className="text-muted-foreground hover:text-yellow-400 p-1 transition-colors"
                              title={`Pago em ${l.paidAt ? new Date(l.paidAt).toLocaleDateString("pt-BR") : "data não registrada"} · Clique para reverter`}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!l.dataVipRef && (
                            <button onClick={() => setEditing(l)} className="text-muted-foreground hover:text-foreground p-1" title="Editar">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!l.dataVipRef && (
                            <button onClick={() => deleteM.mutate({ id: l.id, orgId: l.orgId })} className="text-muted-foreground hover:text-red-400 p-1" title="Excluir">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {l.dataVipRef && (
                            <span className="text-[10px] text-muted-foreground/50 px-1" title="Gerado automaticamente pelo Data VIP">auto</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
          }
        </>
      )}

      {/* Tab: DRE */}
      {tab === "dre" && (
        <div className="glass-card bg-white/5 border-white/10">
          <div className="p-6 pb-2"><h3 className="font-semibold text-foreground text-sm">DRE — {referencia}</h3></div>
          <div className="p-6 pt-0">
            {dreQ.isLoading
              ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
              : dre
                ? (
                  <div className="space-y-2">
                    {[
                      { label: "Receita Total", val: dre.receitas, cls: "text-green-400" },
                      { label: "(-) Despesas", val: -dre.despesas, cls: "text-red-400" },
                      { label: "= Resultado", val: dre.lucro, cls: dre.lucro >= 0 ? "text-green-400 text-base font-bold" : "text-red-400 text-base font-bold" },
                      { label: "Margem", text: `${dre.margem.toFixed(1)}%`, val: 0, cls: "text-muted-foreground" },
                    ].map(r => (
                      <div key={r.label} className="flex justify-between py-2 border-b border-border/50 last:border-0">
                        <span className="text-sm text-foreground">{r.label}</span>
                        <span className={`text-sm ${r.cls}`}>{r.text ?? fmt(r.val)}</span>
                      </div>
                    ))}
                  </div>
                )
                : <p className="text-sm text-muted-foreground text-center py-4">Sem dados para {referencia}</p>
            }
          </div>
        </div>
      )}

      {/* Tab: Recorrentes */}
      {tab === "recorrentes" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>Estes são os vencimentos recorrentes ativos. O sistema gera automaticamente a parcela de cada mês. Cancele para parar a geração futura.</span>
          </div>
          {recorrentesQ.isLoading
            ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            : recorrentes.length === 0
              ? (
                <div className="glass-card bg-white/5 border-white/10">
                  <div className="p-8 text-center">
                    <Repeat2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhum vencimento recorrente ativo</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Ao criar um lançamento, ative a opção "Vencimento recorrente"</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => { setTab("lancamentos"); setShowForm(true); }}>
                      Criar lançamento recorrente
                    </Button>
                  </div>
                </div>
              )
              : (
                <div className="glass-card bg-white/5 border-white/10">
                  <div className="divide-y divide-border">
                    {recorrentes.map(r => (
                      <div key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${r.tipo === "receita" ? "bg-green-400" : "bg-red-400"}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm text-foreground truncate">{r.descricao}</p>
                              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-0.5">
                                <Repeat2 className="w-2.5 h-2.5" /> Ativo
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {r.categoria ?? r.tipo}
                              {r.recorrenciaDia ? ` · Todo dia ${r.recorrenciaDia}` : ""}
                              {r.recorrenciaMeses ? ` · ${r.recorrenciaMeses} meses` : " · Indefinido"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          <div className="text-right">
                            <p className={`text-sm font-semibold ${r.tipo === "receita" ? "text-green-400" : "text-red-400"}`}>
                              {r.tipo === "receita" ? "+" : "-"}{fmt(Number(r.valor))}
                            </p>
                            <p className="text-[10px] text-muted-foreground">por mês</p>
                          </div>
                          <button
                            onClick={() => {
                              if (confirm(`Cancelar a recorrência "${r.descricao}"? As parcelas futuras não pagas serão removidas.`)) {
                                cancelarRecorrenciaM.mutate({ id: r.id, orgId: r.orgId });
                              }
                            }}
                            className="text-muted-foreground hover:text-red-400 p-1 transition-colors"
                            title="Cancelar recorrência"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
          }
        </div>
      )}

      {/* Dialog: Novo lançamento */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Lançamento</DialogTitle></DialogHeader>
          <FormLancamento
            onSave={d => { if (!org?.id) return; saveM.mutate({ orgId: org.id, unitId: selectedUnit?.id, ...d }); }}
            onClose={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar lançamento */}
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Lançamento</DialogTitle></DialogHeader>
          {editing && (
            <FormLancamento
              initial={editing}
              onSave={d => saveM.mutate({ id: editing.id, orgId: editing.orgId, ...d })}
              onClose={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar pagamento */}
      <Dialog open={!!pagoDialog} onOpenChange={v => !v && setPagoDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{pagoDialog?.pago ? "Confirmar Pagamento" : "Reverter para Pendente"}</DialogTitle>
          </DialogHeader>
          {pagoDialog?.pago ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">Informe a data em que o pagamento foi realizado:</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Data do pagamento</Label>
                <Input
                  type="date"
                  value={pagoDialog.paidAt}
                  onChange={e => setPagoDialog(prev => prev ? { ...prev, paidAt: e.target.value } : null)}
                  className="text-sm"
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">Deseja reverter este lançamento para &quot;Pendente&quot;?</p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setPagoDialog(null)}>Cancelar</Button>
            <Button
              size="sm"
              onClick={() => {
                if (!pagoDialog) return;
                marcarPagoM.mutate({
                  id: pagoDialog.id,
                  orgId: pagoDialog.orgId,
                  pago: pagoDialog.pago,
                  paidAt: pagoDialog.paidAt || undefined,
                });
              }}
              disabled={marcarPagoM.isPending}
              className={pagoDialog?.pago ? "" : "bg-yellow-600 hover:bg-yellow-700"}
            >
              {marcarPagoM.isPending ? "Salvando..." : pagoDialog?.pago ? "Confirmar Pagamento" : "Reverter para Pendente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
