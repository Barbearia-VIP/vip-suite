import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CreditCard,
  Building2,
  Users,
  Plus,
  Pencil,
  Trash2,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function currentReferencia() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const inicio = `${y}-${String(m).padStart(2, "0")}-01`;
  const fim = new Date(y, m, 0).toISOString().slice(0, 10);
  return { inicio, fim };
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Funcionario {
  id: number;
  nome: string;
  cargo: string | null;
  salario: string;
  diaPagamento: number;
  ativo: number;
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ConfiguracaoFinanceiraPage() {
  const { selectedUnit } = useApp();
  const orgId = selectedUnit?.orgId ?? 0;
  const unitId = selectedUnit?.id ?? 0;
  const referencia = currentReferencia();

  // ── Taxas ─────────────────────────────────────────────────────────────────
  const taxasQuery = trpc.gestaoTotal.finConfig.getTaxas.useQuery(
    { orgId, unitId },
    { enabled: !!orgId && !!unitId }
  );
  const [taxaCredito, setTaxaCredito] = useState("");
  const [taxaDebito, setTaxaDebito] = useState("");
  const [taxaBancaria, setTaxaBancaria] = useState("");
  const [taxaBancariaAtiva, setTaxaBancariaAtiva] = useState(false);
  const [taxaBancariaDia, setTaxaBancariaDia] = useState("1");

  useEffect(() => {
    if (taxasQuery.data) {
      setTaxaCredito(String(taxasQuery.data.taxaCredito ?? "0"));
      setTaxaDebito(String(taxasQuery.data.taxaDebito ?? "0"));
      setTaxaBancaria(String(taxasQuery.data.taxaBancaria ?? "0"));
      setTaxaBancariaAtiva(taxasQuery.data.taxaBancariaAtiva === 1);
      setTaxaBancariaDia(String(taxasQuery.data.taxaBancariaDia ?? "1"));
    }
  }, [taxasQuery.data]);

  const utils = trpc.useUtils();
  const saveTaxas = trpc.gestaoTotal.finConfig.saveTaxas.useMutation({
    onSuccess: (r) => {
      if (r.lancamentos > 0) {
        toast.success(`Taxas salvas! ${r.lancamentos} saída(s) lançadas no Financeiro.`);
      } else if (r.msg) {
        toast.success(r.msg);
      } else {
        toast.success("Taxas salvas com sucesso!");
      }
      utils.gestaoTotal.finConfig.getTaxas.invalidate();
      utils.gestaoTotal.finConfig.resumoLancamentos.invalidate();
    },
    onError: (e) => toast.error("Erro ao salvar taxas: " + e.message),
  });

  // ── Funcionários CLT ──────────────────────────────────────────────────────
  const funcQuery = trpc.gestaoTotal.finConfig.listFuncionarios.useQuery(
    { orgId, unitId },
    { enabled: !!orgId && !!unitId }
  );

  const [funcDialog, setFuncDialog] = useState(false);
  const [editingFunc, setEditingFunc] = useState<Funcionario | null>(null);
  const [funcNome, setFuncNome] = useState("");
  const [funcCargo, setFuncCargo] = useState("");
  const [funcSalario, setFuncSalario] = useState("");
  const [funcDia, setFuncDia] = useState("5");
  const [funcAtivo, setFuncAtivo] = useState(true);

  const createFunc = trpc.gestaoTotal.finConfig.createFuncionario.useMutation({
    onSuccess: () => {
      toast.success("Funcionário cadastrado!");
      utils.gestaoTotal.finConfig.listFuncionarios.invalidate();
      setFuncDialog(false);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const updateFunc = trpc.gestaoTotal.finConfig.updateFuncionario.useMutation({
    onSuccess: () => {
      toast.success("Funcionário atualizado!");
      utils.gestaoTotal.finConfig.listFuncionarios.invalidate();
      setFuncDialog(false);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const deleteFunc = trpc.gestaoTotal.finConfig.deleteFuncionario.useMutation({
    onSuccess: () => {
      toast.success("Funcionário removido.");
      utils.gestaoTotal.finConfig.listFuncionarios.invalidate();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  function openNewFunc() {
    setEditingFunc(null);
    setFuncNome("");
    setFuncCargo("");
    setFuncSalario("");
    setFuncDia("5");
    setFuncAtivo(true);
    setFuncDialog(true);
  }

  function openEditFunc(f: Funcionario) {
    setEditingFunc(f);
    setFuncNome(f.nome);
    setFuncCargo(f.cargo ?? "");
    setFuncSalario(f.salario);
    setFuncDia(String(f.diaPagamento));
    setFuncAtivo(f.ativo === 1);
    setFuncDialog(true);
  }

  function saveFunc() {
    const sal = parseFloat(funcSalario.replace(",", "."));
    if (!funcNome.trim() || isNaN(sal)) {
      toast.error("Preencha nome e salário.");
      return;
    }
    if (editingFunc) {
      updateFunc.mutate({
        id: editingFunc.id,
        orgId,
        nome: funcNome.trim(),
        cargo: funcCargo.trim() || undefined,
        salario: sal,
        diaPagamento: parseInt(funcDia) || 5,
        ativo: funcAtivo,
      });
    } else {
      createFunc.mutate({
        orgId,
        unitId,
        nome: funcNome.trim(),
        cargo: funcCargo.trim() || undefined,
        salario: sal,
        diaPagamento: parseInt(funcDia) || 5,
      });
    }
  }

  // ── Jobs automáticos ──────────────────────────────────────────────────────
  const aplicarTaxas = trpc.gestaoTotal.finConfig.aplicarTaxasCartao.useMutation({
    onSuccess: (r) => toast.success(r.msg),
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const lancarBancaria = trpc.gestaoTotal.finConfig.lancarTaxaBancaria.useMutation({
    onSuccess: (r) => toast.success(r.msg),
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const lancarSalarios = trpc.gestaoTotal.finConfig.lancarSalariosClt.useMutation({
    onSuccess: (r) => toast.success(r.msg),
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const resumoQuery = trpc.gestaoTotal.finConfig.resumoLancamentos.useQuery(
    { orgId, unitId, referencia },
    { enabled: !!orgId && !!unitId }
  );

  const totalAutoLancado = resumoQuery.data?.reduce((s, r) => s + r.total, 0) ?? 0;

  if (!orgId || !unitId) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Selecione uma unidade para configurar o financeiro.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-primary" />
          Configuração Financeira
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure taxas de cartão, taxa bancária e funcionários CLT. O sistema lança as saídas automaticamente no Financeiro.
        </p>
      </div>

      {/* Resumo do mês */}
      {resumoQuery.data && resumoQuery.data.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Lançamentos automáticos — {referencia}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {resumoQuery.data.map((r) => (
                <div key={r.categoria} className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary">{r.categoria}</Badge>
                  <span className="text-muted-foreground">{r.qtd}x</span>
                  <span className="font-semibold text-foreground">{fmtBRL(r.total)}</span>
                </div>
              ))}
              <div className="ml-auto text-sm font-bold text-foreground">
                Total: {fmtBRL(totalAutoLancado)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Taxas de Cartão ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="w-4 h-4 text-blue-500" />
            Taxas de Cartão
          </CardTitle>
          <CardDescription>
            O sistema calcula diariamente a taxa sobre o total vendido em cada modalidade (via Data VIP) e lança como despesa no Financeiro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Taxa Cartão de Crédito (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="Ex: 2.99"
                value={taxaCredito}
                onChange={(e) => setTaxaCredito(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Ex: 2.99 = 2,99% sobre vendas no crédito</p>
            </div>
            <div className="space-y-1">
              <Label>Taxa Cartão de Débito (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="Ex: 1.49"
                value={taxaDebito}
                onChange={(e) => setTaxaDebito(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Ex: 1.49 = 1,49% sobre vendas no débito</p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() =>
                saveTaxas.mutate({
                  orgId,
                  unitId,
                  taxaCredito: parseFloat(taxaCredito) || 0,
                  taxaDebito: parseFloat(taxaDebito) || 0,
                  taxaBancaria: parseFloat(taxaBancaria) || 0,
                  taxaBancariaAtiva,
                  taxaBancariaDia: parseInt(taxaBancariaDia) || 1,
                })
              }
              disabled={saveTaxas.isPending}
            >
              {saveTaxas.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Zap className="w-3.5 h-3.5" />}
              Salvar e Lançar Saídas do Mês
            </Button>
            <p className="text-xs text-muted-foreground">As saídas de taxa são calculadas dia a dia com base nas vendas do Data VIP.</p>
          </div>
        </CardContent>
      </Card>

      {/* ── Taxa Bancária ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="w-4 h-4 text-orange-500" />
            Taxa Bancária Mensal
          </CardTitle>
          <CardDescription>
            Valor fixo cobrado mensalmente pelo banco. O sistema lança automaticamente como despesa no dia configurado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={taxaBancariaAtiva}
              onCheckedChange={setTaxaBancariaAtiva}
            />
            <Label>Ativar taxa bancária mensal</Label>
          </div>
          {taxaBancariaAtiva && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Valor Mensal (R$)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 49.90"
                  value={taxaBancaria}
                  onChange={(e) => setTaxaBancaria(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Dia do mês para lançamento</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Ex: 5"
                  value={taxaBancariaDia}
                  onChange={(e) => setTaxaBancariaDia(e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                saveTaxas.mutate({
                  orgId,
                  unitId,
                  taxaCredito: parseFloat(taxaCredito) || 0,
                  taxaDebito: parseFloat(taxaDebito) || 0,
                  taxaBancaria: parseFloat(taxaBancaria) || 0,
                  taxaBancariaAtiva,
                  taxaBancariaDia: parseInt(taxaBancariaDia) || 1,
                })
              }
              disabled={saveTaxas.isPending}
            >
              Salvar Configuração
            </Button>
            {taxaBancariaAtiva && (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => lancarBancaria.mutate({ orgId, unitId, referencia })}
                disabled={lancarBancaria.isPending}
              >
                {lancarBancaria.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                Lançar Taxa de {referencia}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Funcionários CLT ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-4 h-4 text-green-500" />
                Funcionários CLT
              </CardTitle>
              <CardDescription className="mt-1">
                Cadastre funcionários com contrato CLT. O sistema lança o salário como despesa no dia configurado de cada mês.
              </CardDescription>
            </div>
            <Button size="sm" className="gap-1.5 shrink-0" onClick={openNewFunc}>
              <Plus className="w-3.5 h-3.5" />
              Novo Funcionário
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {funcQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando...
            </div>
          ) : !funcQuery.data || funcQuery.data.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum funcionário CLT cadastrado.</p>
              <p className="text-xs mt-1">Clique em "Novo Funcionário" para começar.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead className="text-right">Salário</TableHead>
                  <TableHead className="text-center">Dia Pgto.</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funcQuery.data.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{f.cargo ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {fmtBRL(parseFloat(f.salario))}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      Dia {f.diaPagamento}
                    </TableCell>
                    <TableCell className="text-center">
                      {f.ativo === 1 ? (
                        <Badge variant="default" className="text-xs bg-green-500/20 text-green-600 border-green-500/30">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Inativo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => openEditFunc(f as Funcionario)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Remover ${f.nome}?`)) {
                              deleteFunc.mutate({ id: f.id, orgId });
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Botão lançar salários */}
          {funcQuery.data && funcQuery.data.length > 0 && (
            <div className="flex items-center gap-3 pt-4 border-t mt-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Total mensal CLT:{" "}
                  <span className="text-primary">
                    {fmtBRL(
                      funcQuery.data
                        .filter((f) => f.ativo === 1)
                        .reduce((s, f) => s + parseFloat(f.salario), 0)
                    )}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {funcQuery.data.filter((f) => f.ativo === 1).length} funcionário(s) ativo(s)
                </p>
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => lancarSalarios.mutate({ orgId, unitId, referencia })}
                disabled={lancarSalarios.isPending}
              >
                {lancarSalarios.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                Lançar Salários de {referencia}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Aviso informativo ────────────────────────────────────────────────── */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Como funciona o lançamento automático</p>
              <ul className="space-y-1 list-disc list-inside text-xs">
                <li>
                  <strong>Taxas de cartão:</strong> clique em "Aplicar Taxas do Mês Atual" para calcular e lançar as despesas de cada dia com base nas vendas do Data VIP.
                </li>
                <li>
                  <strong>Taxa bancária:</strong> clique em "Lançar Taxa" para criar a despesa do mês. Pode ser refeita sem duplicação.
                </li>
                <li>
                  <strong>Salários CLT:</strong> clique em "Lançar Salários" para criar as despesas do mês para cada funcionário ativo.
                </li>
                <li>Todos os lançamentos usam chave única — clicar novamente apenas atualiza o valor, sem duplicar.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Dialog Funcionário ───────────────────────────────────────────────── */}
      <Dialog open={funcDialog} onOpenChange={setFuncDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingFunc ? "Editar Funcionário CLT" : "Novo Funcionário CLT"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                placeholder="Nome completo"
                value={funcNome}
                onChange={(e) => setFuncNome(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Cargo</Label>
              <Input
                placeholder="Ex: Atendente, Gerente..."
                value={funcCargo}
                onChange={(e) => setFuncCargo(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Salário (R$) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 1800.00"
                  value={funcSalario}
                  onChange={(e) => setFuncSalario(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Dia do pagamento</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Ex: 5"
                  value={funcDia}
                  onChange={(e) => setFuncDia(e.target.value)}
                />
              </div>
            </div>
            {editingFunc && (
              <div className="flex items-center gap-3">
                <Switch checked={funcAtivo} onCheckedChange={setFuncAtivo} />
                <Label>Funcionário ativo</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFuncDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveFunc}
              disabled={createFunc.isPending || updateFunc.isPending}
            >
              {createFunc.isPending || updateFunc.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : null}
              {editingFunc ? "Salvar Alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
