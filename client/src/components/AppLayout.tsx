import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  BarChart3,
  ClipboardList,
  Camera,
  Wifi,
  Play,
  Star,
  Instagram,
  MessageSquare,
  ChevronDown,
  Building2,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  Sun,
  Moon,
  ChevronRight,
  Users,
  Shield,
  KeyRound,
  TrendingUp,
  UserCheck,
  Target,
  RefreshCw,
  Scissors,
  Calendar,
  FileText,
  Activity,
  DollarSign,
  Briefcase,
  BookOpen,
  AlertTriangle,
  Megaphone,
  ShieldAlert,
  Brain,
  Map,
  ShoppingCart,
  Bot,
  BookMarked,
  Package,
  Zap,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useApp, ModuleId } from "@/contexts/AppContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTheme } from "../contexts/ThemeContext";
import { useChartTheme } from "../hooks/useChartTheme";
import { useSysPermissions } from "../hooks/useSysPermissions";
import { useSysUser } from "../contexts/SysUserContext";

interface Module {
  id: ModuleId;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  path: string;
  color: string;
  description: string;
}

const MODULES: Module[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    shortLabel: "Dashboard",
    icon: LayoutDashboard,
    path: "/dashboard",
    color: "oklch(0.76 0.145 72)",
    description: "Visão geral consolidada",
  },
  {
    id: "data_vip",
    label: "Data VIP",
    shortLabel: "Data VIP",
    icon: BarChart3,
    path: "/data-vip",
    color: "oklch(0.65 0.16 200)",
    description: "Analytics e faturamento",
  },
  {
    id: "gestao_total",
    label: "Gestão Total",
    shortLabel: "Gestão",
    icon: ClipboardList,
    path: "/gestao-total",
    color: "oklch(0.65 0.16 145)",
    description: "ERP operacional",
  },
  {
    id: "vip_cam",
    label: "VIP Cam",
    shortLabel: "VIP Cam",
    icon: Camera,
    path: "/vip-cam",
    color: "oklch(0.65 0.16 280)",
    description: "Reconhecimento facial",
  },
  {
    id: "reputacao",
    label: "Reputação",
    shortLabel: "Reputação",
    icon: Star,
    path: "/reputacao",
    color: "oklch(0.65 0.16 30)",
    description: "Avaliações e reviews",
  },
  {
    id: "auto_instagram",
    label: "Auto Instagram",
    shortLabel: "Instagram",
    icon: Instagram,
    path: "/auto-instagram",
    color: "oklch(0.65 0.16 320)",
    description: "Bot e engajamento",
  },
  {
    id: "we_send",
    label: "We Send",
    shortLabel: "WhatsApp",
    icon: MessageSquare,
    path: "/we-send",
    color: "oklch(0.65 0.16 145)",
    description: "Envio em massa",
  },
];

type SidebarItem =
  | { type?: "link"; label: string; path: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }
  | { type: "group"; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; children: { label: string; path: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }[] }
  | { type: "separator" };

