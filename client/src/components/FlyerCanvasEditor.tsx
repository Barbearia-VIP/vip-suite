/**
 * FlyerCanvasEditor.tsx — Editor de flyer com Fabric.js v6
 *
 * Correções v2:
 * - Edição de texto: usa textarea no painel lateral (não depende de enterEditing inline)
 *   para contornar o conflito de foco do Dialog do Radix UI.
 * - Redimensionamento de fundo: recalcula scaleX/scaleY com base nas dimensões
 *   originais da imagem (naturalWidth/naturalHeight) armazenadas em bgNaturalSize.
 * - Controle de zoom/escala da imagem de fundo via slider.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Canvas, FabricImage, IText, Shadow, type FabricObject } from "fabric";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Type, Palette, Download, Trash2, Bold, Italic,
  AlignLeft, AlignCenter, AlignRight, Plus, Move,
  ChevronUp, ChevronDown, RotateCcw, Layers, Maximize2, Pencil,
  ZoomIn, ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { VIP_STICKERS, STICKER_CATEGORIES, type StickerCategory } from "@/lib/vipStickers";

// ── Paleta de cores VIP ───────────────────────────────────────────────────────

const VIP_STICKER_COLORS = [
  { id: "gold",     label: "Dourado",  hex: "#D4AF37", textHex: "#0A0A0A" },
  { id: "white",    label: "Branco",   hex: "#FFFFFF", textHex: "#0A0A0A" },
  { id: "black",    label: "Preto",    hex: "#0A0A0A", textHex: "#D4AF37" },
  { id: "graphite", label: "Grafite",  hex: "#3A3A3A", textHex: "#D4AF37" },
  { id: "silver",   label: "Prata",    hex: "#C0C0C0", textHex: "#0A0A0A" },
] as const;

type StickerColorId = typeof VIP_STICKER_COLORS[number]["id"];

// ── Formatos de redes sociais ─────────────────────────────────────────────────

const SOCIAL_FORMATS = [
  { id: "post-ig",    label: "Post Instagram",  w: 1080, h: 1080, ratio: "1:1",   emoji: "📷" },
  { id: "story-ig",   label: "Story / Reels",   w: 1080, h: 1920, ratio: "9:16",  emoji: "📱" },
  { id: "banner-yt",  label: "Banner YouTube",  w: 1280, h: 720,  ratio: "16:9",  emoji: "▶️" },
  { id: "cover-fb",   label: "Capa Facebook",   w: 1200, h: 628,  ratio: "1.9:1", emoji: "📘" },
  { id: "post-fb",    label: "Post Facebook",   w: 1200, h: 900,  ratio: "4:3",   emoji: "📗" },
  { id: "banner-wpp", label: "Banner WhatsApp", w: 1600, h: 900,  ratio: "16:9",  emoji: "💬" },
  { id: "flyer-a4",   label: "Flyer A4",        w: 794,  h: 1123, ratio: "A4",    emoji: "📄" },
] as const;

// ── Helpers SVG ───────────────────────────────────────────────────────────────

function recolorSvg(svg: string, primaryColor: string, secondaryColor: string): string {
  const originalPrimary   = ["#D4AF37", "#F0C040", "#C9A84C"];
  const originalSecondary = ["#0A0A0A", "#1A1A1A"];
  const originalWhite     = ["#FFFFFF"];
  let result = svg;
  for (const c of originalPrimary)   result = result.replaceAll(c, primaryColor);
  for (const c of originalSecondary) result = result.replaceAll(c, secondaryColor);
  if (primaryColor === "#FFFFFF") {
    for (const c of originalWhite) result = result.replaceAll(c, secondaryColor);
  }
  return result;
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface FlyerCanvasEditorProps {
  flyerUrl: string;
  onSave?: (dataUrl: string) => void;
  onClose?: () => void;
}

type SidePanel = "text" | "sticker" | "resize" | "hint";

// ── Componente principal ──────────────────────────────────────────────────────

export default function FlyerCanvasEditor({ flyerUrl, onSave, onClose }: FlyerCanvasEditorProps) {
  const canvasElRef  = useRef<HTMLCanvasElement>(null);
  const fabricRef    = useRef<Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dimensões naturais da imagem de fundo (para recalcular escala corretamente)
  const bgNaturalRef = useRef<{ w: number; h: number }>({ w: 1, h: 1 });

  // Seleção
  const [selectedObj, setSelectedObj] = useState<FabricObject | null>(null);

  // Propriedades de texto
  const [textValue,  setTextValue]  = useState("");
  const [textColor,  setTextColor]  = useState("#FFFFFF");
  const [fontSize,   setFontSize]   = useState(36);
  const [isBold,     setIsBold]     = useState(false);
  const [isItalic,   setIsItalic]   = useState(false);
  const [textAlign,  setTextAlign]  = useState<"left" | "center" | "right">("center");
  const [fontFamily, setFontFamily] = useState("Oswald, sans-serif");

  // Canvas
  const [canvasSize, setCanvasSize] = useState({ w: 540, h: 540 });

  // Zoom da imagem de fundo (0.5 = 50%, 1 = 100%, 2 = 200%)
  const [bgScale, setBgScale] = useState(1);

  // Stickers
  const [stickerTab,     setStickerTab]     = useState<StickerCategory>("selos");
  const [stickerColorId, setStickerColorId] = useState<StickerColorId>("gold");

  // Painel lateral
  const [sidePanel, setSidePanel] = useState<SidePanel>("hint");

  // ── Inicializar canvas ────────────────────────────────────────────────────

  useEffect(() => {
    if (!canvasElRef.current) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      bgNaturalRef.current = { w: img.naturalWidth, h: img.naturalHeight };
      const ratio      = img.naturalWidth / img.naturalHeight;
      const containerW = containerRef.current?.clientWidth ?? 700;
      const maxW       = Math.min(containerW - 16, 660);
      const w          = maxW;
      const h          = Math.round(w / ratio);
      setCanvasSize({ w, h });

      const canvas = new Canvas(canvasElRef.current!, {
        width: w,
        height: h,
        selection: true,
        preserveObjectStacking: true,
        enableRetinaScaling: false,
        // Garantir que o canvas capture eventos de teclado
        allowTouchScrolling: false,
      });
      fabricRef.current = canvas;

      // Carregar imagem de fundo
      FabricImage.fromURL(flyerUrl, { crossOrigin: "anonymous" }).then((fabricImg) => {
        fabricImg.set({
          left: 0, top: 0,
          scaleX: w / img.naturalWidth,
          scaleY: h / img.naturalHeight,
          selectable: false,
          evented: false,
          name: "__background__",
          lockMovementX: true,
          lockMovementY: true,
          lockRotation: true,
          lockScalingX: true,
          lockScalingY: true,
          hasControls: false,
          hasBorders: false,
        });
        canvas.add(fabricImg);
        canvas.sendObjectToBack(fabricImg);
        canvas.renderAll();
      });

      // Eventos de seleção
      canvas.on("selection:created", (e) => syncSelectedToPanel(e.selected?.[0] ?? null));
      canvas.on("selection:updated", (e) => syncSelectedToPanel(e.selected?.[0] ?? null));
      canvas.on("selection:cleared", () => { setSelectedObj(null); setSidePanel("hint"); });

      // Sincronizar painel ao editar texto inline no canvas
      canvas.on("text:changed", (e) => {
        const t = e.target as IText;
        setTextValue(t.text ?? "");
      });

      return () => { canvas.dispose(); fabricRef.current = null; };
    };
    img.src = flyerUrl;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyerUrl]);

  // ── Sincronizar objeto selecionado → painel ───────────────────────────────

  const syncSelectedToPanel = (obj: FabricObject | null) => {
    setSelectedObj(obj);
    if (!obj) { setSidePanel("hint"); return; }

    if (obj.type === "i-text") {
      const t = obj as IText;
      setTextValue(t.text ?? "");
      setTextColor(typeof t.fill === "string" ? t.fill : "#FFFFFF");
      setFontSize(t.fontSize ?? 36);
      setIsBold(t.fontWeight === "bold");
      setIsItalic(t.fontStyle === "italic");
      setTextAlign((t.textAlign as "left" | "center" | "right") ?? "center");
      setFontFamily((t.fontFamily as string) ?? "Oswald, sans-serif");
      setSidePanel("text");
    } else if (
      obj.type === "image" &&
      (obj as FabricObject & { name?: string }).name?.startsWith("sticker-")
    ) {
      setSidePanel("sticker");
    }
  };

  // ── Adicionar texto editável ──────────────────────────────────────────────

  const addText = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const itext = new IText("Novo texto", {
      left:       canvasSize.w / 2,
      top:        canvasSize.h / 2,
      originX:    "center",
      originY:    "center",
      fontSize:   36,
      fontFamily: "Oswald, sans-serif",
      fill:       "#FFFFFF",
      fontWeight: "bold",
      textAlign:  "center",
      editable:   true,
      shadow: new Shadow({ color: "rgba(0,0,0,0.8)", offsetX: 2, offsetY: 2, blur: 4 }),
    });

    canvas.add(itext);
    canvas.setActiveObject(itext);
    canvas.renderAll();
    syncSelectedToPanel(itext);
    setSidePanel("text");
  }, [canvasSize]);

  // ── Aplicar mudanças de texto via painel (sem depender de foco no canvas) ─

  const applyTextChange = useCallback((changes: Partial<{
    text: string; fill: string; fontSize: number;
    fontWeight: string; fontStyle: string; textAlign: string;
    fontFamily: string;
  }>) => {
    const canvas = fabricRef.current;
    const obj    = canvas?.getActiveObject();
    if (!obj || obj.type !== "i-text") return;
    (obj as IText).set(changes as Partial<IText>);
    canvas?.renderAll();
  }, []);

  // ── Controle de zoom da imagem de fundo ───────────────────────────────────

  const applyBgScale = useCallback((scale: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const bg = canvas.getObjects().find(
      (o) => (o as FabricObject & { name?: string }).name === "__background__"
    );
    if (!bg) return;

    const { w: cw, h: ch } = canvasSize;
    const { w: nw, h: nh } = bgNaturalRef.current;

    // Escala base = imagem cobre o canvas inteiro (fit)
    const baseScaleX = cw / nw;
    const baseScaleY = ch / nh;

    // Aplicar zoom sobre a escala base
    const newScaleX = baseScaleX * scale;
    const newScaleY = baseScaleY * scale;

    // Centralizar a imagem de fundo
    const offsetX = (cw - nw * newScaleX) / 2;
    const offsetY = (ch - nh * newScaleY) / 2;

    bg.set({ scaleX: newScaleX, scaleY: newScaleY, left: offsetX, top: offsetY });
    canvas.renderAll();
    setBgScale(scale);
  }, [canvasSize]);

  // ── Adicionar sticker ─────────────────────────────────────────────────────

  const addSticker = useCallback((stickerId: string) => {
    const canvas  = fabricRef.current;
    if (!canvas) return;

    const sticker = VIP_STICKERS.find((s) => s.id === stickerId);
    if (!sticker) return;

    const colorConfig = VIP_STICKER_COLORS.find((c) => c.id === stickerColorId) ?? VIP_STICKER_COLORS[0];
    const coloredSvg  = recolorSvg(sticker.svg, colorConfig.hex, colorConfig.textHex);

    FabricImage.fromURL(svgToDataUrl(coloredSvg)).then((img) => {
      const scaleX = sticker.defaultWidth  / (img.width  ?? sticker.defaultWidth);
      const scaleY = sticker.defaultHeight / (img.height ?? sticker.defaultHeight);
      img.set({
        left: canvasSize.w / 2, top: canvasSize.h / 2,
        originX: "center", originY: "center",
        scaleX, scaleY,
        name: `sticker-${stickerId}`,
        data: { stickerId, originalSvg: sticker.svg },
      } as Parameters<typeof img.set>[0]);
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
      setSidePanel("sticker");
      toast.success(`"${sticker.name}" adicionado`);
    }).catch(() => toast.error("Erro ao adicionar sticker"));
  }, [canvasSize, stickerColorId]);

  // ── Recolorir sticker selecionado ─────────────────────────────────────────

  const recolorSelectedSticker = useCallback((colorId: StickerColorId) => {
    const canvas = fabricRef.current;
    const obj    = canvas?.getActiveObject();
    if (!obj || obj.type !== "image") return;
    const objWithData = obj as FabricObject & {
      data?: { stickerId: string; originalSvg: string };
      name?: string;
    };
    if (!objWithData.data?.originalSvg) return;

    const colorConfig = VIP_STICKER_COLORS.find((c) => c.id === colorId) ?? VIP_STICKER_COLORS[0];
    const coloredSvg  = recolorSvg(objWithData.data.originalSvg, colorConfig.hex, colorConfig.textHex);

    const saved = {
      left: obj.left, top: obj.top,
      scaleX: obj.scaleX, scaleY: obj.scaleY,
      angle: obj.angle,
      originX: obj.originX, originY: obj.originY,
      name: objWithData.name,
      data: objWithData.data,
    };

    FabricImage.fromURL(svgToDataUrl(coloredSvg)).then((newImg) => {
      newImg.set(saved as Parameters<typeof newImg.set>[0]);
      canvas?.remove(obj);
      canvas?.add(newImg);
      canvas?.setActiveObject(newImg);
      canvas?.renderAll();
      setSelectedObj(newImg);
    });
  }, []);

  // ── Redimensionar canvas para formato de rede social ─────────────────────

  const resizeToFormat = useCallback((formatId: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const fmt = SOCIAL_FORMATS.find((f) => f.id === formatId);
    if (!fmt) return;

    const containerW  = containerRef.current?.clientWidth ?? 700;
    const maxW        = Math.min(containerW - 16, 660);
    const displayRatio = fmt.w / fmt.h;
    const displayW    = maxW;
    const displayH    = Math.round(displayW / displayRatio);

    // Atualizar canvas
    canvas.setWidth(displayW);
    canvas.setHeight(displayH);
    setCanvasSize({ w: displayW, h: displayH });

    // Reposicionar imagem de fundo para cobrir o novo canvas
    const bg = canvas.getObjects().find(
      (o) => (o as FabricObject & { name?: string }).name === "__background__"
    );
    if (bg) {
      const { w: nw, h: nh } = bgNaturalRef.current;
      const newScaleX = displayW / nw;
      const newScaleY = displayH / nh;
      bg.set({ scaleX: newScaleX, scaleY: newScaleY, left: 0, top: 0 });
    }

    canvas.renderAll();
    setBgScale(1);
    toast.success(`Redimensionado para ${fmt.label} (${fmt.ratio})`);
  }, []);

  // ── Ações gerais ──────────────────────────────────────────────────────────

  const deleteSelected = useCallback(() => {
    const canvas = fabricRef.current;
    const obj    = canvas?.getActiveObject();
    if (!obj || (obj as FabricObject & { name?: string }).name === "__background__") return;
    canvas?.remove(obj);
    canvas?.renderAll();
    setSelectedObj(null);
    setSidePanel("hint");
  }, []);

  const bringForward = useCallback(() => {
    const canvas = fabricRef.current;
    const obj    = canvas?.getActiveObject();
    if (!obj) return;
    canvas?.bringObjectForward(obj);
    canvas?.renderAll();
  }, []);

  const sendBackward = useCallback(() => {
    const canvas = fabricRef.current;
    const obj    = canvas?.getActiveObject();
    if (!obj) return;
    canvas?.sendObjectBackwards(obj);
    canvas?.renderAll();
  }, []);

  const resetCanvas = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getObjects()
      .filter((o) => (o as FabricObject & { name?: string }).name !== "__background__")
      .forEach((o) => canvas.remove(o));
    canvas.renderAll();
    setSelectedObj(null);
    setSidePanel("hint");
  }, []);

  const exportPNG = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.renderAll();
    const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
    if (onSave) {
      onSave(dataUrl);
    } else {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `flyer-vip-editado-${Date.now()}.png`;
      a.click();
    }
    toast.success("Flyer salvo!");
  }, [onSave]);

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

  const filteredStickers  = VIP_STICKERS.filter((s) => s.category === stickerTab);
  const isTextSelected    = selectedObj?.type === "i-text";
  const isStickerSelected = selectedObj?.type === "image" &&
    !!(selectedObj as FabricObject & { name?: string }).name?.startsWith("sticker-");

  const FONT_OPTIONS = [
    { value: "Oswald, sans-serif",       label: "Oswald (Condensado)" },
    { value: "Montserrat, sans-serif",   label: "Montserrat" },
    { value: "Georgia, serif",           label: "Georgia (Serif)" },
    { value: "Arial, sans-serif",        label: "Arial" },
    { value: "Impact, sans-serif",       label: "Impact" },
    { value: "Playfair Display, serif",  label: "Playfair Display" },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* Barra de ferramentas superior */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-card border border-border">
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={addText}>
          <Plus className="h-3.5 w-3.5" /><Type className="h-3.5 w-3.5" /> Adicionar Texto
        </Button>
        <Button
          size="sm"
          variant={sidePanel === "resize" ? "default" : "outline"}
          className="h-8 text-xs gap-1.5"
          onClick={() => setSidePanel(sidePanel === "resize" ? "hint" : "resize")}
        >
          <Maximize2 className="h-3.5 w-3.5" /> Formatos
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
            Fechar
          </Button>
        )}
      </div>

      {/* Área principal: canvas + painel lateral */}
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
            <Move className="h-3 w-3" /> Clique para selecionar · Arraste para mover · Use o painel lateral para editar
          </p>
        </div>

        {/* Painel lateral */}
        <div className="w-64 shrink-0 space-y-3">

          {/* ── Painel: Texto ── */}
          {isTextSelected && (
            <div className="space-y-3 p-3 rounded-xl bg-card border border-border">
              <p className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5 text-amber-400" /> Editar Texto
              </p>

              {/* Conteúdo do texto */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Conteúdo</Label>
                <textarea
                  value={textValue}
                  rows={3}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTextValue(v);
                    applyTextChange({ text: v });
                  }}
                  className="w-full text-xs rounded-md border border-border bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 text-foreground"
                  placeholder="Digite o texto..."
                  // Impede que o Dialog capture o foco ao digitar
                  onKeyDown={(e) => e.stopPropagation()}
                  onKeyUp={(e) => e.stopPropagation()}
                />
              </div>

              {/* Fonte */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fonte</Label>
                <select
                  value={fontFamily}
                  onChange={(e) => { setFontFamily(e.target.value); applyTextChange({ fontFamily: e.target.value }); }}
                  className="w-full text-xs rounded-md border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400 text-foreground"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>

              {/* Cor */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Cor</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color" value={textColor}
                    onChange={(e) => { setTextColor(e.target.value); applyTextChange({ fill: e.target.value }); }}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent"
                  />
                  <Input
                    value={textColor}
                    onChange={(e) => { setTextColor(e.target.value); applyTextChange({ fill: e.target.value }); }}
                    className="text-xs h-8 font-mono"
                    placeholder="#FFFFFF"
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
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
                  type="range" min={10} max={160} value={fontSize}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setFontSize(v);
                    applyTextChange({ fontSize: v });
                  }}
                  className="w-full accent-amber-500"
                />
                <div className="flex gap-1.5">
                  {[14, 24, 36, 48, 64, 96].map((s) => (
                    <button
                      key={s}
                      onClick={() => { setFontSize(s); applyTextChange({ fontSize: s }); }}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        fontSize === s ? "border-amber-400 text-amber-400 bg-amber-950/30" : "border-border text-muted-foreground hover:border-amber-400/40"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Estilo e alinhamento */}
              <div className="flex gap-2">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs text-muted-foreground">Estilo</Label>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { setIsBold(!isBold); applyTextChange({ fontWeight: !isBold ? "bold" : "normal" }); }}
                      className={`w-8 h-8 rounded border flex items-center justify-center transition-colors ${isBold ? "border-amber-400 bg-amber-950/30 text-amber-400" : "border-border text-muted-foreground hover:border-amber-400/40"}`}
                    >
                      <Bold className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { setIsItalic(!isItalic); applyTextChange({ fontStyle: !isItalic ? "italic" : "normal" }); }}
                      className={`w-8 h-8 rounded border flex items-center justify-center transition-colors ${isItalic ? "border-amber-400 bg-amber-950/30 text-amber-400" : "border-border text-muted-foreground hover:border-amber-400/40"}`}
                    >
                      <Italic className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-xs text-muted-foreground">Alinhamento</Label>
                  <div className="flex gap-1">
                    {(["left", "center", "right"] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => { setTextAlign(a); applyTextChange({ textAlign: a }); }}
                        className={`w-8 h-8 rounded border flex items-center justify-center transition-colors ${textAlign === a ? "border-amber-400 bg-amber-950/30 text-amber-400" : "border-border text-muted-foreground hover:border-amber-400/40"}`}
                      >
                        {a === "left" ? <AlignLeft className="h-3.5 w-3.5" /> : a === "center" ? <AlignCenter className="h-3.5 w-3.5" /> : <AlignRight className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Botão duplicar */}
              <Button
                size="sm" variant="outline"
                className="w-full h-8 text-xs gap-1.5"
                onClick={() => {
                  const canvas = fabricRef.current;
                  const obj = canvas?.getActiveObject();
                  if (!obj || obj.type !== "i-text") return;
                  const t = obj as IText;
                  const clone = new IText(t.text ?? "", {
                    left: (t.left ?? 0) + 20,
                    top: (t.top ?? 0) + 20,
                    fontSize: t.fontSize, fontFamily: t.fontFamily as string,
                    fill: t.fill as string, fontWeight: t.fontWeight as string,
                    fontStyle: t.fontStyle as string, textAlign: t.textAlign as string,
                    editable: true,
                    shadow: t.shadow ?? undefined,
                  });
                  canvas?.add(clone);
                  canvas?.setActiveObject(clone);
                  canvas?.renderAll();
                  syncSelectedToPanel(clone);
                }}
              >
                <Plus className="h-3 w-3" /> Duplicar texto
              </Button>
            </div>
          )}

          {/* ── Painel: Zoom da imagem de fundo ── */}
          {!isTextSelected && !isStickerSelected && (
            <div className="space-y-3 p-3 rounded-xl bg-card border border-border">
              <p className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <ZoomIn className="h-3.5 w-3.5 text-amber-400" /> Imagem de Fundo
              </p>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Zoom ({Math.round(bgScale * 100)}%)</Label>
                <input
                  type="range" min={50} max={200} step={5} value={Math.round(bgScale * 100)}
                  onChange={(e) => applyBgScale(Number(e.target.value) / 100)}
                  className="w-full accent-amber-500"
                />
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => applyBgScale(Math.max(0.5, bgScale - 0.1))}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:border-amber-400/40 transition-colors"
                  >
                    <ZoomOut className="h-3 w-3" /> Menos
                  </button>
                  <button
                    onClick={() => applyBgScale(1)}
                    className="text-xs text-muted-foreground hover:text-amber-400 px-2 py-1 rounded border border-border hover:border-amber-400/40 transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => applyBgScale(Math.min(2, bgScale + 0.1))}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:border-amber-400/40 transition-colors"
                  >
                    <ZoomIn className="h-3 w-3" /> Mais
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Painel: Sticker selecionado ── */}
          {isStickerSelected && (
            <div className="space-y-3 p-3 rounded-xl bg-card border border-border">
              <p className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5 text-amber-400" /> Cor do Sticker
              </p>
              {VIP_STICKER_COLORS.map((color) => (
                <button
                  key={color.id}
                  onClick={() => { setStickerColorId(color.id); recolorSelectedSticker(color.id); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border-2 transition-all ${
                    stickerColorId === color.id
                      ? "border-amber-400 bg-amber-950/30"
                      : "border-border hover:border-amber-400/40 hover:bg-muted/30"
                  }`}
                >
                  <div className="w-5 h-5 rounded-full border border-border flex-shrink-0" style={{ backgroundColor: color.hex }} />
                  <span className="text-xs font-medium text-foreground">{color.label}</span>
                  <span className="text-[10px] text-muted-foreground font-mono ml-auto">{color.hex}</span>
                  {stickerColorId === color.id && <span className="text-amber-400 text-[10px] font-bold">✓</span>}
                </button>
              ))}
            </div>
          )}

          {/* ── Painel: Formatos ── */}
          {sidePanel === "resize" && !isTextSelected && !isStickerSelected && (
            <div className="space-y-3 p-3 rounded-xl bg-card border border-border">
              <p className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Maximize2 className="h-3.5 w-3.5 text-amber-400" /> Redimensionar
              </p>
              <p className="text-xs text-muted-foreground">Adapte o flyer para o formato desejado:</p>
              <div className="space-y-1.5">
                {SOCIAL_FORMATS.map((fmt) => (
                  <button
                    key={fmt.id}
                    onClick={() => resizeToFormat(fmt.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border hover:border-amber-400/60 hover:bg-amber-950/20 transition-all text-left"
                  >
                    <span className="text-base">{fmt.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{fmt.label}</p>
                      <p className="text-[10px] text-muted-foreground">{fmt.ratio} · {fmt.w}×{fmt.h}px</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Painel: Dica inicial ── */}
          {sidePanel === "hint" && !isTextSelected && !isStickerSelected && (
            <div className="p-3 rounded-xl bg-card border border-border">
              <p className="text-xs font-bold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Pencil className="h-3.5 w-3.5 text-amber-400" /> Como usar
              </p>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>1. Clique em <strong className="text-foreground">Adicionar Texto</strong></p>
                <p>2. <strong className="text-foreground">Clique no texto</strong> no canvas para selecioná-lo</p>
                <p>3. Edite o conteúdo, cor e tamanho no painel lateral</p>
                <p>4. Use o <strong className="text-amber-400">Zoom</strong> para ajustar a imagem de fundo</p>
                <p>5. Clique em <strong className="text-amber-400">Formatos</strong> para redimensionar</p>
                <p>6. Adicione <strong className="text-amber-400">stickers</strong> abaixo</p>
                <p>7. Clique em <strong className="text-amber-400">Salvar Flyer</strong> quando terminar</p>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Biblioteca de Stickers VIP ────────────────────────────────────── */}
      <div className="rounded-xl border border-amber-500/30 bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-gradient-to-r from-amber-950/30 to-transparent">
          <Layers className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Biblioteca de Elementos VIP</span>
          <span className="text-xs text-muted-foreground ml-1">— clique para adicionar ao flyer</span>
        </div>

        <div className="flex gap-0 border-b border-border overflow-x-auto">
          {STICKER_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setStickerTab(cat.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                stickerTab === cat.id
                  ? "border-amber-400 text-amber-400 bg-amber-950/20"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
              <span className="text-[10px] opacity-60">({VIP_STICKERS.filter((s) => s.category === cat.id).length})</span>
            </button>
          ))}
        </div>

        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {filteredStickers.map((sticker) => (
            <button
              key={sticker.id}
              onClick={() => addSticker(sticker.id)}
              className="group flex flex-col items-center gap-1.5 p-2 rounded-lg border border-border hover:border-amber-400/60 hover:bg-amber-950/20 transition-all cursor-pointer"
              title={`Adicionar: ${sticker.name}`}
            >
              <div
                className="flex items-center justify-center rounded bg-zinc-900 group-hover:bg-zinc-800 transition-colors"
                style={{ width: 64, height: 64 }}
              >
                <img
                  src={svgToDataUrl(sticker.svg)}
                  alt={sticker.name}
                  style={{
                    width:  Math.min(sticker.defaultWidth,  56),
                    height: Math.min(sticker.defaultHeight, 56),
                    objectFit: "contain",
                  }}
                  draggable={false}
                />
              </div>
              <span className="text-[10px] text-muted-foreground group-hover:text-amber-400 text-center leading-tight line-clamp-2 transition-colors">
                {sticker.name}
              </span>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
