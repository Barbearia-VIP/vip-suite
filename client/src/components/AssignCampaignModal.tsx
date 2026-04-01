import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  campaignId: number;
  campaignName: string;
  onAssigned?: () => void;
}

export default function AssignCampaignModal({ open, onClose, campaignId, campaignName, onAssigned }: Props) {
  const { organization } = useApp();
  const [name, setName] = useState("");

  const assignMutation = trpc.gestaoTotal.marketingCampaigns.assignCampaign.useMutation({
    onSuccess: () => {
      toast.success("Campanha atribuída com sucesso!");
      setName("");
      onAssigned?.();
      onClose();
    },
    onError: (err) => {
      toast.error("Erro ao atribuir: " + err.message);
    },
  });

  function handleAssign() {
    if (!name.trim()) return;
    assignMutation.mutate({
      id: campaignId,
      orgId: organization?.id ?? 0,
      assignedToName: name.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Destinar Campanha
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Atribuindo: <span className="font-medium text-foreground">{campaignName}</span>
          </p>
          <div className="space-y-2">
            <Label>Nome do Colaborador <span className="text-destructive">*</span></Label>
            <Input
              placeholder="Ex.: João Silva"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAssign()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleAssign} disabled={!name.trim() || assignMutation.isPending}>
            {assignMutation.isPending ? "Atribuindo..." : "Atribuir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
