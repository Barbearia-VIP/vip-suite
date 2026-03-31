import PageHeader from "@/components/PageHeader";

export default function FaturamentoPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Faturamento"
        description="Análise de faturamento por período e unidade"
      />
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <div
          className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: "oklch(0.65 0.15 200)20" }}
        >
          <div className="w-6 h-6 rounded-full" style={{ background: "oklch(0.65 0.15 200)" }} />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-1">Faturamento</h3>
        <p className="text-xs text-muted-foreground">Análise de faturamento por período e unidade</p>
        <p className="text-xs text-muted-foreground mt-4 opacity-60">Módulo em implementação</p>
      </div>
    </div>
  );
}
