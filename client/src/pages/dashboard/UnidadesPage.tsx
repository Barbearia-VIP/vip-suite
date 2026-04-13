import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import { Building2, Plus, MapPin, Hash, Settings } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useOrg } from "@/hooks/useOrg";
import { useApp } from "@/contexts/AppContext";

function slugify(text: string) {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function CreateOrgDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [segment, setSegment] = useState("");
  const createOrg = trpc.orgs.create.useMutation({
    onSuccess: () => { toast.success("Organização criada!"); setOpen(false); onCreated(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />Criar Organização</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova Organização</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5"><Label>Nome *</Label><Input placeholder="Ex: Barbearia VIP" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Segmento</Label><Input placeholder="Ex: Barbearia, Salão..." value={segment} onChange={e => setSegment(e.target.value)} /></div>
          <Button className="w-full" disabled={!name.trim() || createOrg.isPending}
            onClick={() => createOrg.mutate({ name: name.trim(), slug: slugify(name.trim()), segment: segment.trim() || undefined })}>
            {createOrg.isPending ? "Criando..." : "Criar Organização"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateUnitDialog({ orgId, onCreated }: { orgId: number; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", city: "", state: "", phone: "", externalId: "" });
  const utils = trpc.useUtils();
  const createUnit = trpc.orgs.createUnit.useMutation({
    onSuccess: () => { toast.success("Unidade criada!"); setOpen(false); setForm({ name: "", address: "", city: "", state: "", phone: "", externalId: "" }); utils.orgs.units.invalidate(); onCreated(); },
    onError: (e) => toast.error(e.message),
  });
  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [f]: e.target.value }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />Nova Unidade</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova Unidade</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1.5"><Label>Nome *</Label><Input placeholder="Ex: Unidade Centro" value={form.name} onChange={set("name")} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Cidade</Label><Input placeholder="Florianópolis" value={form.city} onChange={set("city")} /></div>
            <div className="space-y-1.5"><Label>Estado</Label><Input placeholder="SC" maxLength={2} value={form.state} onChange={set("state")} /></div>
          </div>
          <div className="space-y-1.5"><Label>Endereço</Label><Input placeholder="Rua, número, bairro" value={form.address} onChange={set("address")} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Telefone</Label><Input placeholder="(48) 99999-9999" value={form.phone} onChange={set("phone")} /></div>
            <div className="space-y-1.5"><Label>ID Externo</Label><Input placeholder="ID na API" value={form.externalId} onChange={set("externalId")} /></div>
          </div>
          <Button className="w-full" disabled={!form.name.trim() || createUnit.isPending}
            onClick={() => createUnit.mutate({ orgId, name: form.name.trim(), slug: slugify(form.name.trim()), address: form.address || undefined, city: form.city || undefined, state: form.state || undefined, phone: form.phone || undefined, externalId: form.externalId || undefined })}>
            {createUnit.isPending ? "Criando..." : "Criar Unidade"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function UnidadesPage() {
  const { org, units, loading } = useOrg();
  const { userRole } = useApp();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const isMasterOrAdmin = userRole === "master" || userRole === "org_admin";

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader title="Unidades" description="Gerencie as unidades da sua rede"
        actions={isMasterOrAdmin ? (org ? <CreateUnitDialog orgId={org.id} onCreated={() => utils.orgs.units.invalidate()} /> : <CreateOrgDialog onCreated={() => utils.orgs.list.invalidate()} />) : null}
      />
      {org && (
        <Card className="bg-card border-border"><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Building2 className="w-5 h-5 text-primary" /></div>
            <div><p className="text-sm font-semibold text-foreground">{org.name}</p>{(org as any).segment && <p className="text-xs text-muted-foreground">{(org as any).segment}</p>}</div>
            <Badge variant="secondary" className="ml-auto">{units.length} unidade{units.length !== 1 ? "s" : ""}</Badge>
          </div>
        </CardContent></Card>
      )}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="h-36 rounded-xl bg-card border border-border animate-pulse" />)}</div>
      ) : !org ? (
        <Card className="bg-card border-border border-dashed"><CardContent className="p-10 text-center">
          <Building2 className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Nenhuma organização configurada</p>
          <p className="text-xs text-muted-foreground mb-4">Crie sua organização para começar.</p>
          {isMasterOrAdmin && <CreateOrgDialog onCreated={() => utils.orgs.list.invalidate()} />}
        </CardContent></Card>
      ) : units.length === 0 ? (
        <Card className="bg-card border-border border-dashed"><CardContent className="p-10 text-center">
          <Building2 className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Nenhuma unidade cadastrada</p>
          <p className="text-xs text-muted-foreground mb-4">Adicione a primeira unidade da sua rede.</p>
          {isMasterOrAdmin && <CreateUnitDialog orgId={org.id} onCreated={() => utils.orgs.units.invalidate()} />}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {units.map(unit => (
            <Card key={unit.id} className="bg-card border-border hover:border-border/60 transition-all">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center"><Building2 className="w-4.5 h-4.5 text-primary" /></div>
                  <Badge variant="secondary" className="text-xs">Ativa</Badge>
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-2">{unit.name}</h3>
                <div className="space-y-1.5">
                  {unit.city && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="w-3 h-3 shrink-0" />{unit.city}{unit.state ? `, ${unit.state}` : ""}</div>}
                  {unit.externalId && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Hash className="w-3 h-3 shrink-0" />ID: {unit.externalId}</div>}
                </div>
                {isMasterOrAdmin && (
                  <Button variant="outline" size="sm" className="w-full mt-4 text-xs h-7 gap-1" onClick={() => navigate(`/configuracoes?unit=${unit.id}`)}>
                    <Settings className="w-3 h-3" />Configurar
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
