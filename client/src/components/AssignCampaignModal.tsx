/**
 * AssignCampaignModal.tsx
 * Modal para destinar uma campanha de marketing a um colaborador cadastrado,
 * criando automaticamente uma tarefa para ele no Gestão Total.
 */
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserCheck, ClipboardList, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { toast } from "sonner";
import { DatePicker } from "@/components/DatePicker";

interface Props {
  open: boolean;
  onClose: () => void;
  campaignId: number;
  campaignName: string;
  onAssigned?: () => void;
}

export default function AssignCampaignModal({ open, onClose, campaignId, campaignName, onAssigned }: Props) {
  const { organization, selectedUnit } = useApp();

  const [selectedColaboradorId, setSelectedColaboradorId] = useState<string>("");
  const [createTask, setCreateTask] = useState(true);
  const [taskPrazo, setTaskPrazo] = useState<string>("");

  // Busca colaboradores ativos da unidade/org
  const colaboradoresQ = trpc.gestaoTotal.colaboradores.list.useQuery(
    { orgId: organization?.id ?? 0, unitId: selectedUnit?.id, status: "ativo" },
    { enabled: open && !!organization?.id }
  );
  const colaboradores = colaboradoresQ.data ?? [];

  const selectedColaborador = colaboradores.find(c => String(c.id) === selectedColaboradorId);

  const assignMutation = trpc.gestaoTotal.marketingCampaigns.assignCampaign.useMutation({
    onSuccess: (data) => {
      if (createTask && data.tarefaId) {
        toast.success(`Campanha destinada e tarefa #${data.tarefaId} criada para ${selectedColaborador?.nome}!`);
      } else {
        toast.success(`Campanha destinada para ${selectedColaborador?.nome}!`);
      }
      setSelectedColaboradorId("");
      setCreateTask(true);
      setTaskPrazo("");
      onAssigned?.();
      onClose();
    },
    onError: (err) => {
      toast.error("Erro ao destinar campanha: " + err.message);
    },
  });

  function handleAssign() {
    if (!selectedColaborador) return;
    assignMutation.mutate({
      id: campaignId,
      orgId: organization?.id ?? 0,
      unitId: selectedUnit?.id,
      assignedToId: selectedColaborador.id,
      assignedToName: selectedColaborador.nome,
      campaignName,
      createTask,
      taskPrazo: taskPrazo ? new Date(taskPrazo).toISOString() : undefined,
    });
  }

  function handleClose() {
    setSelectedColaboradorId("");
    setCreateTask(true);
      setTaskPrazo("");
      onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Destinar Campanha
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Nome da campanha */}
          <p className="text-sm text-muted-foreground">
            Destinando: <span className="font-medium text-foreground">{campaignName}</span>
          </p>

          {/* Seletor de colaborador */}
          <div className="space-y-2">
            <Label>
              Colaborador Responsável <span className="text-destructive">*</span>
            </Label>
            {colaboradoresQ.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando colaboradores...
              </div>
            ) : colaboradores.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Nenhum colaborador ativo cadastrado. Cadastre colaboradores em{" "}
                <span className="text-primary">Gestão → Colaboradores</span>.
              </p>
            ) : (
              <Select value={selectedColaboradorId} onValueChange={setSelectedColaboradorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um colaborador..." />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <span className="font-medium">{c.nome}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Opção de criar tarefa */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                <Label htmlFor="create-task" className="cursor-pointer">
                  Criar tarefa para o colaborador
                </Label>
              </div>
              <Switch
                id="create-task"
                checked={createTask}
                onCheckedChange={setCreateTask}
              />
            </div>
            {createTask && (
              <div className="space-y-2 pt-1">
                <Label className="text-xs text-muted-foreground">Prazo da tarefa (opcional)</Label>
                <DatePicker
                  value={taskPrazo}
                  onChange={setTaskPrazo}
                  placeholder="Selecionar prazo..."
                />
                <p className="text-xs text-muted-foreground">
                  Uma tarefa será criada em <span className="text-foreground font-medium">Gestão → Tarefas</span> com o nome da campanha e o colaborador como responsável.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedColaboradorId || assignMutation.isPending || colaboradores.length === 0}
          >
            {assignMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Destinando...</>
            ) : (
              <><UserCheck className="h-4 w-4 mr-2" />Destinar</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
