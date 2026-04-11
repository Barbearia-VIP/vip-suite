import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas, FabricImage, FabricText, type FabricObject } from "fabric";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Type, Palette, Download, Trash2, Bold, Italic,
  AlignLeft, AlignCenter, AlignRight, Plus, Move,
  ChevronUp, ChevronDown, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface FlyerCanvasEditorProps {
  flyerUrl: string;
  onSave?: (dataUrl: string) => void;
  onClose?: () => void;
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function FlyerCanvasEditor({ flyerUrl, onSave, onClose }: FlyerCanvasEditorProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedObj, setSelectedObj] = useState<FabricObject | null>(null);
  const [textValue, setTextValue] = useState("");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [fontSize, setFontSize] = useState(32);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">("center");
  const [canvasSize, setCanvasSize] = useState({ w: 540, h: 540 });

  // ── Inicializar canvas ───────────────────────────────────────────────────

  useEffect(() => {
    if (!canvasElRef.current) return;

    // Detectar proporção da imagem para definir tamanho do canvas
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      // No modal fullscreen, usar largura maior disponível
      const containerW = containerRef.current?.clientWidth ?? 700;
      const maxW = Math.min(containerW, 700);
      const w = maxW;
      const h = Math.round(w / ratio);
      setCanvasSize({ w, h });

      const canvas = new Canvas(canvasElRef.current!, {
        width: w,
        height: h,
        selection: true,
        preserveObjectStacking: true,
      });
      fabricRef.current = canvas;

      // Carregar imagem de fundo
      FabricImage.fromURL(flyerUrl, { crossOrigin: "anonymous" }).then((fabricImg) => {
        fabricImg.set({
          left: 0,
          top: 0,
          scaleX: w / img.naturalWidth,
          scaleY: h / img.naturalHeight,
          selectable: false,
          evented: false,
          name: "__background__",
        });
        canvas.add(fabricImg);
        canvas.sendObjectToBack(fabricImg);
        canvas.renderAll();
      });

      // Listeners de seleção
      canvas.on("selection:created", (e) => updateSelection(e.selected?.[0] ?? null));
      canvas.on("selection:updated", (e) => updateSelection(e.selected?.[0] ?? null));
      canvas.on("selection:cleared", () => setSelectedObj(null));

      return () => {
        canvas.dispose();
        fabricRef.current = null;
      };
    };
    img.src = flyerUrl;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyerUrl]);

  // ── Atualizar painel lateral ao selecionar objeto ────────────────────────

  const updateSelection = (obj: FabricObject | null) => {
    setSelectedObj(obj);
    if (obj && obj.type === "text") {
      const t = obj as FabricText;
      setTextValue(t.text ?? "");
      setTextColor(typeof t.fill === "string" ? t.fill : "#FFFFFF");
      setFontSize(t.fontSize ?? 32);
      setIsBold(t.fontWeight === "bold");
      setIsItalic(t.fontStyle === "italic");
      setTextAlign((t.textAlign as "left" | "center" | "right") ?? "center");
    }
  };

  // ── Adicionar texto ──────────────────────────────────────────────────────

  const addText = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const text = new FabricText("Clique para editar", {
      left: canvasSize.w / 2,
      top: canvasSize.h / 2,
      originX: "center",
      originY: "center",
      fontSize: 36,
      fontFamily: "Oswald, sans-serif",
      fill: "#FFFFFF",
      fontWeight: "bold",
      textAlign: "center",
      // shadow aplicado via set após criação para evitar erro de tipo

      editable: true,
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
  }, [canvasSize]);

  // ── Atualizar texto selecionado ──────────────────────────────────────────

  const applyTextChange = useCallback((changes: Partial<{
    text: string; fill: string; fontSize: number;
    fontWeight: string; fontStyle: string; textAlign: string;
  }>) => {
    const canvas = fabricRef.current;
    const obj = canvas?.getActiveObject();
    if (!obj || obj.type !== "text") return;
    obj.set(changes as Partial<FabricText>);
    canvas?.renderAll();
  }, []);

  // ── Deletar objeto selecionado ───────────────────────────────────────────

  const deleteSelected = useCallback(() => {
    const canvas = fabricRef.current;
    const obj = canvas?.getActiveObject();
    if (!obj || (obj as FabricObject & { name?: string }).name === "__background__") return;
    canvas?.remove(obj);
    canvas?.renderAll();
    setSelectedObj(null);
  }, []);

  // ── Mover para frente/trás ───────────────────────────────────────────────

  const bringForward = useCallback(() => {
    const canvas = fabricRef.current;
    const obj = canvas?.getActiveObject();
    if (!obj) return;
    canvas?.bringObjectForward(obj);
    canvas?.renderAll();
  }, []);

  const sendBackward = useCallback(() => {
    const canvas = fabricRef.current;
    const obj = canvas?.getActiveObject();
    if (!obj) return;
    canvas?.sendObjectBackwards(obj);
    canvas?.renderAll();
  }, []);

  // ── Exportar PNG ─────────────────────────────────────────────────────────

  const exportPNG = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // Deselecionar antes de exportar
    canvas.discardActiveObject();
    canvas.renderAll();
    const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
    if (onSave) {
      onSave(dataUrl);
    } else {
      // Download direto
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `flyer-vip-editado-${Date.now()}.png`;
      a.click();
    }
    toast.success("Flyer salvo com sucesso!");
  }, [onSave]);

  // ── Download direto ──────────────────────────────────────────────────────

  const downloadEdited = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.renderAll();
    const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `flyer-vip-editado-${Date.now()}.png`;
    a.click();
    toast.success("Flyer baixado!");
  }, []);

  // ── Resetar (remover todos os textos adicionados) ────────────────────────

  const resetCanvas = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const toRemove = canvas.getObjects().filter(
      (o) => (o as FabricObject & { name?: string }).name !== "__background__"
    );
    toRemove.forEach((o) => canvas.remove(o));
    canvas.renderAll();
    setSelectedObj(null);
  }, []);

  const isTextSelected = selectedObj?.type === "text";

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de ferramentas superior */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-card border border-border">
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={addText}>
          <Plus className="h-3.5 w-3.5" /><Type className="h-3.5 w-3.5" /> Adicionar Texto
        </Button>
        <div className="h-5 w-px bg-border mx-1" />
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={bringForward} disabled={!selectedObj}>
          <ChevronUp className="h-3.5 w-3.5" /> Frente
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={sendBackward} disabled={!selectedObj}>
          <ChevronDown className="h-3.5 w-3.5" /> Trás
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-red-400 hover:text-red-300" onClick={deleteSelected} disabled={!selectedObj}>
          <Trash2 className="h-3.5 w-3.5" /> Remover
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-muted-foreground" onClick={resetCanvas}>
          <RotateCcw className="h-3.5 w-3.5" /> Resetar
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold"
          onClick={exportPNG}
        >
          <Download className="h-3.5 w-3.5" /> Salvar Flyer
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={downloadEdited}>
          <Download className="h-3.5 w-3.5" /> Baixar PNG
        </Button>
        {onClose && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onClose}>
            Fechar Editor
          </Button>
        )}
      </div>

      <div className="flex gap-4 items-start">
        {/* Canvas */}
        <div ref={containerRef} className="flex-1 min-w-0">
          <div
            className="rounded-xl overflow-hidden border border-amber-500/30 shadow-lg mx-auto"
            style={{ width: canvasSize.w, maxWidth: "100%" }}
          >
            <canvas ref={canvasElRef} />
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2 flex items-center justify-center gap-1">
            <Move className="h-3 w-3" /> Arraste textos para reposicionar · Duplo clique para editar texto
          </p>
        </div>

        {/* Painel de propriedades */}
        {isTextSelected && (
          <div className="w-56 shrink-0 space-y-3 p-3 rounded-xl bg-card border border-border">
            <p className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5 text-amber-400" /> Propriedades do Texto
            </p>

            {/* Texto */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Texto</Label>
              <Input
                value={textValue}
                onChange={(e) => {
                  setTextValue(e.target.value);
                  applyTextChange({ text: e.target.value });
                }}
                className="text-xs h-8"
                placeholder="Digite o texto..."
              />
            </div>

            {/* Cor */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cor do texto</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => {
                    setTextColor(e.target.value);
                    applyTextChange({ fill: e.target.value });
                  }}
                  className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent"
                />
                <Input
                  value={textColor}
                  onChange={(e) => {
                    setTextColor(e.target.value);
                    applyTextChange({ fill: e.target.value });
                  }}
                  className="text-xs h-8 font-mono"
                  placeholder="#FFFFFF"
                />
              </div>
              {/* Cores rápidas VIP */}
              <div className="flex gap-1.5 flex-wrap mt-1">
                {["#FFFFFF", "#D4AF37", "#C9A84C", "#F0C040", "#0A0A0A", "#1A1A1A"].map((c) => (
                  <button
                    key={c}
                    className="w-6 h-6 rounded-full border-2 border-border hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                    onClick={() => { setTextColor(c); applyTextChange({ fill: c }); }}
                    title={c}
                  />
                ))}
              </div>
            </div>

            {/* Tamanho */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tamanho ({fontSize}px)</Label>
              <input
                type="range"
                min={10}
                max={120}
                value={fontSize}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setFontSize(v);
                  applyTextChange({ fontSize: v });
                }}
                className="w-full accent-amber-500"
              />
            </div>

            {/* Estilo */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Estilo</Label>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant={isBold ? "default" : "outline"}
                  className="h-7 w-7 p-0"
                  onClick={() => {
                    const next = !isBold;
                    setIsBold(next);
                    applyTextChange({ fontWeight: next ? "bold" : "normal" });
                  }}
                >
                  <Bold className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant={isItalic ? "default" : "outline"}
                  className="h-7 w-7 p-0"
                  onClick={() => {
                    const next = !isItalic;
                    setIsItalic(next);
                    applyTextChange({ fontStyle: next ? "italic" : "normal" });
                  }}
                >
                  <Italic className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Alinhamento */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Alinhamento</Label>
              <div className="flex gap-1.5">
                {(["left", "center", "right"] as const).map((a) => (
                  <Button
                    key={a}
                    size="sm"
                    variant={textAlign === a ? "default" : "outline"}
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setTextAlign(a);
                      applyTextChange({ textAlign: a });
                    }}
                  >
                    {a === "left" ? <AlignLeft className="h-3 w-3" /> : a === "center" ? <AlignCenter className="h-3 w-3" /> : <AlignRight className="h-3 w-3" />}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Dica quando nada está selecionado */}
        {!isTextSelected && (
          <div className="w-56 shrink-0 p-3 rounded-xl bg-card border border-border">
            <p className="text-xs font-bold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Type className="h-3.5 w-3.5 text-amber-400" /> Editor de Flyer
            </p>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>• Clique em <strong className="text-foreground">Adicionar Texto</strong> para inserir um novo texto</p>
              <p>• <strong className="text-foreground">Arraste</strong> os textos para reposicionar</p>
              <p>• <strong className="text-foreground">Duplo clique</strong> para editar o conteúdo</p>
              <p>• Selecione um texto para ver as opções de cor, tamanho e estilo</p>
              <p>• Clique em <strong className="text-amber-400">Salvar Flyer</strong> quando terminar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
