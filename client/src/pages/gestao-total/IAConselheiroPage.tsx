/**
 * IAConselheiroPage.tsx — Chat com IA Conselheiro especializado em gestão de barbearias
 */
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useApp } from "@/contexts/AppContext";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Send, Brain, Trash2, Plus, MessageSquare } from "lucide-react";

type Conversation = {
  id: number; titulo: string; updatedAt: Date;
};
type Message = {
  role: string; content: string; timestamp: string;
};

export default function IAConselheiroPage() {
  const { selectedUnit } = useApp();
  const { org } = useOrg();
  const utils = trpc.useUtils();
  const [conversationId, setConversationId] = useState<number|undefined>(undefined);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const convsQ = trpc.gestaoTotal.ia.listConversations.useQuery(
    { orgId:org?.id??0, unitId:selectedUnit?.id },
    { enabled:!!org?.id }
  );
  const conversations = (convsQ.data??[]) as Conversation[];

  const kpisQ = trpc.gestaoTotal.dashboard.kpis.useQuery(
    { orgId:org?.id??0, unitId:selectedUnit?.id },
    { enabled:!!org?.id }
  );
  const kpis = kpisQ.data;

  const chatM = trpc.gestaoTotal.ia.chat.useMutation({
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role:"assistant", content:data.reply, timestamp:new Date().toISOString() }]);
      if (!conversationId) setConversationId(data.conversationId);
      convsQ.refetch();
      setSending(false);
    },
    onError: () => { toast.error("Erro ao enviar mensagem"); setSending(false); },
  });
  const deleteM = trpc.gestaoTotal.ia.deleteConversation.useMutation({
    onSuccess: () => { utils.gestaoTotal.ia.listConversations.invalidate(); setConversationId(undefined); setMessages([]); toast.success("Conversa removida"); },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages]);

  function handleSend() {
    if (!input.trim() || !org?.id || sending) return;
    const msg = input.trim();
    setInput("");
    setSending(true);
    setMessages(prev => [...prev, { role:"user", content:msg, timestamp:new Date().toISOString() }]);
    chatM.mutate({
      orgId: org.id, unitId: selectedUnit?.id,
      conversationId,
      message: msg,
      context: {
        tarefasPendentes: kpis?.tarefasPendentes,
        problemasAbertos: kpis?.problemasAbertos,
        colaboradoresAtivos: kpis?.colaboradoresAtivos,
      },
    });
  }

  function handleNewConversation() {
    setConversationId(undefined);
    setMessages([]);
  }

  return (
    <div className="p-6 h-[calc(100vh-80px)] flex gap-4">
      {/* Sidebar de conversas */}
      <div className="w-64 shrink-0 flex flex-col gap-3">
        <Button size="sm" onClick={handleNewConversation} className="gap-1.5 w-full">
          <Plus className="w-3.5 h-3.5" /> Nova Conversa
        </Button>
        <div className="flex-1 overflow-y-auto space-y-1">
          {convsQ.isLoading ? (
            Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-12 rounded-lg" />)
          ) : conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma conversa ainda</p>
          ) : conversations.map(c => (
            <div key={c.id}
              onClick={() => { setConversationId(c.id); setMessages([]); }}
              className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${conversationId===c.id?"bg-primary/10 border border-primary/30":"hover:bg-muted/50 border border-transparent"}`}>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{c.titulo}</p>
                <p className="text-xs text-muted-foreground">{new Date(c.updatedAt).toLocaleDateString("pt-BR")}</p>
              </div>
              <button onClick={e=>{e.stopPropagation();deleteM.mutate({id:c.id,orgId:org!.id});}} className="text-muted-foreground hover:text-red-400 p-0.5 ml-1 shrink-0">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground font-display tracking-tight">IA Conselheiro</h1>
            <p className="text-xs text-muted-foreground">Especialista em gestão de barbearias • {selectedUnit?.name ?? "Todas as unidades"}</p>
          </div>
        </div>

        {/* Mensagens */}
        <div className="glass-card flex-1 bg-white/5 border-white/10 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Brain className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">IA Conselheiro VIP</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">Pergunte sobre gestão, estratégia, finanças, equipe ou qualquer aspecto do seu negócio.</p>
                </div>
                <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
                  {["Como melhorar a retenção de clientes?","Quais indicadores devo acompanhar?","Como motivar minha equipe?"].map(s=>(
                    <button key={s} onClick={()=>setInput(s)} className="text-xs text-left px-3 py-2 rounded-lg border border-white/10 hover:border-primary/40 text-muted-foreground hover:text-foreground transition-colors">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${m.role==="user"?"bg-primary text-primary-foreground":"bg-muted text-foreground"}`}>
                  {m.role==="assistant"&&<div className="flex items-center gap-1.5 mb-1"><Brain className="w-3 h-3 text-primary" /><span className="text-xs font-medium text-primary">IA Conselheiro</span></div>}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  <p className={`text-xs mt-1 ${m.role==="user"?"text-primary-foreground/70":"text-muted-foreground"}`}>{new Date(m.timestamp).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</p>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl px-4 py-2.5">
                  <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{animationDelay:"0ms"}} /><div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{animationDelay:"150ms"}} /><div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{animationDelay:"300ms"}} /></div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-white/10 p-3">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&handleSend()}
                placeholder="Pergunte algo sobre seu negócio..."
                className="text-sm flex-1"
                disabled={sending}
              />
              <Button size="sm" onClick={handleSend} disabled={!input.trim()||sending} className="px-3">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
