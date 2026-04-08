/**
 * VIP Cam — Histórico de detecções (timeline paginada).
 */
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { SATISFACTION_LABELS, SATISFACTION_COLORS, SATISFACTION_EMOJIS, SatisfactionLevel } from '@/lib/emotionClassifier';
import { DatePicker } from '@/components/DatePicker';

export default function CamHistoricoPage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id;
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data, isLoading } = trpc.vipCam.getTimeline.useQuery({
    unitId, page, limit: 50,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader title="Histórico de Detecções" description="Todas as capturas registradas pela câmera" />
      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">De:</label>
          <DatePicker value={startDate} onChange={(v) => { setStartDate(v); setPage(1); }} placeholder="Data inicial" className="w-40" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Até:</label>
          <DatePicker value={endDate} onChange={(v) => { setEndDate(v); setPage(1); }} placeholder="Data final" min={startDate} className="w-40" />
        </div>
        {(startDate || endDate) && (
          <Button variant="ghost" size="sm" onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }}>Limpar</Button>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-2">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : (
        <>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />{data?.total ?? 0} detecções registradas
          </div>
          <div className="space-y-2">
            {(data?.timeline ?? []).map((t, i) => {
              const level = (t.satisfactionLevel ?? 'neutral') as SatisfactionLevel;
              return (
                <div className="glass-card" key={i}><div className="p-6 pt-0 p-3 flex items-center gap-3">
                  <span className="text-2xl">{SATISFACTION_EMOJIS[level]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: SATISFACTION_COLORS[level] }}>{SATISFACTION_LABELS[level]}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.expression ?? 'N/A'}{t.confidence ? ` · ${Math.round(Number(t.confidence) * 100)}%` : ''}
                      {t.clienteId ? ` · Cliente #${t.clienteId}` : ' · Novo'}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {t.recordedAt ? new Date(t.recordedAt).toLocaleString('pt-BR') : ''}
                  </span>
                </div></div>
              );
            })}
            {(data?.timeline ?? []).length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 opacity-30 mb-3" />
                <p className="text-sm">Nenhuma detecção no período</p>
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
    </div>
  );
}
