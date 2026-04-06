/**
 * VIP Cam — Página da câmera ao vivo com reconhecimento facial em tempo real.
 */
import { useState } from 'react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useApp } from '@/contexts/AppContext';
import { EmotionCamera } from '@/components/vip-cam/EmotionCamera';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Settings, BarChart2, Users, Clock } from 'lucide-react';
import { SATISFACTION_LABELS, SATISFACTION_COLORS, SATISFACTION_EMOJIS, SatisfactionLevel } from '@/lib/emotionClassifier';
import PageHeader from '@/components/PageHeader';

interface DetectionEvent {
  id: number;
  satisfactionLevel: SatisfactionLevel;
  expression: string;
  confidence: number;
  clienteId: number | null;
  isNew: boolean;
  timestamp: Date;
}

export default function VipCamLivePage() {
  const { selectedUnit } = useApp();
  const unitId = selectedUnit?.id ?? 0;

  const [recentDetections, setRecentDetections] = useState<DetectionEvent[]>([]);
  const [sessionStats, setSessionStats] = useState({
    total: 0,
    satisfied: 0,
    neutral: 0,
    unsatisfied: 0,
    newClients: 0,
  });

  const { data: config } = trpc.vipCam.getCameraConfig.useQuery(
    { unitId },
    { enabled: unitId > 0 }
  );

  const handleDetection = (result: {
    satisfactionLevel: SatisfactionLevel;
    expression: string;
    confidence: number;
    clienteId: number | null;
    isNew: boolean;
  }) => {
    const event: DetectionEvent = {
      id: Date.now(),
      ...result,
      timestamp: new Date(),
    };

    setRecentDetections(prev => [event, ...prev].slice(0, 20));
    setSessionStats(prev => ({
      total: prev.total + 1,
      satisfied: prev.satisfied + (result.satisfactionLevel === 'satisfied' ? 1 : 0),
      neutral: prev.neutral + (result.satisfactionLevel === 'neutral' ? 1 : 0),
      unsatisfied: prev.unsatisfied + (result.satisfactionLevel === 'unsatisfied' ? 1 : 0),
      newClients: prev.newClients + (result.isNew ? 1 : 0),
    }));
  };

  const satisfactionRate = sessionStats.total > 0
    ? Math.round((sessionStats.satisfied / sessionStats.total) * 100)
    : 0;

  if (!unitId) {
    return (
      <div className="p-6">
        <PageHeader title="VIP Cam — Ao Vivo" description="Selecione uma unidade para usar a câmera" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <PageHeader
          title="VIP Cam — Ao Vivo"
          description="Reconhecimento facial e análise de satisfação em tempo real"
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/vip-cam/configuracoes">
              <Settings className="h-4 w-4 mr-1" />Configurações
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/vip-cam/metricas">
              <BarChart2 className="h-4 w-4 mr-1" />Métricas
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Câmera principal */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                Câmera ao Vivo
                {config && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    {config.cameraType === 'usb' ? '📷 USB' : '🌐 IP'}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EmotionCamera
                unitId={unitId}
                config={config}
                onDetection={handleDetection}
              />
            </CardContent>
          </Card>
        </div>

        {/* Painel lateral */}
        <div className="flex flex-col gap-4">
          {/* Estatísticas da sessão */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Sessão Atual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total detectado</span>
                <span className="font-semibold">{sessionStats.total}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Satisfeitos</span>
                <span className="font-semibold text-green-600">{sessionStats.satisfied}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Neutros</span>
                <span className="font-semibold text-amber-600">{sessionStats.neutral}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Insatisfeitos</span>
                <span className="font-semibold text-red-600">{sessionStats.unsatisfied}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Novos clientes</span>
                <span className="font-semibold text-blue-600">{sessionStats.newClients}</span>
              </div>
              <div className="pt-2 border-t">
                <div className="flex justify-between text-sm font-semibold">
                  <span>Índice de satisfação</span>
                  <span style={{ color: satisfactionRate >= 70 ? '#22c55e' : satisfactionRate >= 40 ? '#f59e0b' : '#ef4444' }}>
                    {satisfactionRate}%
                  </span>
                </div>
                <div className="mt-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${satisfactionRate}%`,
                      backgroundColor: satisfactionRate >= 70 ? '#22c55e' : satisfactionRate >= 40 ? '#f59e0b' : '#ef4444',
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Feed de detecções recentes */}
          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Detecções Recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentDetections.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Aguardando detecções...
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {recentDetections.map(d => (
                    <div
                      key={d.id}
                      className="flex items-center gap-2 p-2 rounded-lg text-xs"
                      style={{ backgroundColor: SATISFACTION_COLORS[d.satisfactionLevel] + '15' }}
                    >
                      <span className="text-lg">{SATISFACTION_EMOJIS[d.satisfactionLevel]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium" style={{ color: SATISFACTION_COLORS[d.satisfactionLevel] }}>
                          {SATISFACTION_LABELS[d.satisfactionLevel]}
                        </p>
                        <p className="text-muted-foreground truncate">
                          {d.isNew ? '✨ Novo' : `#${d.clienteId}`} · {d.expression}
                        </p>
                      </div>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {d.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Links rápidos */}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link href="/vip-cam/clientes">
                <Users className="h-4 w-4 mr-1" />Clientes
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link href="/vip-cam/historico">
                <Clock className="h-4 w-4 mr-1" />Histórico
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
