import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  BarChart3,
  ClipboardList,
  Camera,
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
  ChevronRight,
  Users,
  Shield,
  TrendingUp,
  UserCheck,
  Target,
  RefreshCw,
  Scissors,
  Calendar,
  FileText,
  Activity,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
    color: "oklch(0.78 0.12 75)",
    description: "Visão geral consolidada",
  },
  {
    id: "data_vip",
    label: "Data VIP",
    shortLabel: "Data VIP",
    icon: BarChart3,
    path: "/data-vip",
    color: "oklch(0.65 0.15 200)",
    description: "Analytics e faturamento",
  },
  {
    id: "gestao_total",
    label: "Gestão Total",
    shortLabel: "Gestão",
    icon: ClipboardList,
    path: "/gestao-total",
    color: "oklch(0.65 0.15 145)",
    description: "ERP operacional",
  },
  {
    id: "vip_cam",
    label: "VIP Cam",
    shortLabel: "VIP Cam",
    icon: Camera,
    path: "/vip-cam",
    color: "oklch(0.65 0.15 280)",
    description: "Reconhecimento facial",
  },
  {
    id: "reputacao",
    label: "Reputação",
    shortLabel: "Reputação",
    icon: Star,
    path: "/reputacao",
    color: "oklch(0.65 0.15 30)",
    description: "Avaliações e reviews",
  },
  {
    id: "auto_instagram",
    label: "Auto Instagram",
    shortLabel: "Instagram",
    icon: Instagram,
    path: "/auto-instagram",
    color: "oklch(0.65 0.15 320)",
    description: "Bot e engajamento",
  },
  {
    id: "we_send",
    label: "We Send",
    shortLabel: "WhatsApp",
    icon: MessageSquare,
    path: "/we-send",
    color: "oklch(0.65 0.15 145)",
    description: "Envio em massa",
  },
];

