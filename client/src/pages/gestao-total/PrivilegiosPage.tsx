import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Loader2, ShieldCheck, ChevronDown, ChevronRight, Eye, Edit3
} from "lucide-react";

const SYSTEM_MODULES = [
  {
    key: "dashboard", label: "Dashboard",
    sections: [{ key: "visao_geral", label: "Visão Geral" }],
  },
  {
    key: "data_vip", label: "Data VIP",
    sections: [
      { key: "faturamento", label: "Faturamento" },
      { key: "colaboradores", label: "Colaboradores" },
      { key: "metas", label: "Metas" },
      { key: "servicos", label: "Serviços" },
      { key: "produtos", label: "Produtos" },
      { key: "sync", label: "Sincronização" },
    ],
  },
  {
    key: "gestao_total", label: "Gestão Total",
    sections: [
      { key: "dashboard", label: "Dashboard" },
      { key: "planejamento", label: "Planejamento" },
      { key: "processos", label: "Processos" },
      { key: "instrucoes", label: "Instruções de Trabalho" },
      { key: "tarefas", label: "Tarefas" },
      { key: "pessoas", label: "Pessoas (Cargos/Colaboradores)" },
      { key: "indicadores", label: "Indicadores" },
      { key: "financeiro", label: "Financeiro" },
      { key: "configuracao_financeira", label: "Configuração Financeira" },
      { key: "marketing", label: "Marketing" },
      { key: "documentos", label: "Documentos" },
      { key: "reunioes", label: "Reuniões" },
      { key: "ia_conselheiro", label: "IA Conselheiro" },
      { key: "configuracoes", label: "Configurações (sem APIs)" },
      { key: "privilegios", label: "Privilégios" },
    ],
  },
  {
    key: "vip_cam", label: "VIP Cam",
    sections: [
      { key: "dashboard", label: "Dashboard" },
      { key: "ao_vivo", label: "Câmera ao Vivo" },
      { key: "clientes", label: "Clientes" },
      { key: "historico", label: "Histórico" },
      { key: "metricas", label: "Métricas" },
      { key: "configuracoes", label: "Configurações" },
    ],
  },
  {
    key: "reputacao", label: "Reputação",
    sections: [
      { key: "dashboard", label: "Dashboard" },
      { key: "avaliacoes", label: "Avaliações" },
      { key: "respostas", label: "Respostas" },
      { key: "analise", label: "Análise" },
      { key: "integracoes", label: "Integrações" },
      { key: "config_ia", label: "Config. IA" },
    ],
  },
  {
    key: "auto_instagram", label: "Auto Instagram",
    sections: [
      { key: "dashboard", label: "Dashboard" },
      { key: "prompts", label: "Editor de Prompts" },
      { key: "aprovacao", label: "Fila de Aprovação" },
      { key: "logs", label: "Logs" },
      { key: "stories", label: "Stories" },
      { key: "diagnostico", label: "Diagnóstico" },
    ],
  },
  {
    key: "we_send", label: "We Send",
    sections: [
      { key: "campanhas", label: "Campanhas" },
      { key: "relatorios", label: "Relatórios" },
      { key: "configuracoes", label: "Configurações WAHA" },
    ],
  },
];

type Permission = { moduleKey: string; sectionKey: string; canView: number; canEdit: number };
type Role = { id: number; name: string; description: string | null; isSystem: number; permissions: Permission[] };
type PermMap = Record<string, { canView: number; canEdit: number }>;

function buildPermMap(permissions: Permission[]): PermMap {
  const map: PermMap = {};
  for (const p of permissions) {
    map[`${p.moduleKey}:${p.sectionKey}`] = { canView: p.canView, canEdit: p.canEdit };
  }
  return map;
}

function permMapToArray(map: PermMap): Permission[] {
  return Object.entries(map).map(([key, val]) => {
    const [moduleKey, sectionKey] = key.split(":");
    return { moduleKey, sectionKey, canView: val.canView, canEdit: val.canEdit };
  });
}

