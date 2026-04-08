/**
 * VIP Cam — Lista de clientes reconhecidos com filtros e detalhes.
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Users, ChevronLeft, ChevronRight, Eye, AlertTriangle } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { SATISFACTION_LABELS, SATISFACTION_COLORS, SATISFACTION_EMOJIS, SatisfactionLevel } from '@/lib/emotionClassifier';

export default function CamClientesPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'satisfied' | 'neutral' | 'unsatisfied'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading } = trpc.vipCam.getClientes.useQuery({
    unitId,
    page,
    limit: 20,
    satisfactionLevel: filter,
    search: search || undefined,
  });

  const { data: detail } = trpc.vipCam.getClienteDetail.useQuery(
    { id: selectedId!, unitId: unitId! },
    { enabled: selectedId !== null && unitId !== undefined }
  );

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader title="Clientes VIP Cam" description="Clientes reconhecidos pela câmera" />

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={v => { setFilter(v as typeof filter); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="satisfied">😊 Satisfeitos</SelectItem>
            <SelectItem value="neutral">😐 Neutros</SelectItem>
            <SelectItem value="unsatisfied">😠 Insatisfeitos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm text-muted-foreground">{data?.total ?? 0} clientes encontrados</span>
            {(() => {
              const emRisco = (data?.clientes ?? []).filter((c: any) => c.riskLevel === 'em_risco').length;
              return emRisco > 0 ? (
                <span className="flex items-center gap-1.5 text-xs text-orange-400 bg-orange-400/10 border border-orange-400/30 rounded-full px-3 py-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {emRisco} cliente{emRisco > 1 ? 's' : ''} em risco nesta página
                </span>
              ) : null;
            })()}
          </div>
          <div className="space-y-2">
            {(data?.clientes ?? []).map(cliente => {
              const level = (cliente.satisfactionLevel ?? 'neutral') as SatisfactionLevel;
              return (
                <div className="glass-card hover:bg-muted/30 transition-colors cursor-pointer" key={cliente.id} onClick={() => setSelectedId(cliente.id)}>
                  <div className="p-6 pt-0 p-3 flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={cliente.faceImageUrl ?? cliente.fotoUrl ?? undefined} />
                      <AvatarFallback className="text-xs">{SATISFACTION_EMOJIS[level]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{cliente.nome ?? `Cliente #${cliente.id}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {cliente.visitCount ?? 0} visitas · {cliente.lastSeenAt ? new Date(cliente.lastSeenAt).toLocaleDateString('pt-BR') : 'Nunca'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {(cliente as any).riskLevel === 'em_risco' && (
                        <Badge
                          variant="outline"
                          className="text-orange-400 border-orange-400/50 bg-orange-400/10 text-xs gap-1"
                          title="Neutros = Insatisfeitos: próxima captura negativa muda para Insatisfeito"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Em Risco
                        </Badge>
                      )}
                      <Badge variant="outline" style={{ color: SATISFACTION_COLORS[level], borderColor: SATISFACTION_COLORS[level] + '60' }}>
                        {SATISFACTION_EMOJIS[level]} {SATISFACTION_LABELS[level]}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                  </div>
                </div>
              );
            })}
            {(data?.clientes ?? []).length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 opacity-30 mb-3" />
                <p className="text-sm">Nenhum cliente encontrado</p>
              </div>
            )}
          </div>
          {(data?.totalPages ?? 0) > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm text-muted-foreground">Página {page} de {data?.totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === data?.totalPages}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        </>
      )}

      <Dialog open={selectedId !== null} onOpenChange={open => !open && setSelectedId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{detail?.cliente.nome ?? `Cliente #${selectedId}`}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={detail.cliente.faceImageUrl ?? detail.cliente.fotoUrl ?? undefined} />
                  <AvatarFallback className="text-2xl">{SATISFACTION_EMOJIS[(detail.cliente.satisfactionLevel ?? 'neutral') as SatisfactionLevel]}</AvatarFallback>
                </Avatar>
                <div>
                  <Badge style={{ backgroundColor: SATISFACTION_COLORS[(detail.cliente.satisfactionLevel ?? 'neutral') as SatisfactionLevel] + '20', color: SATISFACTION_COLORS[(detail.cliente.satisfactionLevel ?? 'neutral') as SatisfactionLevel] }}>
                    {SATISFACTION_LABELS[(detail.cliente.satisfactionLevel ?? 'neutral') as SatisfactionLevel]}
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-1">{detail.cliente.visitCount ?? 0} visitas</p>
                  <p className="text-xs text-muted-foreground">Última: {detail.cliente.lastSeenAt ? new Date(detail.cliente.lastSeenAt).toLocaleString('pt-BR') : 'N/A'}</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Últimas detecções</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {detail.timeline.slice(0, 10).map((t, i) => {
                    const level = (t.satisfactionLevel ?? 'neutral') as SatisfactionLevel;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/30">
                        <span>{SATISFACTION_EMOJIS[level]}</span>
                        <span style={{ color: SATISFACTION_COLORS[level] }}>{SATISFACTION_LABELS[level]}</span>
                        <span className="text-muted-foreground ml-auto">{t.recordedAt ? new Date(t.recordedAt).toLocaleString('pt-BR') : ''}</span>
                      </div>
                    );
                  })}
                  {detail.timeline.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Sem histórico</p>}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
