import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppProvider } from "./contexts/AppContext";
import AppLayout from "./components/AppLayout";
import { useAuth } from "./_core/hooks/useAuth";
import { getLoginUrl } from "./const";
import { useEffect } from "react";

// Pages
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";

// Dashboard
import DashboardPage from "./pages/dashboard/DashboardPage";
import UnidadesPage from "./pages/dashboard/UnidadesPage";
import UsuariosPage from "./pages/dashboard/UsuariosPage";
import PermissoesPage from "./pages/dashboard/PermissoesPage";

// Data VIP
import DataVipPage from "./pages/data-vip/DataVipPage";
import FaturamentoPage from "./pages/data-vip/FaturamentoPage";
import ColaboradoresPage from "./pages/data-vip/ColaboradoresPage";
import ClientesPage from "./pages/data-vip/ClientesPage";
import MetasPage from "./pages/data-vip/MetasPage";
import RankingPage from "./pages/data-vip/RankingPage";
import SyncPage from "./pages/data-vip/SyncPage";

// Gestão Total
import GestaoTotalPage from "./pages/gestao-total/GestaoTotalPage";
import TarefasPage from "./pages/gestao-total/TarefasPage";
import ProcessosPage from "./pages/gestao-total/ProcessosPage";
import IndicadoresPage from "./pages/gestao-total/IndicadoresPage";
import FinanceiroPage from "./pages/gestao-total/FinanceiroPage";
import ComprasPage from "./pages/gestao-total/ComprasPage";
import ReunioesPage from "./pages/gestao-total/ReunioesPage";
import IAConselheiroPage from "./pages/gestao-total/IAConselheiroPage";

// VIP Cam
import VipCamPage from "./pages/vip-cam/VipCamPage";
import CamClientesPage from "./pages/vip-cam/CamClientesPage";
import CamHistoricoPage from "./pages/vip-cam/CamHistoricoPage";
import CamRelatoriosPage from "./pages/vip-cam/CamRelatoriosPage";

// Reputação
import ReputacaoPage from "./pages/reputacao/ReputacaoPage";
import AvaliacoesPage from "./pages/reputacao/AvaliacoesPage";
import RespostasPage from "./pages/reputacao/RespostasPage";
import AnaliseReputacaoPage from "./pages/reputacao/AnaliseReputacaoPage";

// Auto Instagram
import AutoInstagramPage from "./pages/auto-instagram/AutoInstagramPage";
import ComentariosPage from "./pages/auto-instagram/ComentariosPage";
import SeguidoresPage from "./pages/auto-instagram/SeguidoresPage";
import EngajamentoPage from "./pages/auto-instagram/EngajamentoPage";

// We Send
import WeSendPage from "./pages/we-send/WeSendPage";
import CampanhasPage from "./pages/we-send/CampanhasPage";
import RelatoriosWeSendPage from "./pages/we-send/RelatoriosWeSendPage";

// Configurações
import ConfiguracoesPage from "./pages/ConfiguracoesPage";

