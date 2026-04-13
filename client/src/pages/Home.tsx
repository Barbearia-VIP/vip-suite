import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useSysUser } from "@/contexts/SysUserContext";
import { toast } from "sonner";
import {
  LayoutDashboard,
  BarChart3,
  ClipboardList,
  Camera,
  Star,
  Instagram,
  MessageSquare,
  ArrowRight,
  Shield,
  Building2,
  Zap,
  Mail,
  Lock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const MODULES = [
  { icon: LayoutDashboard, label: "Dashboard Central", color: "oklch(0.78 0.12 75)", desc: "KPIs consolidados de toda a rede" },
  { icon: BarChart3, label: "Data VIP", color: "oklch(0.65 0.15 200)", desc: "Analytics e faturamento em tempo real" },
  { icon: ClipboardList, label: "Gestão Total", color: "oklch(0.65 0.15 145)", desc: "ERP operacional completo" },
  { icon: Camera, label: "VIP Cam", color: "oklch(0.65 0.15 280)", desc: "Reconhecimento facial de clientes" },
  { icon: Star, label: "Reputação", color: "oklch(0.65 0.15 30)", desc: "Avaliações Google e outras plataformas" },
  { icon: Instagram, label: "Auto Instagram", color: "oklch(0.65 0.15 320)", desc: "Bot de automação e engajamento" },
  { icon: MessageSquare, label: "We Send", color: "oklch(0.65 0.15 145)", desc: "Envio em massa via WhatsApp" },
];

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const { sysUser, refetch } = useSysUser();
  const [, navigate] = useLocation();

  // Formulário de login por e-mail/senha
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = trpc.sysUsers.login.useMutation({
    onSuccess: (data) => {
      toast.success(`Bem-vindo, ${data.name}!`);
      refetch();
      navigate("/dashboard");
    },
    onError: (err) => {
      toast.error(err.message || "E-mail ou senha incorretos.");
    },
  });

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [loading, isAuthenticated, navigate]);

  // Se usuário de unidade já está logado, redireciona
  useEffect(() => {
    if (sysUser) {
      navigate("/dashboard");
    }
  }, [sysUser, navigate]);

  if (!loading && isAuthenticated) return null;
  if (sysUser) return null;

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Preencha e-mail e senha.");
      return;
    }
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">VS</span>
            </div>
            <span className="font-bold text-lg tracking-wide">VIP Suite</span>
          </div>
          <Button
            size="sm"
            onClick={() => { window.location.href = getLoginUrl(); }}
            className="gap-2"
          >
            Entrar como Admin
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-xs font-medium mb-6 border border-primary/20">
            <Zap className="w-3.5 h-3.5" />
            Plataforma Multi-Módulo de Gestão Empresarial
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4 leading-tight font-display tracking-tight">
            Tudo que sua rede precisa,<br />
            <span className="text-gradient-gold">em um único lugar</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-10">
            VIP Suite integra dados, operações e automações de todas as suas unidades
            em uma plataforma centralizada com controle total de acesso.
          </p>

          {/* Botões de acesso */}
          <div className="flex flex-col items-center gap-4 max-w-sm mx-auto">
            {/* Botão Admin / Manus OAuth */}
            <Button
              size="lg"
              onClick={() => { window.location.href = getLoginUrl(); }}
              className="gap-2 px-8 w-full"
            >
              <Shield className="w-4 h-4" />
              Acessar como Administrador
            </Button>

            {/* Separador */}
            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">ou</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Botão de login por e-mail/senha */}
            <button
              type="button"
              onClick={() => setShowEmailLogin((v) => !v)}
              className="flex items-center justify-between w-full rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <span className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                Entrar com e-mail e senha
              </span>
              {showEmailLogin
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />
              }
            </button>

            {/* Formulário de login por e-mail/senha */}
            {showEmailLogin && (
              <form
                onSubmit={handleEmailLogin}
                className="w-full rounded-lg border border-border bg-card p-5 space-y-4 text-left"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium">E-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9 text-sm"
                      autoComplete="email"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-medium">Senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 text-sm"
                      autoComplete="current-password"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Entrando..." : "Entrar"}
                  {!loginMutation.isPending && <ArrowRight className="w-3.5 h-3.5" />}
                </Button>
              </form>
            )}
          </div>
        </section>

        {/* Modules grid */}
        <section className="max-w-6xl mx-auto px-6 pb-16">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {MODULES.map((mod) => {
              const Icon = mod.icon;
              return (
                <div
                  key={mod.label}
                  className="rounded-xl border border-border bg-card p-4 hover:border-border/80 transition-all hover:bg-card/80 group"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                    style={{ background: `${mod.color}20` }}
                  >
                    <Icon className="w-4.5 h-4.5" style={{ color: mod.color }} />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">{mod.label}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{mod.desc}</p>
                </div>
              );
            })}
            {/* Features card */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 col-span-2 sm:col-span-1">
              <div className="space-y-2.5">
                {[
                  { icon: Shield, text: "5 perfis de acesso" },
                  { icon: Building2, text: "Multi-unidades" },
                  { icon: Zap, text: "Sincronização automática" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 text-center">
        <p className="text-xs text-muted-foreground">VIP Suite — Plataforma de Gestão Empresarial</p>
      </footer>
    </div>
  );
}
