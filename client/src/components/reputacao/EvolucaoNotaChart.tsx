/**
 * EvolucaoNotaChart — gráfico SVG puro da evolução da nota média
 * Usado no Dashboard de Reputação e na aba Análise
 */
import { useState } from "react";

export type EvolucaoItem = { mes: string; mesLabel: string; media: number; total: number };

export function EvolucaoNotaChart({
  data,
  notaMediaGeral,
}: {
  data: EvolucaoItem[];
  notaMediaGeral: number | null;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; item: EvolucaoItem } | null>(null);

  const W = 700;
  const H = 220;
  const PAD = { top: 24, right: 24, bottom: 36, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // Escala Y fixa de 3.0 a 5.2 para manter proporcionalidade visual
  const minY = 3.0;
  const maxY = 5.2;

  const toX = (i: number) => PAD.left + (i / Math.max(data.length - 1, 1)) * chartW;
  const toY = (v: number) => {
    const raw = PAD.top + chartH - ((v - minY) / (maxY - minY)) * chartH;
    return Math.max(PAD.top, Math.min(PAD.top + chartH, raw));
  };

  if (data.length === 0) return null;

  // Smooth bezier
  const smoothPath = (pts: [number, number][]) => {
    if (pts.length < 2) return "";
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const cpx = (x0 + x1) / 2;
      d += ` C${cpx},${y0} ${cpx},${y1} ${x1},${y1}`;
    }
    return d;
  };

  const pointCoords: [number, number][] = data.map((d, i) => [toX(i), toY(d.media)]);
  const linePath = smoothPath(pointCoords);
  const lastPt = pointCoords[pointCoords.length - 1];
  const firstPt = pointCoords[0];
  const areaPath = linePath + ` L${lastPt[0]},${PAD.top + chartH} L${firstPt[0]},${PAD.top + chartH} Z`;

  const step = data.length > 12 ? Math.ceil(data.length / 8) : 1;

  const yTicks: number[] = [];
  for (let v = Math.ceil(minY * 2) / 2; v <= maxY; v += 0.5) yTicks.push(parseFloat(v.toFixed(1)));

  const lineColor = "#f59e0b";
  const gradStart = "#f59e0b";

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 260, display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="evolGradArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={gradStart} stopOpacity={0.55} />
            <stop offset="60%" stopColor={gradStart} stopOpacity={0.15} />
            <stop offset="100%" stopColor={gradStart} stopOpacity={0.0} />
          </linearGradient>
          <filter id="evolGlow">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="evolLineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={gradStart} stopOpacity={0.7} />
            <stop offset="50%" stopColor={gradStart} stopOpacity={1} />
            <stop offset="100%" stopColor={gradStart} stopOpacity={0.9} />
          </linearGradient>
          <clipPath id="evolClip">
            <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} />
          </clipPath>
        </defs>

        {/* fundo */}
        <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH}
          fill="rgba(255,255,255,0.02)" rx={4} />

        {/* grid horizontal */}
        {yTicks.map(t => (
          <g key={t}>
            <line
              x1={PAD.left} y1={toY(t)} x2={PAD.left + chartW} y2={toY(t)}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={t % 1 === 0 ? 1 : 0.5}
              strokeDasharray={t % 1 === 0 ? "4 4" : "2 4"}
            />
            {t % 1 === 0 && (
              <text x={PAD.left - 6} y={toY(t) + 4} fontSize={10}
                fill="rgba(255,255,255,0.45)" textAnchor="end" fontWeight="500">
                {t}★
              </text>
            )}
          </g>
        ))}

        {/* área + linha com glow (clipada) */}
        <g clipPath="url(#evolClip)">
          <path d={areaPath} fill="url(#evolGradArea)" />
          <path d={linePath} fill="none" stroke="url(#evolLineGrad)" strokeWidth={3}
            strokeLinejoin="round" strokeLinecap="round" filter="url(#evolGlow)" />
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2.5}
            strokeLinejoin="round" strokeLinecap="round" />
        </g>

        {/* linha de referência da média geral */}
        {notaMediaGeral && (
          <>
            <line
              x1={PAD.left} y1={toY(notaMediaGeral)}
              x2={PAD.left + chartW} y2={toY(notaMediaGeral)}
              stroke={lineColor} strokeWidth={1.5} strokeDasharray="6 4" strokeOpacity={0.6}
            />
            <rect
              x={PAD.left + chartW - 68} y={toY(notaMediaGeral) - 14}
              width={66} height={16} rx={4}
              fill={lineColor} fillOpacity={0.15}
            />
            <text
              x={PAD.left + chartW - 4} y={toY(notaMediaGeral) - 3}
              fontSize={10} fill={lineColor} textAnchor="end" fontWeight="700">
              ∅ {notaMediaGeral.toFixed(1)}★
            </text>
          </>
        )}

        {/* pontos interativos (até 36 pontos) */}
        {data.length <= 36 && pointCoords.map(([cx, cy], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r={data.length <= 24 ? 5 : 3.5}
              fill={lineColor} stroke="#1a1a2e" strokeWidth={2}
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => {
                const svgEl = (e.target as SVGElement).closest("svg")!;
                const rect = svgEl.getBoundingClientRect();
                setTooltip({
                  x: cx / W * rect.width + rect.left,
                  y: cy / H * rect.height + rect.top,
                  item: data[i],
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            />
            <circle cx={cx} cy={cy} r={data.length <= 24 ? 8 : 6}
              fill={lineColor} fillOpacity={0.15} pointerEvents="none" />
          </g>
        ))}

        {/* zonas hover para muitos pontos */}
        {data.length > 36 && pointCoords.map(([cx, cy], i) => (
          <rect key={i}
            x={cx - chartW / data.length / 2} y={PAD.top}
            width={chartW / data.length} height={chartH}
            fill="transparent" style={{ cursor: "pointer" }}
            onMouseEnter={(e) => {
              const svgEl = (e.target as SVGElement).closest("svg")!;
              const rect2 = svgEl.getBoundingClientRect();
              setTooltip({
                x: cx / W * rect2.width + rect2.left,
                y: cy / H * rect2.height + rect2.top,
                item: data[i],
              });
            }}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}

        {/* labels eixo X */}
        {data.map((d, i) => i % step === 0 && (
          <text key={i} x={toX(i)} y={H - 6} fontSize={9.5}
            fill="rgba(255,255,255,0.4)" textAnchor="middle">
            {d.mesLabel}
          </text>
        ))}

        {/* último ponto destacado */}
        {pointCoords.length > 0 && (() => {
          const last = data[data.length - 1];
          const [lx, ly] = pointCoords[pointCoords.length - 1];
          return (
            <g>
              <circle cx={lx} cy={ly} r={7} fill={lineColor} stroke="#1a1a2e" strokeWidth={2.5} />
              <circle cx={lx} cy={ly} r={12} fill={lineColor} fillOpacity={0.2} />
              <rect x={lx - 22} y={ly - 26} width={44} height={18} rx={5}
                fill={lineColor} fillOpacity={0.9} />
              <text x={lx} y={ly - 13} fontSize={11} fill="#1a1a2e"
                textAnchor="middle" fontWeight="800">
                {last.media}★
              </text>
            </g>
          );
        })()}
      </svg>

      {/* Tooltip flutuante */}
      {tooltip && (
        <div style={{
          position: "fixed",
          left: tooltip.x + 14,
          top: tooltip.y - 52,
          background: "linear-gradient(135deg, #1e1e2e 0%, #16213e 100%)",
          border: `1px solid ${lineColor}40`,
          borderRadius: 10,
          padding: "8px 14px",
          fontSize: 12,
          pointerEvents: "none",
          zIndex: 50,
          boxShadow: `0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px ${lineColor}20`,
          minWidth: 130,
        }}>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, marginBottom: 2 }}>
            {tooltip.item.mesLabel}
          </div>
          <div style={{ color: lineColor, fontWeight: 700, fontSize: 16 }}>
            {tooltip.item.media} ★
          </div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>
            {tooltip.item.total} avaliações
          </div>
        </div>
      )}
    </div>
  );
}
