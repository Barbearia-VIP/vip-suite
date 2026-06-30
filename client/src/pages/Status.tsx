import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, Clock, Database, Zap, RefreshCw } from "lucide-react";

type StatusType = "healthy" | "degraded" | "unhealthy" | "unknown";

interface HealthStatus {
  timestamp: string;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  mysql: {
    status: StatusType;
    responseTime: number;
    poolSize: number;
    activeConnections: number;
    error: string | null;
  };
  redis: {
    status: StatusType;
    responseTime: number;
    error: string | null;
  };
  status: StatusType;
  totalResponseTime: number;
}

export default function StatusPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [sysInfo, setSysInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const healthCheckQuery = trpc.system.healthCheck.useQuery();
  const infoQuery = trpc.system.info.useQuery();

  // Polling automático a cada 5 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      healthCheckQuery.refetch();
      infoQuery.refetch();
    }, 5000);

    return () => clearInterval(interval);
  }, [healthCheckQuery, infoQuery]);

  // Atualizar estado quando dados chegam
  useEffect(() => {
    if (healthCheckQuery.data) {
      setHealth(healthCheckQuery.data as HealthStatus);
      setLastUpdate(new Date());
      setIsLoading(false);
    }
  }, [healthCheckQuery.data]);

  useEffect(() => {
    if (infoQuery.data) {
      setSysInfo(infoQuery.data);
    }
  }, [infoQuery.data]);

  const getStatusColor = (status: StatusType) => {
    switch (status) {
      case "healthy":
        return "bg-green-500/20 text-green-700 border-green-200";
      case "degraded":
        return "bg-yellow-500/20 text-yellow-700 border-yellow-200";
      case "unhealthy":
        return "bg-red-500/20 text-red-700 border-red-200";
      default:
        return "bg-gray-500/20 text-gray-700 border-gray-200";
    }
  };

  const getStatusIcon = (status: StatusType) => {
    switch (status) {
      case "healthy":
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case "degraded":
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case "unhealthy":
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const formatBytes = (bytes: number) => {
    return Math.round(bytes / 1024 / 1024) + " MB";
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Status do Sistema</h1>
          <p className="text-gray-500 mt-1">
            Monitoramento em tempo real da saúde da aplicação
          </p>
        </div>
        <Button
          onClick={() => {
            healthCheckQuery.refetch();
            infoQuery.refetch();
          }}
          disabled={isLoading}
          variant="outline"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Status Geral */}
      {health && (
        <Card className="border-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Status Geral</CardTitle>
                <CardDescription>
                  Última atualização: {lastUpdate?.toLocaleTimeString("pt-BR")}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(health.status)}
                <Badge className={getStatusColor(health.status)}>
                  {health.status === "healthy"
                    ? "Saudável"
                    : health.status === "degraded"
                      ? "Degradado"
                      : health.status === "unhealthy"
                        ? "Indisponível"
                        : "Desconhecido"}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Tempo Total</p>
                <p className="text-lg font-semibold">{health.totalResponseTime}ms</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Uptime</p>
                <p className="text-lg font-semibold">{sysInfo?.uptime?.formatted}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Memória Usada</p>
                <p className="text-lg font-semibold">{sysInfo?.memory?.heapUsed} MB</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Ambiente</p>
                <p className="text-lg font-semibold capitalize">{sysInfo?.environment}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* MySQL Status */}
        {health && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  <div>
                    <CardTitle>MySQL</CardTitle>
                    <CardDescription>Banco de dados principal</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(health.mysql.status)}
                  <Badge className={getStatusColor(health.mysql.status)}>
                    {health.mysql.status === "healthy"
                      ? "Saudável"
                      : health.mysql.status === "degraded"
                        ? "Degradado"
                        : health.mysql.status === "unhealthy"
                          ? "Indisponível"
                          : "Desconhecido"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Tempo de Resposta</span>
                  <span className="font-semibold">{health.mysql.responseTime}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Tamanho do Pool</span>
                  <span className="font-semibold">{health.mysql.poolSize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Conexões Ativas</span>
                  <span className="font-semibold">{health.mysql.activeConnections}</span>
                </div>
              </div>

              {health.mysql.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">
                    <strong>Erro:</strong> {health.mysql.error}
                  </p>
                </div>
              )}

              {health.mysql.responseTime > 1000 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-700">
                    ⚠️ Tempo de resposta elevado. Verifique a conexão com o banco.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Redis Status */}
        {health && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  <div>
                    <CardTitle>Redis</CardTitle>
                    <CardDescription>Cache distribuído</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(health.redis.status)}
                  <Badge className={getStatusColor(health.redis.status)}>
                    {health.redis.status === "healthy"
                      ? "Saudável"
                      : health.redis.status === "degraded"
                        ? "Degradado"
                        : health.redis.status === "unhealthy"
                          ? "Indisponível"
                          : "Desconhecido"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Tempo de Resposta</span>
                  <span className="font-semibold">{health.redis.responseTime}ms</span>
                </div>
              </div>

              {health.redis.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">
                    <strong>Erro:</strong> {health.redis.error}
                  </p>
                </div>
              )}

              {health.redis.status === "unknown" && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-sm text-gray-700">
                    ℹ️ Redis não está configurado ou desabilitado.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* System Info */}
      {sysInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Informações do Sistema</CardTitle>
            <CardDescription>Detalhes técnicos da aplicação</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Node.js</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Versão</span>
                    <span className="font-mono">{sysInfo.node.version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Plataforma</span>
                    <span className="font-mono capitalize">{sysInfo.node.platform}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Arquitetura</span>
                    <span className="font-mono">{sysInfo.node.arch}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Memória</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">RSS</span>
                    <span className="font-mono">{sysInfo.memory.rss} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Heap Total</span>
                    <span className="font-mono">{sysInfo.memory.heapTotal} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Heap Usado</span>
                    <span className="font-mono">{sysInfo.memory.heapUsed} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">External</span>
                    <span className="font-mono">{sysInfo.memory.external} MB</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center gap-2">
              <div className="animate-spin">
                <RefreshCw className="w-5 h-5" />
              </div>
              <p className="text-gray-600">Carregando dados de status...</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
