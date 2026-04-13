import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import { Settings, Key, BarChart3, ClipboardList, Camera, Star, Instagram, MessageSquare, Save, CheckCircle, Building2, Users, Wifi, WifiOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/useOrg";
import { useApp } from "@/contexts/AppContext";

const MODULES = [
  { key: "data_vip" as const, label: "Data VIP", icon: BarChart3, color: "oklch(0.65 0.15 200)",
    fields: [{ key: "apiUnidadeId", label: "ID da Unidade na API", placeholder: "29", type: "text" }, { key: "apiHash", label: "Hash da API", placeholder: "y76y4lh2...", type: "password" }] },
  { key: "gestao_total" as const, label: "Gestão Total", icon: ClipboardList, color: "oklch(0.65 0.15 145)",
    fields: [{ key: "supabaseUrl", label: "Supabase URL", placeholder: "https://xxx.supabase.co", type: "url" }, { key: "supabaseKey", label: "Supabase Anon Key", placeholder: "eyJ...", type: "password" }] },
  { key: "vip_cam" as const, label: "VIP Cam", icon: Camera, color: "oklch(0.65 0.15 280)",
    fields: [{ key: "supabaseUrl", label: "Supabase URL", placeholder: "https://xxx.supabase.co", type: "url" }, { key: "supabaseKey", label: "Supabase Anon Key", placeholder: "eyJ...", type: "password" }, { key: "cameraId", label: "ID da Câmera", placeholder: "cam-001", type: "text" }] },
  { key: "reputacao" as const, label: "Reputação", icon: Star, color: "oklch(0.65 0.15 30)",
    fields: [{ key: "googlePlaceId", label: "Google Place ID", placeholder: "ChIJ...", type: "text" }, { key: "googleApiKey", label: "Google API Key", placeholder: "AIza...", type: "password" }] },
  { key: "auto_instagram" as const, label: "Auto Instagram", icon: Instagram, color: "oklch(0.65 0.15 320)",
    fields: [{ key: "instagramToken", label: "Instagram Access Token", placeholder: "EAA...", type: "password" }, { key: "instagramAccountId", label: "ID da Conta", placeholder: "17841...", type: "text" }] },
  { key: "we_send" as const, label: "We Send WhatsApp", icon: MessageSquare, color: "oklch(0.65 0.15 145)",
    fields: [{ key: "wahaUrl", label: "WAHA API URL", placeholder: "http://localhost:3000", type: "url" }, { key: "wahaApiKey", label: "WAHA API Key", placeholder: "waha-...", type: "password" }, { key: "sessionName", label: "Nome da Sessão", placeholder: "default", type: "text" }] },
];

function ModuleConfigCard({ mod, unitId, orgId }: { mod: typeof MODULES[number]; unitId: number; orgId: number }) {
  const Icon = mod.icon;
  const [values, setValues] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; account?: { username?: string } } | null>(null);

  const configsQuery = trpc.orgs.moduleConfigs.useQuery(
    { unitId, orgId },
    { enabled: unitId > 0 && orgId > 0 }
  );
  const accessQuery = trpc.orgs.moduleAccess.useQuery(
    { unitId, orgId },
    { enabled: unitId > 0 && orgId > 0 }
  );

  // Initialize values from existing config using useEffect (correct React pattern)
  useEffect(() => {
    if (configsQuery.data && !initialized) {
      const existing = configsQuery.data.find((c: any) => c.module === mod.key);
      if (existing?.config) {
        const cfg = existing.config as Record<string, string>;
        if (Object.keys(cfg).length > 0) {
          setValues(cfg);
          setInitialized(true);
        }
      } else {
        // No config yet — mark as initialized so we don't keep retrying
        setInitialized(true);
      }
    }
  }, [configsQuery.data, mod.key, initialized]);

  // Reset when unitId changes so new unit's config loads fresh
  useEffect(() => {
    setValues({});
    setInitialized(false);
  }, [unitId]);

  const currentAccess = accessQuery.data?.find((a: any) => a.module === mod.key);
  const isEnabled = currentAccess?.enabled ?? false;

  const saveConfig = trpc.orgs.saveModuleConfig.useMutation({
    onSuccess: () => {
      toast.success(`${mod.label} configurado com sucesso!`);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      configsQuery.refetch();
    },
    onError: (e: { message: string }) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  const setAccess = trpc.orgs.setModuleAccess.useMutation({
    onSuccess: () => accessQuery.refetch(),
    onError: (e: { message: string }) => toast.error(e.message),
  });

  // Teste de conexão (apenas para auto_instagram)
  const testConnectionMut = trpc.ig.testConnection.useMutation({
    onSuccess: (r) => {
      setTestResult(r);
      if (r.success) toast.success(r.message);
      else toast.error(`Erro de conexão: ${r.message}`);
    },
    onError: (e: { message: string }) => {
      setTestResult({ success: false, message: e.message });
      toast.error(`Erro: ${e.message}`);
    },
  });

  const handleSave = () => {
    if (!unitId || !orgId) {
      toast.error("Selecione uma unidade antes de salvar.");
      return;
    }
    setTestResult(null);
    saveConfig.mutate({ orgId, unitId, module: mod.key, config: values, active: isEnabled });
  };

  const handleTest = () => {
    setTestResult(null);
    testConnectionMut.mutate({ unitId });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${mod.color}20` }}>
              <Icon className="w-4 h-4" style={{ color: mod.color }} />
            </div>
            <CardTitle className="text-sm font-semibold">{mod.label}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{isEnabled ? "Ativo" : "Inativo"}</span>
            <Switch checked={isEnabled} onCheckedChange={checked => setAccess.mutate({ orgId, unitId, module: mod.key, enabled: checked })} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {configsQuery.isLoading ? (
          <div className="space-y-2">
            {mod.fields.map(f => <div key={f.key} className="h-8 rounded bg-muted/30 animate-pulse" />)}
          </div>
        ) : (
          mod.fields.map(field => (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-xs">{field.label}</Label>
              <Input
                type={field.type === "password" ? "password" : "text"}
                placeholder={field.placeholder}
                value={values[field.key] ?? ""}
                onChange={e => setValues(p => ({ ...p, [field.key]: e.target.value }))}
                className="text-xs h-8"
              />
            </div>
          ))
        )}
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            className="flex-1 gap-1.5 text-xs h-8"
            disabled={saveConfig.isPending || configsQuery.isLoading}
            onClick={handleSave}
          >
            {saved
              ? <><CheckCircle className="w-3.5 h-3.5" />Salvo!</>
              : <><Save className="w-3.5 h-3.5" />{saveConfig.isPending ? "Salvando..." : "Salvar"}</>}
          </Button>
          {mod.key === "auto_instagram" && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8 px-3"
              disabled={testConnectionMut.isPending}
              onClick={handleTest}
            >
              {testConnectionMut.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Wifi className="w-3.5 h-3.5" />}
              Testar
            </Button>
          )}
        </div>
        {mod.key === "auto_instagram" && testResult && (
          <div className={`mt-2 p-2.5 rounded-md text-xs flex items-start gap-2 ${
            testResult.success ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"
          }`}>
            {testResult.success
              ? <Wifi className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
              : <WifiOff className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
            <div>
              <p className={`font-medium ${testResult.success ? "text-green-400" : "text-red-400"}`}>
                {testResult.success ? "Conexão OK" : "Falha na conexão"}
              </p>
              <p className="text-muted-foreground">{testResult.message}</p>
              {testResult.account?.username && (
                <p className="text-muted-foreground">Conta: @{testResult.account.username}</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UsersTab({ orgId, units }: { orgId: number; units: Array<{ id: number; name: string }> }) {
  const usersQuery = trpc.orgs.orgUsers.useQuery({ orgId });
  const ROLE_LABELS: Record<string, string> = { master: "Master", org_admin: "Admin", unit_manager: "Gerente", team_lead: "Líder", colaborador: "Colaborador" };
  const ROLE_COLORS: Record<string, string> = { master: "bg-amber-500/10 text-amber-500", org_admin: "bg-blue-500/10 text-blue-500", unit_manager: "bg-green-500/10 text-green-500", team_lead: "bg-purple-500/10 text-purple-500", colaborador: "bg-gray-500/10 text-gray-400" };
  return (
    <div className="space-y-3">
      {usersQuery.isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 rounded-lg bg-card border border-border animate-pulse" />)}</div>
      ) : (usersQuery.data ?? []).length === 0 ? (
        <Card className="bg-card border-border border-dashed"><CardContent className="p-8 text-center">
          <Users className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
        </CardContent></Card>
      ) : (usersQuery.data ?? []).map((user: any) => (
        <Card key={user.profileId} className="bg-card border-border"><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-xs font-semibold text-primary">{(user.userName ?? "?")[0]?.toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{user.userName ?? "Usuário"}</p>
              <p className="text-xs text-muted-foreground truncate">{user.userEmail ?? ""}</p>
            </div>
            <Badge className={`text-xs shrink-0 ${ROLE_COLORS[user.role] ?? ""}`}>{ROLE_LABELS[user.role] ?? user.role}</Badge>
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}

export default function ConfiguracoesPage() {
  const { org, units } = useOrg();
  const { userRole, selectedUnit } = useApp();
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const isMasterOrAdmin = userRole === "master" || userRole === "org_admin";
  const activeUnitId = selectedUnitId ?? selectedUnit?.id ?? units[0]?.id;
  const activeUnit = units.find(u => u.id === activeUnitId);

  if (!org) return (
    <div className="p-6">
      <PageHeader title="Configurações" description="Configure os módulos por unidade" />
      <Card className="bg-card border-border"><CardContent className="p-10 text-center">
        <Settings className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Configure sua organização primeiro.</p>
      </CardContent></Card>
    </div>
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader title="Configurações" description="Configure as chaves de API e módulos por unidade" />
      <Tabs defaultValue="modulos">
        <TabsList className="h-8">
          <TabsTrigger value="modulos" className="text-xs h-6 px-3"><Key className="w-3 h-3 mr-1.5" />Módulos & APIs</TabsTrigger>
          {isMasterOrAdmin && <TabsTrigger value="usuarios" className="text-xs h-6 px-3"><Users className="w-3 h-3 mr-1.5" />Usuários</TabsTrigger>}
          <TabsTrigger value="organizacao" className="text-xs h-6 px-3"><Building2 className="w-3 h-3 mr-1.5" />Organização</TabsTrigger>
        </TabsList>
        <TabsContent value="modulos" className="space-y-4 mt-4">
          {isMasterOrAdmin && units.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Configurando:</span>
              {units.map(unit => (
                <button key={unit.id} onClick={() => setSelectedUnitId(unit.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                    activeUnitId === unit.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:border-border/60"
                  }`}>{unit.name}</button>
              ))}
            </div>
          )}
          {activeUnit && (
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Configurando: <strong className="text-foreground">{activeUnit.name}</strong></span>
            </div>
          )}
          {activeUnitId ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {MODULES.map(mod => (
                <ModuleConfigCard key={`${mod.key}-${activeUnitId}`} mod={mod} unitId={activeUnitId} orgId={org.id} />
              ))}
            </div>
          ) : (
            <Card className="bg-card border-border border-dashed"><CardContent className="p-8 text-center">
              <Key className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Selecione uma unidade para configurar os módulos.</p>
            </CardContent></Card>
          )}
        </TabsContent>
        {isMasterOrAdmin && <TabsContent value="usuarios" className="mt-4"><UsersTab orgId={org.id} units={units} /></TabsContent>}
        <TabsContent value="organizacao" className="mt-4">
          <Card className="bg-card border-border"><CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Building2 className="w-5 h-5 text-primary" /></div>
              <div><p className="text-sm font-semibold text-foreground">{org.name}</p>{(org as any).segment && <p className="text-xs text-muted-foreground">{(org as any).segment}</p>}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              <div><p className="font-medium text-foreground mb-0.5">Unidades</p><p>{units.length} unidade{units.length !== 1 ? "s" : ""} ativas</p></div>
              <div><p className="font-medium text-foreground mb-0.5">Slug</p><p>{org.slug}</p></div>
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