const SIDEBAR_ITEMS: Record<ModuleId, SidebarItem[]> = {
  dashboard: [
    { label: "Visão Geral", path: "/dashboard", icon: LayoutDashboard },
    { label: "Unidades", path: "/dashboard/unidades", icon: Building2 },
    { label: "Usuários do Sistema", path: "/dashboard/usuarios", icon: Users },
    { label: "Perfis de Acesso", path: "/dashboard/permissoes", icon: Shield },
  ],
  data_vip: [
    { label: "Dashboard", path: "/data-vip", icon: LayoutDashboard },
    { label: "Mensal", path: "/data-vip/mensal", icon: TrendingUp },
    { label: "Faturamento", path: "/data-vip/faturamento", icon: DollarSign },
    { label: "Ranking", path: "/data-vip/ranking", icon: Star },
    { label: "Clientes", path: "/data-vip/clientes", icon: Users },
    { label: "Raio-X Clientes", path: "/data-vip/raio-x", icon: Activity },
    { label: "Calendário", path: "/data-vip/calendario", icon: Calendar },
    { label: "Status Sincronização", path: "/data-vip/sync", icon: RefreshCw },
    { type: "separator" },
    { type: "group", label: "Gestão de Colaboradores", icon: UserCheck, children: [
      { label: "Colaboradores", path: "/data-vip/colaboradores", icon: UserCheck },
      { label: "Comissões", path: "/data-vip/comissoes", icon: DollarSign },
      { label: "Metas", path: "/data-vip/metas", icon: Target },
      { label: "Serviços", path: "/data-vip/servicos", icon: Scissors },
      { label: "Produtos", path: "/data-vip/produtos", icon: Package },
    ] },
  ],
  gestao_total: [
    { label: "Dashboard", path: "/gestao-total", icon: LayoutDashboard },
    { label: "Planejamento", path: "/gestao-total/planejamento", icon: Map },
    { label: "Processos", path: "/gestao-total/processos", icon: Activity },
    { label: "Instruções de Trabalho", path: "/gestao-total/instrucoes", icon: BookOpen },
    { label: "Tarefas", path: "/gestao-total/tarefas", icon: ClipboardList },
    { type: "group", label: "Pessoas", icon: Users, children: [
      { label: "Cargos", path: "/gestao-total/cargos", icon: Briefcase },
      { label: "Colaboradores", path: "/gestao-total/colaboradores", icon: UserCheck },
    ]},
    { label: "Indicadores", path: "/gestao-total/indicadores", icon: BarChart3 },
    { type: "group", label: "Financeiro", icon: DollarSign, children: [
      { label: "Financeiro", path: "/gestao-total/financeiro", icon: DollarSign },
      { label: "Configuração Financeira", path: "/gestao-total/configuracao-financeira", icon: Settings },
    ]},
    { type: "separator" },
    { label: "Marketing", path: "/gestao-total/marketing", icon: Megaphone },
    { label: "Documentos", path: "/gestao-total/documentos", icon: FileText },
    { label: "Reuniões", path: "/gestao-total/reunioes", icon: Calendar },
    { label: "IA Conselheiro", path: "/gestao-total/ia", icon: Brain },
    { label: "Configurações", path: "/gestao-total/configuracoes", icon: Settings },

    { type: "separator" },
    { label: "Guia do Sistema", path: "/gestao-total/guia", icon: BookMarked },
  ],
  vip_cam: [
    { label: "Dashboard", path: "/vip-cam", icon: LayoutDashboard },
    { label: "Câmera ao Vivo", path: "/vip-cam/ao-vivo", icon: Play },
    { label: "Clientes", path: "/vip-cam/clientes", icon: Users },
    { label: "Histórico", path: "/vip-cam/historico", icon: ClipboardList },
    { label: "Métricas", path: "/vip-cam/relatorios", icon: BarChart3 },
    { label: "Configurações", path: "/vip-cam/configuracoes", icon: Wifi },
  ],
  reputacao: [
    { label: "Dashboard", path: "/reputacao", icon: LayoutDashboard },
    { label: "Avaliações", path: "/reputacao/avaliacoes", icon: Star },
    { label: "Respostas", path: "/reputacao/respostas", icon: MessageSquare },
    { label: "Análise", path: "/reputacao/analise", icon: BarChart3 },
    { label: "Histórico IA", path: "/reputacao/historico-ia", icon: ClipboardList },
    { label: "Integrações", path: "/reputacao/integracoes", icon: Settings },
    { label: "Config. IA", path: "/reputacao/config-ia", icon: Bot },
  ],
  auto_instagram: [
    { label: "Dashboard", path: "/auto-instagram", icon: LayoutDashboard },
    { label: "Editor de Prompts", path: "/auto-instagram/prompts", icon: MessageSquare },
    { label: "Histórico de Respostas", path: "/auto-instagram/aprovacao", icon: ClipboardList },
    { label: "Sem Resposta", path: "/auto-instagram/sem-resposta", icon: MessageCircle },
    { label: "Logs", path: "/auto-instagram/logs", icon: BarChart3 },
    { label: "Stories", path: "/auto-instagram/stories", icon: Star },
    { label: "Diagnóstico", path: "/auto-instagram/diagnostico", icon: Settings },
  ],
  we_send: [
    { label: "Nova Campanha", path: "/we-send", icon: MessageSquare },
    { label: "Campanhas", path: "/we-send/campanhas", icon: ClipboardList },
    { label: "Relatórios", path: "/we-send/relatorios", icon: BarChart3 },
    { label: "Configurações WAHA", path: "/we-send/configuracoes", icon: Settings },
  ],
};

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location, navigate] = useLocation();
  const { activeModule, setActiveModule, selectedUnit, setSelectedUnit, availableUnits, setAvailableUnits, sidebarCollapsed, setSidebarCollapsed, userRole } = useApp();
  const { user, logout } = useAuth();
  const { sysUser } = useSysUser();
  const { theme, themeSource, toggleTheme } = useTheme();
  const ct = useChartTheme();
  const isDark = theme === "dark";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [cpCurrentPwd, setCpCurrentPwd] = useState("");
  const [cpNewPwd, setCpNewPwd] = useState("");
  const [cpConfirmPwd, setCpConfirmPwd] = useState("");

  const changePasswordMutation = trpc.sysUsers.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Senha alterada com sucesso!");
      setChangePasswordOpen(false);
      setCpCurrentPwd(""); setCpNewPwd(""); setCpConfirmPwd("");
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao alterar senha.");
    },
  });

  const handleChangePassword = () => {
    if (cpNewPwd !== cpConfirmPwd) {
      toast.error("A nova senha e a confirmação não coincidem.");
      return;
    }
    if (cpNewPwd.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    changePasswordMutation.mutate({ currentPassword: cpCurrentPwd, newPassword: cpNewPwd });
  };

  // Queries OAuth só habilitadas para usuários Master (não para usuários de unidade)
  const isOAuthUser = !!user && !sysUser;

  const orgsQuery = trpc.orgs.list.useQuery(undefined, { enabled: isOAuthUser });
  const firstOrgId = orgsQuery.data?.[0]?.id ?? 0;

  // Badge de defasagem do Data VIP
  const syncStatusQuery = trpc.sync.status.useQuery(undefined, {
    enabled: activeModule === "data_vip" && isOAuthUser,
    refetchInterval: 5 * 60 * 1000, // atualiza a cada 5 min
    staleTime: 2 * 60 * 1000,
  });
  const ultimaSyncGlobal: string | Date | null = syncStatusQuery.data
    ?.filter((r: any) => r.ultima_sync)
    .map((r: any) => r.ultima_sync as string | Date)
    .sort((a: any, b: any) => {
      const ta = a instanceof Date ? a.getTime() : new Date(String(a).replace(" ", "T") + (String(a).endsWith("Z") ? "" : "Z")).getTime();
      const tb = b instanceof Date ? b.getTime() : new Date(String(b).replace(" ", "T") + (String(b).endsWith("Z") ? "" : "Z")).getTime();
      return ta - tb;
    })
    .at(-1) ?? null;
  // Superjson pode retornar Date ou string — normalizar para Date
  const parseUTC = (s: string | Date): Date => {
    if (s instanceof Date) return s;
    if (!s.endsWith("Z") && !s.includes("+")) return new Date(s.replace(" ", "T") + "Z");
    return new Date(s);
  };

  const syncDefasagemLabel = (() => {
    if (!ultimaSyncGlobal) return null;
    const diff = Date.now() - parseUTC(ultimaSyncGlobal).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h >= 24) return `${Math.floor(h / 24)}d atrás`;
    if (h > 0) return `${h}h${m > 0 ? ` ${m}min` : ""} atrás`;
    if (m > 0) return `${m}min atrás`;
    return "Agora";
  })();
  const syncDefasagemCor = (() => {
    if (!ultimaSyncGlobal) return "text-muted-foreground";
    const diff = Date.now() - parseUTC(ultimaSyncGlobal).getTime();
    if (diff > 8 * 3600000) return "text-red-400";
    if (diff > 4 * 3600000) return "text-yellow-400";
    return "text-green-400";
  })();
  // Para usuários OAuth (Master): busca unidades via orgs.units
  const unitsQuery = trpc.orgs.units.useQuery(
    { orgId: firstOrgId },
    { enabled: isOAuthUser && !!firstOrgId }
  );

  // Para usuários de unidade (sysUser): busca unidades via sysUsers.unitsByOrg
  const sysUnitsQuery = trpc.sysUsers.unitsByOrg.useQuery(
    { orgId: sysUser?.orgId ?? 0 },
    { enabled: !!sysUser && (sysUser.orgId ?? 0) > 0, staleTime: 5 * 60 * 1000 }
  );

  useEffect(() => {
    if (unitsQuery.data && unitsQuery.data.length > 0) {
      const mapped = unitsQuery.data.map((u: any) => ({
        id: u.id,
        name: u.name,
        slug: u.slug,
        orgId: u.orgId,
        city: u.city ?? undefined,
        state: u.state ?? undefined,
      }));
      setAvailableUnits(mapped);
      const stored = localStorage.getItem("vip_selected_unit");
      const isMasterOrAdmin = userRole === "master" || userRole === "org_admin";
      if (!stored && mapped.length > 0 && !isMasterOrAdmin) {
        setSelectedUnit(mapped[0]);
      }
    }
  }, [unitsQuery.data]);

  // Quando sysUser carrega: filtrar unidades permitidas e selecionar a primeira automaticamente
  useEffect(() => {
    if (!sysUser || !sysUnitsQuery.data) return;
    const allUnits = sysUnitsQuery.data as Array<{ id: number; name: string; slug: string; orgId: number; city?: string | null; state?: string | null }>;
    const allowed = sysUser.allowedUnitIds.length > 0
      ? allUnits.filter(u => sysUser.allowedUnitIds.includes(u.id))
      : allUnits; // se não há restrição, mostra todas
    const mapped = allowed.map(u => ({
      id: u.id,
      name: u.name,
      slug: u.slug,
      orgId: u.orgId,
      city: u.city ?? undefined,
      state: u.state ?? undefined,
    }));
    setAvailableUnits(mapped);
    // Selecionar automaticamente: verificar se há unidade salva no localStorage que seja permitida
    const stored = localStorage.getItem("vip_selected_unit");
    let storedUnit: typeof mapped[0] | null = null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        storedUnit = mapped.find(u => u.id === parsed.id) ?? null;
      } catch {}
    }
    if (storedUnit) {
      setSelectedUnit(storedUnit);
    } else if (mapped.length > 0) {
      // Selecionar a primeira unidade permitida automaticamente
      setSelectedUnit(mapped[0]);
    }
  }, [sysUser, sysUnitsQuery.data]);

  const [adminDefaultApplied, setAdminDefaultApplied] = useState(false);
  useEffect(() => {
    if (!adminDefaultApplied && userRole && (userRole === "master" || userRole === "org_admin")) {
      const stored = localStorage.getItem("vip_selected_unit");
      const hasManualChoice = localStorage.getItem("vip_unit_manually_chosen");
      if (stored && !hasManualChoice) {
        setSelectedUnit(null);
      }
      setAdminDefaultApplied(true);
    }
  }, [userRole, adminDefaultApplied]);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      logout();
      navigate("/");
    },
  });

  const sysLogoutMutation = trpc.sysUsers.logout.useMutation({
    onSuccess: () => {
      navigate("/");
      // Recarrega para limpar o estado do sysUser
      window.location.href = "/";
    },
  });

  const handleLogout = () => {
    if (sysUser) {
      sysLogoutMutation.mutate();
    } else {
      logoutMutation.mutate();
    }
  };

  const { canViewPath } = useSysPermissions();

  // Sincroniza o módulo ativo com a URL ao navegar diretamente (ex: link externo, refresh ou link no sidebar)
  useEffect(() => {
    const matched = [...MODULES]
      .sort((a, b) => b.path.length - a.path.length)
      .find(m => location === m.path || location.startsWith(m.path + "/"));
    if (matched && matched.id !== activeModule) {
      setActiveModule(matched.id);
    }
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentModule = MODULES.find((m) => m.id === activeModule) ?? MODULES[0];
  // Itens restritos ao Master (usuário OAuth) — ocultos para gestores de unidade (sysUser)
  const MASTER_ONLY_PATHS = new Set([
    "/dashboard/unidades",
    "/dashboard/usuarios",
    "/dashboard/permissoes",
  ]);

  const sidebarItems = SIDEBAR_ITEMS[activeModule].filter((item) => {
    if (item.type === "separator") return true;
    if (item.type === "group") {
      return item.children.some((child) => canViewPath(child.path));
    }
    const path = (item as any).path as string | undefined;
    // Ocultar itens restritos ao Master para usuários de unidade
    if (sysUser && path && MASTER_ONLY_PATHS.has(path)) return false;
    if (path === "/data-vip/ranking" && selectedUnit !== null) return false;
    return canViewPath(path ?? "");
  });

  const handleModuleClick = (module: Module) => {
    setActiveModule(module.id);
    navigate(module.path);
    setMobileMenuOpen(false);
  };

  // Suporte a ambos os tipos de usuário: OAuth (Master) e e-mail/senha (unidade)
  const displayName = sysUser?.name ?? user?.name ?? "Usuário";
  const displayEmail = sysUser?.email ?? user?.email ?? "";
  const initials = displayName
    ? displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── TOP NAVIGATION BAR ── */}
      <header
        className="h-14 sticky top-0 z-50 flex items-center"
        style={{
          background: isDark ? "oklch(0.075 0.008 260 / 0.92)" : "oklch(0.99 0.002 80 / 0.95)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderBottom: isDark ? "1px solid oklch(0.22 0.014 260 / 0.6)" : "1px solid oklch(0.88 0.006 260 / 0.8)",
          boxShadow: isDark ? "0 1px 0 0 oklch(1 0 0 / 0.03) inset, 0 4px 24px -4px oklch(0 0 0 / 0.4)" : "0 1px 0 0 oklch(0 0 0 / 0.04) inset, 0 2px 12px -2px oklch(0 0 0 / 0.08)",
          transition: "background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease",
        }}
      >
        <div className="flex items-center h-full w-full">
          {/* Logo */}
          <div
            className="flex items-center gap-2.5 px-4 h-full shrink-0"
            style={{
              minWidth: sidebarCollapsed ? "56px" : "208px",
              borderRight: isDark ? "1px solid oklch(0.22 0.014 260 / 0.5)" : "1px solid oklch(0.88 0.006 260 / 0.7)",
              transition: "min-width 0.2s ease",
            }}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, oklch(0.76 0.145 72) 0%, oklch(0.68 0.16 65) 100%)",
                boxShadow: "0 0 16px oklch(0.76 0.145 72 / 0.35)",
              }}
            >
              <Zap className="w-4 h-4" style={{ color: isDark ? "oklch(0.08 0.01 260)" : "oklch(0.98 0 0)" }} />
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col leading-none">
                <span
                  className="font-bold text-sm tracking-tight font-display"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.84 0.14 80) 0%, oklch(0.70 0.16 60) 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  VIP Suite
                </span>
                <span className="text-[9px] text-muted-foreground tracking-widest uppercase">Platform</span>
              </div>
            )}
          </div>

          {/* Module tabs — desktop */}
          <nav className="hidden lg:flex items-center h-full flex-1 overflow-x-auto px-1">
            {MODULES.map((module) => {
              const Icon = module.icon;
              const isActive = activeModule === module.id;
              return (
                <button
                  key={module.id}
                  onClick={() => handleModuleClick(module)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3.5 h-full text-xs font-medium transition-all whitespace-nowrap",
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  style={{
                    color: isActive ? module.color : undefined,
                  }}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${module.color}, transparent)`,
                        boxShadow: `0 0 8px ${module.color}`,
                      }}
                    />
                  )}
                  {/* Hover bg */}
                  <span
                    className={cn(
                      "absolute inset-x-1 inset-y-2 rounded-md transition-all",
                      isActive
                        ? "opacity-100"
                        : "opacity-0 hover:opacity-100"
                    )}
                    style={{
                      background: isActive
                        ? `${module.color}12`
                        : isDark ? "oklch(0.22 0.014 260 / 0.4)" : "oklch(0.92 0.005 80 / 0.6)",
                    }}
                  />
                  <Icon className="w-3.5 h-3.5 relative z-10" />
                  <span className="relative z-10">{module.shortLabel}</span>
                </button>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-1.5 px-3 ml-auto">
            {/* Badge de defasagem do Data VIP */}
            {activeModule === "data_vip" && syncDefasagemLabel && (
              <button
                onClick={() => navigate("/data-vip/sync")}
                className={`hidden sm:flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full border transition-all hover:opacity-80 ${syncDefasagemCor}`}
                style={{
                  borderColor: "currentColor",
                  opacity: 0.85,
                  background: isDark ? "oklch(0.14 0.01 260 / 0.6)" : "oklch(0.97 0.003 80 / 0.8)",
                }}
                title="Dados sincronizados há..."
              >
                <RefreshCw className="w-2.5 h-2.5" />
                {syncDefasagemLabel}
              </button>
            )}
            {/* Unit selector: somente leitura para sysUser com uma única unidade */}
            {sysUser && (sysUser.allowedUnitIds.length === 1 || (sysUser.allowedUnitIds.length === 0 && availableUnits.length <= 1)) ? (
              <div
                className="h-8 text-xs gap-1.5 hidden sm:flex items-center px-3 rounded-md"
                style={{
                  background: isDark ? "oklch(0.155 0.012 260 / 0.8)" : "oklch(0.96 0.004 80 / 0.9)",
                  border: isDark ? "1px solid oklch(0.28 0.015 260 / 0.6)" : "1px solid oklch(0.85 0.006 260 / 0.8)",
                  color: isDark ? "oklch(0.85 0.006 80)" : "oklch(0.25 0.010 260)",
                }}
                title="Sua unidade vinculada"
              >
                <Building2 className="w-3.5 h-3.5 opacity-70" />
                <span className="max-w-[120px] truncate">
                  {selectedUnit ? selectedUnit.name : "Minha Unidade"}
                </span>
              </div>
            ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 hidden sm:flex"
                  style={{
                    background: isDark ? "oklch(0.155 0.012 260 / 0.8)" : "oklch(0.96 0.004 80 / 0.9)",
                    border: isDark ? "1px solid oklch(0.28 0.015 260 / 0.6)" : "1px solid oklch(0.85 0.006 260 / 0.8)",
                    color: isDark ? "oklch(0.85 0.006 80)" : "oklch(0.25 0.010 260)",
                  }}
                >
                  <Building2 className="w-3.5 h-3.5 opacity-70" />
                  <span className="max-w-[120px] truncate">
                    {selectedUnit ? selectedUnit.name : "Todas as Unidades"}
                  </span>
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Selecionar Unidade</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/* Opção "Todas as Unidades" apenas para Master/Admin OAuth */}
                {!sysUser && (
                  <DropdownMenuItem onClick={() => { setSelectedUnit(null); localStorage.setItem("vip_unit_manually_chosen", "1"); }} className="text-xs">
                    <Building2 className="w-3.5 h-3.5 mr-2" />
                    Todas as Unidades
                    {!selectedUnit && <Badge variant="secondary" className="ml-auto text-xs py-0">Ativo</Badge>}
                  </DropdownMenuItem>
                )}
                {availableUnits.map((unit) => (
                  <DropdownMenuItem key={unit.id} onClick={() => { setSelectedUnit(unit); localStorage.setItem("vip_unit_manually_chosen", "1"); }} className="text-xs">
                    <Building2 className="w-3.5 h-3.5 mr-2" />
                    {unit.name}
                    {selectedUnit?.id === unit.id && <Badge variant="secondary" className="ml-auto text-xs py-0">Ativo</Badge>}
                  </DropdownMenuItem>
                ))}
                {availableUnits.length === 0 && (
                  <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                    Nenhuma unidade cadastrada
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            )}

            {/* Theme toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground relative"
              onClick={toggleTheme}
              title={
                themeSource === 'system'
                  ? `Seguindo o sistema (${theme === 'dark' ? 'escuro' : 'claro'}) — clique para fixar`
                  : theme === 'dark'
                  ? 'Tema escuro (fixo) — clique para claro'
                  : 'Tema claro (fixo) — clique para escuro'
              }
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
              {/* Ponto indicando que o tema segue o sistema */}
              {themeSource === 'system' && (
                <span
                  className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                  style={{ background: "oklch(0.76 0.145 72)" }}
                />
              )}
            </Button>

            {/* Notifications */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 relative text-muted-foreground hover:text-foreground"
            >
              <Bell className="w-4 h-4" />
            </Button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 px-2 hover:bg-accent/50"
                >
                  <Avatar className="h-6 w-6">
                    <AvatarFallback
                      className="text-xs font-bold"
                      style={{
                        background: "linear-gradient(135deg, oklch(0.76 0.145 72) 0%, oklch(0.68 0.16 65) 100%)",
                        color: isDark ? "oklch(0.08 0.01 260)" : "oklch(0.98 0 0)",
                      }}
                    >
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs hidden md:block max-w-[100px] truncate text-foreground/80">{displayName}</span>
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs">
                  <div className="font-medium truncate">{displayName}</div>
                  <div className="text-muted-foreground truncate">{displayEmail}</div>
                  {sysUser && (
                    <div className="text-[10px] text-amber-500 mt-0.5">Usuário de Unidade</div>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {sysUser ? (
                  <DropdownMenuItem onClick={() => setChangePasswordOpen(true)} className="text-xs">
                    <KeyRound className="w-3.5 h-3.5 mr-2" />
                    Trocar Senha
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => navigate("/configuracoes")} className="text-xs">
                    <Settings className="w-3.5 h-3.5 mr-2" />
                    Configurações
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-xs text-destructive focus:text-destructive"
                >
                  <LogOut className="w-3.5 h-3.5 mr-2" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 lg:hidden text-muted-foreground"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile module menu */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden z-40"
          style={{
            background: isDark ? "oklch(0.095 0.008 260 / 0.97)" : "oklch(0.99 0.002 80 / 0.97)",
            backdropFilter: "blur(16px)",
            borderBottom: isDark ? "1px solid oklch(0.22 0.014 260 / 0.5)" : "1px solid oklch(0.88 0.006 260 / 0.7)",
            transition: "background 0.3s ease, border-color 0.3s ease",
          }}
        >
          <div className="grid grid-cols-4 gap-0">
            {MODULES.map((module) => {
              const Icon = module.icon;
              const isActive = activeModule === module.id;
              return (
                <button
                  key={module.id}
                  onClick={() => handleModuleClick(module)}
                  className="flex flex-col items-center gap-1 p-3 text-xs transition-all"
                  style={{
                    color: isActive ? module.color : isDark ? "oklch(0.55 0.012 260)" : "oklch(0.45 0.010 260)",
                    background: isActive ? `${module.color}10` : "transparent",
                  }}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] leading-tight text-center">{module.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={cn(
            "hidden lg:flex flex-col shrink-0 transition-all duration-200",
          )}
          style={{
            width: sidebarCollapsed ? "56px" : "208px",
            background: isDark ? "oklch(0.075 0.008 260)" : "oklch(0.975 0.003 80)",
            borderRight: isDark ? "1px solid oklch(0.175 0.012 260 / 0.8)" : "1px solid oklch(0.88 0.006 260 / 0.8)",
            transition: "background 0.3s ease, border-color 0.3s ease, width 0.2s ease",
          }}
        >
          {/* Module header */}
          <div
            className="flex items-center gap-2 px-3 py-3"
            style={{ borderBottom: isDark ? "1px solid oklch(0.175 0.012 260 / 0.8)" : "1px solid oklch(0.88 0.006 260 / 0.7)" }}
          >
            {!sidebarCollapsed && (
              <>
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  style={{
                    background: `${currentModule.color}18`,
                    border: `1px solid ${currentModule.color}30`,
                  }}
                >
                  <currentModule.icon className="w-3.5 h-3.5" style={{ color: currentModule.color }} />
                </div>
                <span className="text-xs font-semibold truncate flex-1" style={{ color: isDark ? "oklch(0.88 0.006 80)" : "oklch(0.20 0.010 260)" }}>
                  {currentModule.label}
                </span>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 ml-auto text-muted-foreground hover:text-foreground"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", sidebarCollapsed ? "" : "rotate-180")} />
            </Button>
          </div>

          {/* Sidebar nav items */}
          <nav className="flex-1 py-2 overflow-y-auto">
            {sidebarItems.map((item, idx) => {
              if (item.type === "separator") {
                return (
                  <div
                    key={`sep-${idx}`}
                    className="my-1.5 mx-3"
                    style={{ height: "1px", background: isDark ? "oklch(0.175 0.012 260 / 0.6)" : "oklch(0.88 0.006 260 / 0.6)" }}
                  />
                );
              }
              if (item.type === "group") {
                const GroupIcon = item.icon;
                return (
                  <div key={`group-${item.label}`}>
                    {!sidebarCollapsed && (
                      <div className="flex items-center gap-1.5 px-4 py-1.5 mt-1">
                        <GroupIcon className="w-3 h-3" style={{ color: ct.textMuted }} />
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: ct.textMuted }}
                        >
                          {item.label}
                        </span>
                      </div>
                    )}
                    {item.children.filter((child) => canViewPath(child.path)).map((child) => {
                      const ChildIcon = child.icon;
                      const isActive = location === child.path;
                      return (
                        <Link
                          key={child.path}
                          href={child.path}
                          className={cn(
                            "flex items-center gap-2.5 py-2 mx-1.5 rounded-lg text-xs transition-all",
                            sidebarCollapsed ? "px-2.5 justify-center" : "px-3.5",
                          )}
                          style={
                            isActive
                              ? {
                                  background: `${currentModule.color}15`,
                                  color: currentModule.color,
                                  fontWeight: 500,
                                  border: `1px solid ${currentModule.color}25`,
                                }
                              : {
                                  color: ct.textMuted,
                                  border: "1px solid transparent",
                                }
                          }
                          title={sidebarCollapsed ? child.label : undefined}
                        >
                          <ChildIcon className="w-3.5 h-3.5 shrink-0" />
                          {!sidebarCollapsed && <span className="truncate">{child.label}</span>}
                        </Link>
                      );
                    })}
                  </div>
                );
              }
              const Icon = item.icon;
              const isActive = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={cn(
                    "flex items-center gap-2.5 py-2 mx-1.5 rounded-lg text-xs transition-all",
                    sidebarCollapsed ? "px-2.5 justify-center" : "px-3",
                  )}
                  style={
                    isActive
                      ? {
                          background: `${currentModule.color}15`,
                          color: currentModule.color,
                          fontWeight: 500,
                          border: `1px solid ${currentModule.color}25`,
                        }
                      : {
                          color: ct.textMuted,
                          border: "1px solid transparent",
                        }
                  }
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Sidebar footer — visível apenas para master e org_admin */}
          {(userRole === "master" || userRole === "org_admin" || (!sysUser && !userRole)) && (
            <div
              className="p-2"
              style={{ borderTop: isDark ? "1px solid oklch(0.175 0.012 260 / 0.8)" : "1px solid oklch(0.88 0.006 260 / 0.7)" }}
            >
              <button
                onClick={() => navigate("/configuracoes")}
                className={cn(
                  "w-full flex items-center gap-2.5 py-2 rounded-lg text-xs transition-all",
                  sidebarCollapsed ? "px-2.5 justify-center" : "px-3",
                )}
                style={{ color: ct.textMuted }}
                title={sidebarCollapsed ? "Configurações" : undefined}
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                {!sidebarCollapsed && <span>Configurações</span>}
              </button>
            </div>
          )}
        </aside>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-background">
          {children}
        </main>
      </div>

      {/* Modal: Trocar Senha (apenas para sysUser) */}
      <Dialog open={changePasswordOpen} onOpenChange={(open) => {
        setChangePasswordOpen(open);
        if (!open) { setCpCurrentPwd(""); setCpNewPwd(""); setCpConfirmPwd(""); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              Trocar Senha
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cp-current" className="text-xs">Senha atual</Label>
              <Input
                id="cp-current"
                type="password"
                placeholder="Digite sua senha atual"
                value={cpCurrentPwd}
                onChange={(e) => setCpCurrentPwd(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-new" className="text-xs">Nova senha</Label>
              <Input
                id="cp-new"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={cpNewPwd}
                onChange={(e) => setCpNewPwd(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-confirm" className="text-xs">Confirmar nova senha</Label>
              <Input
                id="cp-confirm"
                type="password"
                placeholder="Repita a nova senha"
                value={cpConfirmPwd}
                onChange={(e) => setCpConfirmPwd(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setChangePasswordOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleChangePassword}
              disabled={changePasswordMutation.isPending || !cpCurrentPwd || !cpNewPwd || !cpConfirmPwd}
            >
              {changePasswordMutation.isPending ? "Salvando..." : "Salvar Senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
