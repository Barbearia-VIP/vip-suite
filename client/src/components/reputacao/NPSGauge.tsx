/**
 * NPSGauge — Medidor visual de NPS estimado
 *
 * Fórmula: NPS = (% Promotores - % Detratores) × 100
 *   - Promotores: nota 5★
 *   - Neutros:    nota 4★
 *   - Detratores: nota 1★, 2★ ou 3★
 *
 * Classificação:
 *   NPS ≥ 75 → Excelente (verde)
 *   NPS ≥ 50 → Ótimo    (azul)
 *   NPS ≥ 25 → Bom      (âmbar)
 *   NPS ≥  0 → Neutro   (amarelo)
 *   NPS  < 0 → Crítico  (vermelho)
 */

type NpsGaugeProps = {
  porNota: { nota: number | string; total: number | string }[];
};

function getArcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2}`;
}

export function NPSGauge({ porNota }: NpsGaugeProps) {
  // Agrupa contagens por nota
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const item of porNota) {
    const n = Math.round(Number(item.nota));
    if (n >= 1 && n <= 5) counts[n] = Number(item.total);
  }

  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  const promotores = counts[5];
  const neutros = counts[4];
  const detratores = counts[1] + counts[2] + counts[3];

  const pctPromo = total > 0 ? (promotores / total) * 100 : 0;
  const pctNeutro = total > 0 ? (neutros / total) * 100 : 0;
  const pctDetrat = total > 0 ? (detratores / total) * 100 : 0;
  const nps = Math.round(pctPromo - pctDetrat);

  // Classificação
  const { label, color, trackColor, bgColor } =
    nps >= 75 ? { label: "Excelente", color: "#22c55e", trackColor: "#16a34a", bgColor: "rgba(34,197,94,0.1)" }
    : nps >= 50 ? { label: "Ótimo", color: "#3b82f6", trackColor: "#2563eb", bgColor: "rgba(59,130,246,0.1)" }
    : nps >= 25 ? { label: "Bom", color: "#f59e0b", trackColor: "#d97706", bgColor: "rgba(245,158,11,0.1)" }
    : nps >= 0  ? { label: "Neutro", color: "#eab308", trackColor: "#ca8a04", bgColor: "rgba(234,179,8,0.1)" }
    :             { label: "Crítico", color: "#ef4444", trackColor: "#dc2626", bgColor: "rgba(239,68,68,0.1)" };

  // Gauge semicircular: -180° (esquerda) → 0° (direita), arco de 180°
  // Mapeamos NPS de -100..+100 para ângulo 180°..360° (ou equivalente -180°..0°)
  const CX = 120, CY = 110, R_OUTER = 90, R_INNER = 65;
  const START_DEG = 180; // esquerda
  const END_DEG = 360;   // direita (equivale a 0°)
  const TOTAL_ARC = 180;

  // Ângulo do ponteiro: NPS -100 → 180°, NPS +100 → 360°
  const needleDeg = START_DEG + ((nps + 100) / 200) * TOTAL_ARC;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const needleX = CX + (R_OUTER - 10) * Math.cos(toRad(needleDeg));
  const needleY = CY + (R_OUTER - 10) * Math.sin(toRad(needleDeg));

  // Arcos coloridos das 3 zonas (detratores / neutros / promotores)
  // Detratores: 180° → 240° (1/3 do arco)
  // Neutros:    240° → 300° (1/3 do arco)
  // Promotores: 300° → 360° (1/3 do arco)
  const zones = [
    { start: 180, end: 240, color: "#ef4444", opacity: 0.7 }, // Detratores
    { start: 240, end: 300, color: "#eab308", opacity: 0.7 }, // Neutros
    { start: 300, end: 360, color: "#22c55e", opacity: 0.7 }, // Promotores
  ];

  // Arco de progresso preenchido até o valor atual
  const fillEnd = needleDeg;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Gauge SVG */}
      <div style={{ position: "relative", width: 240, height: 140 }}>
        <svg viewBox="0 0 240 120" style={{ width: 240, height: 140, overflow: "visible" }}>
          <defs>
            <filter id="npsGlow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Trilha de fundo (cinza) */}
          <path
            d={getArcPath(CX, CY, (R_OUTER + R_INNER) / 2, 180, 360)}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={R_OUTER - R_INNER}
            strokeLinecap="butt"
          />

          {/* Zonas coloridas */}
          {zones.map((z, i) => (
            <path
              key={i}
              d={getArcPath(CX, CY, (R_OUTER + R_INNER) / 2, z.start, z.end)}
              fill="none"
              stroke={z.color}
              strokeWidth={R_OUTER - R_INNER}
              strokeOpacity={z.opacity}
              strokeLinecap="butt"
            />
          ))}

          {/* Arco de progresso (até o valor atual) com glow */}
          {total > 0 && (
            <path
              d={getArcPath(CX, CY, (R_OUTER + R_INNER) / 2, 180, Math.min(fillEnd, 359.9))}
              fill="none"
              stroke={color}
              strokeWidth={R_OUTER - R_INNER + 4}
              strokeOpacity={0.25}
              strokeLinecap="butt"
              filter="url(#npsGlow)"
            />
          )}

          {/* Separadores entre zonas */}
          {[240, 300].map((deg) => {
            const x1 = CX + R_INNER * Math.cos(toRad(deg));
            const y1 = CY + R_INNER * Math.sin(toRad(deg));
            const x2 = CX + R_OUTER * Math.cos(toRad(deg));
            const y2 = CY + R_OUTER * Math.sin(toRad(deg));
            return (
              <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="rgba(0,0,0,0.4)" strokeWidth={2} />
            );
          })}

          {/* Labels das zonas */}
          <text x={CX - 72} y={CY + 18} fontSize={8} fill="rgba(239,68,68,0.8)" textAnchor="middle" fontWeight="600">Detratores</text>
          <text x={CX} y={CY - 82} fontSize={8} fill="rgba(234,179,8,0.8)" textAnchor="middle" fontWeight="600">Neutros</text>
          <text x={CX + 72} y={CY + 18} fontSize={8} fill="rgba(34,197,94,0.8)" textAnchor="middle" fontWeight="600">Promotores</text>

          {/* Ponteiro */}
          {total > 0 && (
            <g>
              <line
                x1={CX} y1={CY}
                x2={needleX} y2={needleY}
                stroke={color}
                strokeWidth={3}
                strokeLinecap="round"
                filter="url(#npsGlow)"
              />
              <circle cx={CX} cy={CY} r={8} fill={color} />
              <circle cx={CX} cy={CY} r={4} fill="#1a1a2e" />
            </g>
          )}

          {/* Score NPS no centro */}
          <text x={CX} y={CY + 28} fontSize={28} fill={color}
            textAnchor="middle" fontWeight="800" filter="url(#npsGlow)">
            {total > 0 ? (nps > 0 ? `+${nps}` : `${nps}`) : "—"}
          </text>
          <text x={CX} y={CY + 42} fontSize={9} fill={color}
            textAnchor="middle" fontWeight="700" letterSpacing="1">
            {total > 0 ? label.toUpperCase() : "SEM DADOS"}
          </text>
        </svg>
      </div>

      {/* Legenda: Promotores / Neutros / Detratores */}
      {total > 0 && (
        <div className="w-full grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg p-2" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <div className="text-lg font-bold text-green-400">{promotores}</div>
            <div className="text-xs text-muted-foreground">Promotores</div>
            <div className="text-xs font-semibold text-green-400">{pctPromo.toFixed(0)}%</div>
          </div>
          <div className="rounded-lg p-2" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)" }}>
            <div className="text-lg font-bold text-yellow-400">{neutros}</div>
            <div className="text-xs text-muted-foreground">Neutros</div>
            <div className="text-xs font-semibold text-yellow-400">{pctNeutro.toFixed(0)}%</div>
          </div>
          <div className="rounded-lg p-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <div className="text-lg font-bold text-red-400">{detratores}</div>
            <div className="text-xs text-muted-foreground">Detratores</div>
            <div className="text-xs font-semibold text-red-400">{pctDetrat.toFixed(0)}%</div>
          </div>
        </div>
      )}

      {/* Fórmula explicativa */}
      {total > 0 && (
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          NPS = % Promotores (5★) − % Detratores (1–3★)<br />
          <span style={{ color }}>
            {pctPromo.toFixed(0)}% − {pctDetrat.toFixed(0)}% = {nps > 0 ? "+" : ""}{nps}
          </span>
          <span className="ml-1 text-muted-foreground">· {total} avaliações</span>
        </p>
      )}
    </div>
  );
}
