import { ThumbsUp, Minus, ThumbsDown } from "lucide-react";

interface SentimentoData {
  positivas: number;
  neutras: number;
  negativas: number;
}

interface Props {
  data: SentimentoData;
}

export function SentimentoChart({ data }: Props) {
  const total = data.positivas + data.neutras + data.negativas;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Sem dados disponíveis
      </div>
    );
  }

  const pctPos = Math.round((data.positivas / total) * 100);
  const pctNeu = Math.round((data.neutras / total) * 100);
  const pctNeg = 100 - pctPos - pctNeu;

  const items = [
    {
      label: "Positivas",
      value: data.positivas,
      pct: pctPos,
      color: "#22c55e",
      glow: "rgba(34,197,94,0.35)",
      bg: "rgba(34,197,94,0.08)",
      border: "rgba(34,197,94,0.25)",
      icon: ThumbsUp,
      gradId: "gradPos",
      gradFrom: "#22c55e",
      gradTo: "#16a34a",
    },
    {
      label: "Neutras",
      value: data.neutras,
      pct: pctNeu,
      color: "#f59e0b",
      glow: "rgba(245,158,11,0.35)",
      bg: "rgba(245,158,11,0.08)",
      border: "rgba(245,158,11,0.25)",
      icon: Minus,
      gradId: "gradNeu",
      gradFrom: "#f59e0b",
      gradTo: "#d97706",
    },
    {
      label: "Negativas",
      value: data.negativas,
      pct: pctNeg,
      color: "#ef4444",
      glow: "rgba(239,68,68,0.35)",
      bg: "rgba(239,68,68,0.08)",
      border: "rgba(239,68,68,0.25)",
      icon: ThumbsDown,
      gradId: "gradNeg",
      gradFrom: "#ef4444",
      gradTo: "#dc2626",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Barra empilhada no topo */}
      <div className="relative h-3 rounded-full overflow-hidden bg-muted flex">
        {items.map((item) => (
          <div
            key={item.label}
            className="h-full transition-all duration-700"
            style={{
              width: `${item.pct}%`,
              background: `linear-gradient(90deg, ${item.gradFrom}, ${item.gradTo})`,
            }}
          />
        ))}
      </div>

      {/* Cards de sentimento */}
      <div className="space-y-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="relative flex items-center gap-4 p-4 rounded-xl border overflow-hidden"
              style={{ background: item.bg, borderColor: item.border }}
            >
              {/* Barra de fundo proporcional */}
              <div
                className="absolute inset-y-0 left-0 rounded-xl opacity-20 transition-all duration-700"
                style={{
                  width: `${item.pct}%`,
                  background: `linear-gradient(90deg, ${item.gradFrom}60, transparent)`,
                }}
              />

              {/* Ícone */}
              <div
                className="relative z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: item.bg,
                  border: `1.5px solid ${item.border}`,
                  boxShadow: `0 0 12px ${item.glow}`,
                }}
              >
                <Icon className="w-5 h-5" style={{ color: item.color }} />
              </div>

              {/* Texto */}
              <div className="relative z-10 flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-sm" style={{ color: item.color }}>
                    {item.label}
                  </span>
                  <span className="text-2xl font-bold tabular-nums" style={{ color: item.color }}>
                    {item.pct}%
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full bg-black/20 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${item.pct}%`,
                        background: `linear-gradient(90deg, ${item.gradFrom}, ${item.gradTo})`,
                        boxShadow: `0 0 6px ${item.glow}`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                    {item.value.toLocaleString("pt-BR")} avaliações
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rodapé */}
      <p className="text-xs text-muted-foreground text-center pt-1">
        Total de {total.toLocaleString("pt-BR")} avaliações · todo o histórico
      </p>
    </div>
  );
}
