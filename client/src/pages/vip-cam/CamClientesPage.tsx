import PageHeader from "@/components/PageHeader";

export default function CamClientesPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Clientes Reconhecidos"
        description="Base de clientes identificados pela câmera"
      />
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <div
          className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: "oklch(0.65 0.15 280)20" }}
        >
          <div className="w-6 h-6 rounded-full" style={{ background: "oklch(0.65 0.15 280)" }} />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-1">Clientes Reconhecidos</h3>
        <p className="text-xs text-muted-foreground">Base de clientes identificados pela câmera</p>
        <p className="text-xs text-muted-foreground mt-4 opacity-60">Módulo em implementação</p>
      </div>
    </div>
  );
}
