import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, UserCheck, UserX, Loader2, Shield, Building2, RefreshCw
} from "lucide-react";

type SysUserRow = {
  id: number;
  name: string;
  email: string;
  roleId: number | null;
  active: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  unitIds: number[];
};

type FormData = {
  name: string;
  email: string;
  password: string;
  roleId: string;
  unitIds: number[];
  active: number;
};

const EMPTY_FORM: FormData = {
  name: "",
  email: "",
  password: "",
  roleId: "",
  unitIds: [],
  active: 1,
};

export default function UsuariosSistemaPage() {
  const { org, units } = useOrg();
  const orgId = org?.id;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SysUserRow | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const usersQuery = trpc.sysUsers.listUsers.useQuery(undefined, { enabled: !!orgId });
  const rolesQuery = trpc.sysUsers.listRoles.useQuery(undefined, { enabled: !!orgId });
  const seedRoles = trpc.sysUsers.seedDefaultRoles.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      rolesQuery.refetch();
    },
  });

  const createUser = trpc.sysUsers.createUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário criado com sucesso!");
      setDialogOpen(false);
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateUser = trpc.sysUsers.updateUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário atualizado!");
      setDialogOpen(false);
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteUser = trpc.sysUsers.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário removido.");
      setDeleteConfirm(null);
      usersQuery.refetch();
    },
  });

  const users = (usersQuery.data as SysUserRow[] | undefined) ?? [];
  const roles = rolesQuery.data ?? [];

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(user: SysUserRow) {
    setEditing(user);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      roleId: user.roleId ? String(user.roleId) : "",
      unitIds: user.unitIds,
      active: user.active,
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name || !form.email) {
      toast.error("Preencha nome e e-mail.");
      return;
    }
    if (!editing && form.password.length < 6) {
      toast.error("Senha deve ter pelo menos 6 caracteres.");
      return;
    }

    const payload = {
      name: form.name,
      email: form.email,
      roleId: form.roleId ? Number(form.roleId) : undefined,
      unitIds: form.unitIds,
    };

    if (editing) {
      updateUser.mutate({
        id: editing.id,
        ...payload,
        ...(form.password ? { password: form.password } : {}),
        active: form.active,
      });
    } else {
      createUser.mutate({ ...payload, password: form.password });
    }
  }

  function toggleUnit(unitId: number) {
    setForm(f => ({
      ...f,
      unitIds: f.unitIds.includes(unitId)
        ? f.unitIds.filter(id => id !== unitId)
        : [...f.unitIds, unitId],
    }));
  }

  const getRoleName = (roleId: number | null) => {
    if (!roleId) return null;
    const role = roles.find((r: { id: number; name: string }) => r.id === roleId);
    return role?.name ?? null;
  };

  const getUnitName = (unitId: number) => {
    const unit = units?.find(u => u.id === unitId);
    return unit?.name ?? `Unidade ${unitId}`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-amber-500" />
            Usuários do Sistema
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Crie usuários com acesso por e-mail/senha, vincule unidades e defina perfis de acesso.
          </p>
        </div>
        <div className="flex gap-2">
          {roles.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => seedRoles.mutate()}
              disabled={seedRoles.isPending}
            >
              {seedRoles.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-2">Criar Perfis Padrão</span>
            </Button>
          )}
          <Button onClick={openCreate} className="bg-amber-500 hover:bg-amber-600 text-black">
            <Plus className="w-4 h-4 mr-2" /> Novo Usuário
          </Button>
        </div>
      </div>

      {/* Lista de usuários */}
      {usersQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum usuário cadastrado</p>
            <p className="text-sm mt-1">Clique em "Novo Usuário" para começar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {users.map(user => (
            <Card key={user.id} className="border border-border">
              <CardContent className="py-4 px-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${user.active ? "bg-amber-500/20 text-amber-500" : "bg-muted text-muted-foreground"}`}>
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">{user.name}</span>
                        {user.active ? (
                          <Badge variant="outline" className="text-xs text-green-500 border-green-500/30 shrink-0">Ativo</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">Inativo</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {/* Perfil */}
                    {getRoleName(user.roleId) && (
                      <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Shield className="w-3.5 h-3.5" />
                        <span>{getRoleName(user.roleId)}</span>
                      </div>
                    )}

                    {/* Unidades */}
                    {user.unitIds.length > 0 && (
                      <div className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{user.unitIds.length} unidade{user.unitIds.length > 1 ? "s" : ""}</span>
                      </div>
                    )}

                    {/* Último login */}
                    {user.lastLoginAt && (
                      <span className="hidden lg:block text-xs text-muted-foreground">
                        Último acesso: {new Date(user.lastLoginAt).toLocaleDateString("pt-BR")}
                      </span>
                    )}

                    {/* Ações */}
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(user)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirm(user.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Unidades expandidas em mobile */}
                {user.unitIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 md:hidden">
                    {user.unitIds.map(uid => (
                      <Badge key={uid} variant="secondary" className="text-xs">
                        {getUnitName(uid)}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label>Nome completo</Label>
                <Input
                  placeholder="Ex: João Silva"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  placeholder="joao@email.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label>{editing ? "Nova senha (deixe em branco para manter)" : "Senha"}</Label>
                <Input
                  type="password"
                  placeholder={editing ? "••••••••" : "Mínimo 6 caracteres"}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5 col-span-2">
                <Label>Perfil de acesso</Label>
                <Select
                  value={form.roleId}
                  onValueChange={v => setForm(f => ({ ...f, roleId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um perfil..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem perfil definido</SelectItem>
                    {roles.map((r: { id: number; name: string }) => (
                      <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {roles.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum perfil criado. Vá em{" "}
                    <a href="/gestao-total/privilegios" className="text-amber-500 hover:underline">Privilégios</a>{" "}
                    para criar perfis.
                  </p>
                )}
              </div>
            </div>

            {/* Seleção de unidades */}
            <div className="space-y-2">
              <Label>Unidades com acesso</Label>
              {!units || units.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma unidade disponível.</p>
              ) : (
                <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                  {units.map(unit => (
                    <div key={unit.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`unit-${unit.id}`}
                        checked={form.unitIds.includes(unit.id)}
                        onCheckedChange={() => toggleUnit(unit.id)}
                      />
                      <label
                        htmlFor={`unit-${unit.id}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {unit.name}
                      </label>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Selecione as unidades que este usuário poderá visualizar e gerenciar.
              </p>
            </div>

            {/* Status (apenas edição) */}
            {editing && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="active"
                  checked={form.active === 1}
                  onCheckedChange={v => setForm(f => ({ ...f, active: v ? 1 : 0 }))}
                />
                <label htmlFor="active" className="text-sm cursor-pointer">
                  Usuário ativo
                </label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={createUser.isPending || updateUser.isPending}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              {(createUser.isPending || updateUser.isPending) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : editing ? (
                <><UserCheck className="w-4 h-4 mr-2" /> Salvar</>
              ) : (
                <><Plus className="w-4 h-4 mr-2" /> Criar Usuário</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog confirmar exclusão */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover usuário?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Esta ação não pode ser desfeita. O usuário perderá acesso imediatamente.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm !== null && deleteUser.mutate({ id: deleteConfirm })}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserX className="w-4 h-4 mr-2" /> Remover</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