const SIDEBAR_ITEMS: Record<ModuleId, Array<{ label: string; path: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }>> = {
  dashboard: [
    { label: "Visão Geral", path: "/dashboard", icon: LayoutDashboard },
    { label: "Unidades", path: "/dashboard/unidades", icon: Building2 },
    { label: "Usuários", path: "/dashboard/usuarios", icon: Users },
    { label: "Permissões", path: "/dashboard/permissoes", icon: Shield },
  ],
  data_vip: [
    { label: "Dashboard", path: "/data-vip", icon: LayoutDashboard },
    { label: "Mensal", path: "/data-vip/mensal", icon: TrendingUp },
    { label: "Faturamento", path: "/data-vip/faturamento", icon: DollarSign },
    { label: "Ranking", path: "/data-vip/ranking", icon: Star },
    { label: "Clientes", path: "/data-vip/clientes", icon: Users },
    { label: "Raio-X Clientes", path: "/data-vip/raio-x", icon: Activity },
    { label: "Colaboradores", path: "/data-vip/colaboradores", icon: UserCheck },
    { label: "Comissões", path: "/data-vip/comissoes", icon: DollarSign },
    { label: "Metas", path: "/data-vip/metas", icon: Target },
    { label: "Serviços", path: "/data-vip/servicos", icon: Scissors },
    { label: "Relatórios", path: "/data-vip/relatorios", icon: FileText },
    { label: "Calendário", path: "/data-vip/calendario", icon: Calendar },
    { label: "Sincronização", path: "/data-vip/sincronizacao", icon: RefreshCw },
    { label: "Administração", path: "/data-vip/administracao", icon: Settings },
  ],
  gestao_total: [
    { label: "Dashboard", path: "/gestao-total", icon: LayoutDashboard },
    { label: "Tarefas", path: "/gestao-total/tarefas", icon: ClipboardList },
    { label: "Processos", path: "/gestao-total/processos", icon: ClipboardList },
    { label: "Indicadores", path: "/gestao-total/indicadores", icon: BarChart3 },
    { label: "Financeiro", path: "/gestao-total/financeiro", icon: BarChart3 },
    { label: "Compras", path: "/gestao-total/compras", icon: ClipboardList },
    { label: "Reuniões", path: "/gestao-total/reunioes", icon: Users },
    { label: "IA Conselheiro", path: "/gestao-total/ia", icon: MessageSquare },
  ],
  vip_cam: [
    { label: "Dashboard", path: "/vip-cam", icon: LayoutDashboard },
    { label: "Clientes", path: "/vip-cam/clientes", icon: Users },
    { label: "Histórico", path: "/vip-cam/historico", icon: ClipboardList },
    { label: "Relatórios", path: "/vip-cam/relatorios", icon: BarChart3 },
  ],
  reputacao: [
    { label: "Dashboard", path: "/reputacao", icon: LayoutDashboard },
    { label: "Avaliações", path: "/reputacao/avaliacoes", icon: Star },
    { label: "Respostas", path: "/reputacao/respostas", icon: MessageSquare },
    { label: "Análise", path: "/reputacao/analise", icon: BarChart3 },
  ],
  auto_instagram: [
    { label: "Dashboard", path: "/auto-instagram", icon: LayoutDashboard },
    { label: "Editor de Prompts", path: "/auto-instagram/prompts", icon: MessageSquare },
    { label: "Fila de Aprovação", path: "/auto-instagram/aprovacao", icon: ClipboardList },
    { label: "Logs", path: "/auto-instagram/logs", icon: BarChart3 },
    { label: "Stories", path: "/auto-instagram/stories", icon: Star },
    { label: "Diagnóstico", path: "/auto-instagram/diagnostico", icon: Settings },
  ],
  we_send: [
    { label: "Nova Campanha", path: "/we-send", icon: MessageSquare },
    { label: "Campanhas", path: "/we-send/campanhas", icon: ClipboardList },
    { label: "Relatórios", path: "/we-send/relatorios", icon: BarChart3 },
  ],
};

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location, navigate] = useLocation();
  const { activeModule, setActiveModule, selectedUnit, setSelectedUnit, availableUnits, sidebarCollapsed, setSidebarCollapsed } = useApp();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      logout();
      navigate("/");
    },
  });

  const currentModule = MODULES.find((m) => m.id === activeModule) ?? MODULES[0];
  const sidebarItems = SIDEBAR_ITEMS[activeModule];

  const handleModuleClick = (module: Module) => {
    setActiveModule(module.id);
    navigate(module.path);
    setMobileMenuOpen(false);
  };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── TOP NAVIGATION BAR ── */}
      <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50 flex items-center">
        <div className="flex items-center h-full w-full">
          {/* Logo */}
          <div className="flex items-center gap-2 px-4 h-full border-r border-border min-w-[200px]">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xs">VS</span>
            </div>
            <span className="font-bold text-sm tracking-wide text-foreground">VIP Suite</span>
          </div>

          {/* Module tabs — desktop */}
          <nav className="hidden lg:flex items-center h-full flex-1 overflow-x-auto">
            {MODULES.map((module) => {
              const Icon = module.icon;
              const isActive = activeModule === module.id;
              return (
                <button
                  key={module.id}
                  onClick={() => handleModuleClick(module)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 h-full text-xs font-medium transition-all border-b-2 whitespace-nowrap",
                    isActive
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                  style={isActive ? { borderBottomColor: module.color, color: module.color } : {}}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {module.shortLabel}
                </button>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 px-3 ml-auto">
            {/* Unit selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-border bg-secondary/50 hidden sm:flex">
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="max-w-[120px] truncate">
                    {selectedUnit ? selectedUnit.name : "Todas as Unidades"}
                  </span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Selecionar Unidade</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSelectedUnit(null)} className="text-xs">
                  <Building2 className="w-3.5 h-3.5 mr-2" />
                  Todas as Unidades
                  {!selectedUnit && <Badge variant="secondary" className="ml-auto text-xs py-0">Ativo</Badge>}
                </DropdownMenuItem>
                {availableUnits.map((unit) => (
                  <DropdownMenuItem key={unit.id} onClick={() => setSelectedUnit(unit)} className="text-xs">
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

            {/* Notifications */}
            <Button variant="ghost" size="icon" className="h-8 w-8 relative">
              <Bell className="w-4 h-4" />
            </Button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-2 px-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs hidden md:block max-w-[100px] truncate">{user?.name ?? "Usuário"}</span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs">
                  <div className="font-medium truncate">{user?.name}</div>
                  <div className="text-muted-foreground truncate">{user?.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/configuracoes")} className="text-xs">
                  <Settings className="w-3.5 h-3.5 mr-2" />
                  Configurações
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logoutMutation.mutate()}
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
              className="h-8 w-8 lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile module menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-card border-b border-border z-40">
          <div className="grid grid-cols-4 gap-0">
            {MODULES.map((module) => {
              const Icon = module.icon;
              const isActive = activeModule === module.id;
              return (
                <button
                  key={module.id}
                  onClick={() => handleModuleClick(module)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 text-xs transition-all",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
                  )}
                  style={isActive ? { color: module.color } : {}}
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
            "hidden lg:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 shrink-0",
            sidebarCollapsed ? "w-14" : "w-52"
          )}
        >
          {/* Module header */}
          <div className="flex items-center gap-2 px-3 py-3 border-b border-sidebar-border">
            {!sidebarCollapsed && (
              <>
                <div
                  className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                  style={{ background: `${currentModule.color}20` }}
                >
                  <currentModule.icon className="w-3.5 h-3.5" style={{ color: currentModule.color }} />
                </div>
                <span className="text-xs font-semibold text-sidebar-foreground truncate flex-1">
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
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 mx-1 rounded-md text-xs transition-all",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                  style={isActive ? { color: currentModule.color } : {}}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Sidebar footer */}
          <div className="border-t border-sidebar-border p-2">
            <button
              onClick={() => navigate("/configuracoes")}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all"
              title={sidebarCollapsed ? "Configurações" : undefined}
            >
              <Settings className="w-3.5 h-3.5 shrink-0" />
              {!sidebarCollapsed && <span>Configurações</span>}
            </button>
          </div>
        </aside>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
