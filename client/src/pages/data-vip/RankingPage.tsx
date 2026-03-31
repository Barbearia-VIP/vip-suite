import PageHeader from "@/components/PageHeader";

export default function RankingPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Ranking da Rede"
        description="Ranking de performance entre unidades"
      />
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <div
          className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: "oklch(0.65 0.15 200)20" }}
        >
          <div className="w-6 h-6 rounded-full" style={{ background: "oklch(0.65 0.15 200)" }} />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-1">Ranking da Rede</h3>
        <p className="text-xs text-muted-foreground">Ranking de performance entre unidades</p>
        <p className="text-xs text-muted-foreground mt-4 opacity-60">Módulo em implementação</p>
      </div>
    </div>
  );
}
