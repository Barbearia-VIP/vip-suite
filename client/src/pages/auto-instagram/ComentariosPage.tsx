import PageHeader from "@/components/PageHeader";

export default function ComentariosPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Comentários"
        description="Respostas automáticas a comentários"
      />
      <div className="rounded-lg border border-white/10 bg-white/5 p-8 text-center">
        <div
          className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
          style={{ background: "oklch(0.65 0.15 320)20" }}
        >
          <div className="w-6 h-6 rounded-full" style={{ background: "oklch(0.65 0.15 320)" }} />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-1">Comentários</h3>
        <p className="text-xs text-muted-foreground">Respostas automáticas a comentários</p>
        <p className="text-xs text-muted-foreground mt-4 opacity-60">Módulo em implementação</p>
      </div>
    </div>
  );
}
