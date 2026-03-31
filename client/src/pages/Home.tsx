import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
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
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [loading, isAuthenticated, navigate]);

  if (!loading && isAuthenticated) return null;

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
            Entrar
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
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4 leading-tight">
            Tudo que sua rede precisa,<br />
            <span className="text-gradient-gold">em um único lugar</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-10">
            VIP Suite integra dados, operações e automações de todas as suas unidades
            em uma plataforma centralizada com controle total de acesso.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              size="lg"
              onClick={() => { window.location.href = getLoginUrl(); }}
              className="gap-2 px-8"
            >
              Acessar Plataforma
              <ArrowRight className="w-4 h-4" />
            </Button>
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