const PROTECTED_PATHS = [
  "/dashboard",
  "/data-vip",
  "/gestao-total",
  "/vip-cam",
  "/reputacao",
  "/auto-instagram",
  "/we-send",
  "/configuracoes",
];

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      const isProtected = PROTECTED_PATHS.some((p) => location.startsWith(p));
      if (isProtected) {
        window.location.href = getLoginUrl();
      }
    }
  }, [isAuthenticated, loading, location]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary animate-pulse" />
          <p className="text-sm text-muted-foreground">Carregando VIP Suite...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      {children}
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/" component={Home} />

      {/* Dashboard */}
      <Route path="/dashboard">
        <ProtectedLayout><DashboardPage /></ProtectedLayout>
      </Route>
      <Route path="/dashboard/unidades">
        <ProtectedLayout><UnidadesPage /></ProtectedLayout>
      </Route>
      <Route path="/dashboard/usuarios">
        <ProtectedLayout><UsuariosPage /></ProtectedLayout>
      </Route>
      <Route path="/dashboard/permissoes">
        <ProtectedLayout><PermissoesPage /></ProtectedLayout>
      </Route>

      {/* Data VIP */}
      <Route path="/data-vip">
        <ProtectedLayout><DataVipPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/faturamento">
        <ProtectedLayout><FaturamentoPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/colaboradores">
        <ProtectedLayout><ColaboradoresPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/clientes">
        <ProtectedLayout><ClientesPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/metas">
        <ProtectedLayout><MetasPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/ranking">
        <ProtectedLayout><RankingPage /></ProtectedLayout>
      </Route>
      <Route path="/data-vip/sync">
        <ProtectedLayout><SyncPage /></ProtectedLayout>
      </Route>

      {/* Gestão Total */}
      <Route path="/gestao-total">
        <ProtectedLayout><GestaoTotalPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/tarefas">
        <ProtectedLayout><TarefasPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/processos">
        <ProtectedLayout><ProcessosPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/indicadores">
        <ProtectedLayout><IndicadoresPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/financeiro">
        <ProtectedLayout><FinanceiroPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/compras">
        <ProtectedLayout><ComprasPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/reunioes">
        <ProtectedLayout><ReunioesPage /></ProtectedLayout>
      </Route>
      <Route path="/gestao-total/ia">
        <ProtectedLayout><IAConselheiroPage /></ProtectedLayout>
      </Route>

      {/* VIP Cam */}
      <Route path="/vip-cam">
        <ProtectedLayout><VipCamPage /></ProtectedLayout>
      </Route>
      <Route path="/vip-cam/clientes">
        <ProtectedLayout><CamClientesPage /></ProtectedLayout>
      </Route>
      <Route path="/vip-cam/historico">
        <ProtectedLayout><CamHistoricoPage /></ProtectedLayout>
      </Route>
      <Route path="/vip-cam/relatorios">
        <ProtectedLayout><CamRelatoriosPage /></ProtectedLayout>
      </Route>

      {/* Reputação */}
      <Route path="/reputacao">
        <ProtectedLayout><ReputacaoPage /></ProtectedLayout>
      </Route>
      <Route path="/reputacao/avaliacoes">
        <ProtectedLayout><AvaliacoesPage /></ProtectedLayout>
      </Route>
      <Route path="/reputacao/respostas">
        <ProtectedLayout><RespostasPage /></ProtectedLayout>
      </Route>
      <Route path="/reputacao/analise">
        <ProtectedLayout><AnaliseReputacaoPage /></ProtectedLayout>
      </Route>

      {/* Auto Instagram */}
      <Route path="/auto-instagram">
        <ProtectedLayout><AutoInstagramPage /></ProtectedLayout>
      </Route>
      <Route path="/auto-instagram/comentarios">
        <ProtectedLayout><ComentariosPage /></ProtectedLayout>
      </Route>
      <Route path="/auto-instagram/seguidores">
        <ProtectedLayout><SeguidoresPage /></ProtectedLayout>
      </Route>
      <Route path="/auto-instagram/engajamento">
        <ProtectedLayout><EngajamentoPage /></ProtectedLayout>
      </Route>

      {/* We Send */}
      <Route path="/we-send">
        <ProtectedLayout><WeSendPage /></ProtectedLayout>
      </Route>
      <Route path="/we-send/campanhas">
        <ProtectedLayout><CampanhasPage /></ProtectedLayout>
      </Route>
      <Route path="/we-send/relatorios">
        <ProtectedLayout><RelatoriosWeSendPage /></ProtectedLayout>
      </Route>

      {/* Configurações */}
      <Route path="/configuracoes">
        <ProtectedLayout><ConfiguracoesPage /></ProtectedLayout>
      </Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <AppProvider>
          <TooltipProvider>
            <Toaster />
            <AuthGuard>
              <Router />
            </AuthGuard>
          </TooltipProvider>
        </AppProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