export default function PrivilegiosPage() {
  const { org } = useOrg();
  const orgId = org?.id;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permMap, setPermMap] = useState<PermMap>({});
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(["gestao_total"]));
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const rolesQuery = trpc.sysUsers.listRoles.useQuery(undefined, { enabled: !!orgId });
  const seedRoles = trpc.sysUsers.seedDefaultRoles.useMutation({
    onSuccess: (data) => { toast.success(data.message); rolesQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const createRole = trpc.sysUsers.createRole.useMutation({
    onSuccess: () => { toast.success("Perfil criado!"); setDialogOpen(false); rolesQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const updateRole = trpc.sysUsers.updateRole.useMutation({
    onSuccess: () => { toast.success("Perfil atualizado!"); setDialogOpen(false); rolesQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteRole = trpc.sysUsers.deleteRole.useMutation({
    onSuccess: () => { toast.success("Perfil removido."); setDeleteConfirm(null); rolesQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const roles = (rolesQuery.data as Role[] | undefined) ?? [];

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    const map: PermMap = {};
    for (const mod of SYSTEM_MODULES) {
      for (const sec of mod.sections) {
        map[`${mod.key}:${sec.key}`] = { canView: 1, canEdit: 0 };
      }
    }
    setPermMap(map);
    setDialogOpen(true);
  }

  function openEdit(role: Role) {
    setEditing(role);
    setName(role.name);
    setDescription(role.description ?? "");
    setPermMap(buildPermMap(role.permissions));
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!name.trim()) { toast.error("Informe o nome do perfil."); return; }
    const permissions = permMapToArray(permMap);
    if (editing) {
      updateRole.mutate({ id: editing.id, name, description, permissions });
    } else {
      createRole.mutate({ name, description, permissions });
    }
  }

  function toggleModule(moduleKey: string) {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleKey)) next.delete(moduleKey); else next.add(moduleKey);
      return next;
    });
  }

  function setModuleAll(moduleKey: string, field: "canView" | "canEdit", value: number) {
    const mod = SYSTEM_MODULES.find(m => m.key === moduleKey);
    if (!mod) return;
    setPermMap(prev => {
      const next = { ...prev };
      for (const sec of mod.sections) {
        const k = `${moduleKey}:${sec.key}`;
        next[k] = { ...(next[k] ?? { canView: 0, canEdit: 0 }), [field]: value };
        if (field === "canView" && value === 0) next[k].canEdit = 0;
      }
      return next;
    });
  }

  function setPerm(moduleKey: string, sectionKey: string, field: "canView" | "canEdit", value: number) {
    const k = `${moduleKey}:${sectionKey}`;
    setPermMap(prev => {
      const curr = prev[k] ?? { canView: 0, canEdit: 0 };
      const next = { ...curr, [field]: value };
      if (field === "canView" && value === 0) next.canEdit = 0;
      return { ...prev, [k]: next };
    });
  }

  const isLoading = createRole.isPending || updateRole.isPending;
  const totalSections = SYSTEM_MODULES.reduce((a, m) => a + m.sections.length, 0);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-500" />
            Perfis de Acesso
          </h1>
          <p className="text-sm text-muted-foreground">Defina o que cada perfil pode visualizar ou editar em cada módulo.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => seedRoles.mutate()} disabled={seedRoles.isPending}>
            {seedRoles.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            <span className="ml-2">Perfis Padrão</span>
          </Button>
          <Button onClick={openCreate} className="bg-amber-500 hover:bg-amber-600 text-black" size="sm">
            <Plus className="w-4 h-4 mr-2" /> Novo Perfil
          </Button>
        </div>
      </div>

      {/* Perfil Master fixo */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-500/20 rounded-full flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">Master (Administrador)</span>
                  <Badge className="bg-amber-500 text-black text-xs">Sistema</Badge>
                </div>
                <p className="text-sm text-muted-foreground">Acesso total. Login via Manus OAuth.</p>
              </div>
            </div>
            <Badge variant="outline" className="text-green-500 border-green-500/30">Acesso Total</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Lista de perfis */}
      {rolesQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
        </div>
      ) : roles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum perfil criado</p>
            <p className="text-sm mt-1">Clique em "Perfis Padrão" para gerar o perfil "Gestor de Unidade" automaticamente.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {roles.map(role => {
            const viewCount = role.permissions.filter(p => p.canView).length;
            const editCount = role.permissions.filter(p => p.canEdit).length;
            return (
              <Card key={role.id} className="border border-border">
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 bg-muted rounded-full flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{role.name}</span>
                          {role.isSystem === 1 && <Badge variant="secondary" className="text-xs">Padrão</Badge>}
                        </div>
                        {role.description && <p className="text-sm text-muted-foreground truncate">{role.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="hidden sm:flex gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {viewCount}/{totalSections}</span>
                        <span className="flex items-center gap-1"><Edit3 className="w-3.5 h-3.5" /> {editCount}/{totalSections}</span>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(role)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm(role.id)} disabled={role.isSystem === 1}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar: ${editing.name}` : "Novo Perfil de Acesso"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label>Nome do perfil</Label>
                <Input placeholder="Ex: Gestor de Unidade" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label>Descrição (opcional)</Label>
                <Input placeholder="Breve descrição..." value={description} onChange={e => setDescription(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base">Permissões por módulo</Label>
                <div className="flex gap-6 text-xs text-muted-foreground pr-1">
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> Ver</span>
                  <span className="flex items-center gap-1"><Edit3 className="w-3 h-3" /> Editar</span>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden divide-y divide-border">
                {SYSTEM_MODULES.map(mod => {
                  const isExpanded = expandedModules.has(mod.key);
                  const modPerms = mod.sections.map(s => permMap[`${mod.key}:${s.key}`] ?? { canView: 0, canEdit: 0 });
                  const allView = modPerms.every(p => p.canView === 1);
                  const allEdit = modPerms.every(p => p.canEdit === 1);

                  return (
                    <div key={mod.key}>
                      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleModule(mod.key)}>
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          <span className="font-medium text-sm">{mod.label}</span>
                          <Badge variant="secondary" className="text-xs">{mod.sections.length}</Badge>
                        </div>
                        <div className="flex items-center gap-6 pr-1" onClick={e => e.stopPropagation()}>
                          <Switch checked={allView} onCheckedChange={v => setModuleAll(mod.key, "canView", v ? 1 : 0)} className="scale-75" />
                          <Switch checked={allEdit} onCheckedChange={v => setModuleAll(mod.key, "canEdit", v ? 1 : 0)} className="scale-75" />
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="divide-y divide-border/50">
                          {mod.sections.map(sec => {
                            const k = `${mod.key}:${sec.key}`;
                            const perm = permMap[k] ?? { canView: 0, canEdit: 0 };
                            return (
                              <div key={sec.key} className="flex items-center justify-between px-6 py-2 hover:bg-muted/20">
                                <span className="text-sm text-foreground">{sec.label}</span>
                                <div className="flex items-center gap-6 pr-1">
                                  <Switch checked={perm.canView === 1} onCheckedChange={v => setPerm(mod.key, sec.key, "canView", v ? 1 : 0)} className="scale-75" />
                                  <Switch checked={perm.canEdit === 1} onCheckedChange={v => setPerm(mod.key, sec.key, "canEdit", v ? 1 : 0)} disabled={perm.canView === 0} className="scale-75" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                "Editar" só pode ser ativado quando "Ver" estiver ativo. Desativar "Ver" desativa "Editar" automaticamente.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isLoading} className="bg-amber-500 hover:bg-amber-600 text-black">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? "Salvar Alterações" : "Criar Perfil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog confirmar exclusão */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remover perfil?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Usuários com este perfil perderão suas permissões.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteConfirm !== null && deleteRole.mutate({ id: deleteConfirm })} disabled={deleteRole.isPending}>
              {deleteRole.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
