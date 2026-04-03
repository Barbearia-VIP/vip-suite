/**
 * NPSGauge — Medidor visual de NPS estimado (redesenhado)
 *
 * Fórmula: NPS = (% Promotores - % Detratores) × 100
 *   - Promotores: nota 5★
 *   - Neutros:    nota 4★
 *   - Detratores: nota 1★, 2★ ou 3★
 */

type NpsGaugeProps = {
  porNota: { nota: number | string; total: number | string }[];
};

function classifyNPS(nps: number) {
  if (nps >= 75) return { label: "EXCELENTE", color: "#22c55e" };
  if (nps >= 50) return { label: "ÓTIMO",     color: "#84cc16" };
  if (nps >= 25) return { label: "BOM",        color: "#f59e0b" };
  if (nps >= 0)  return { label: "NEUTRO",     color: "#f97316" };
  return              { label: "CRÍTICO",    color: "#ef4444" };
}

const toRad = (d: number) => (d * Math.PI) / 180;

// Arco de strokePath: cx, cy, r, startDeg, endDeg
function arcStroke(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2}`;
}

export function NPSGauge({ porNota }: NpsGaugeProps) {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const item of porNota) {
    const n = Math.round(Number(item.nota));
    if (n >= 1 && n <= 5) counts[n] = Number(item.total);
  }

  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  const promotores = counts[5];
  const neutros    = counts[4];
  const detratores = counts[1] + counts[2] + counts[3];

  const pctP = total > 0 ? (promotores / total) * 100 : 0;
  const pctN = total > 0 ? (neutros    / total) * 100 : 0;
  const pctD = total > 0 ? (detratores / total) * 100 : 0;
  const nps  = Math.round(pctP - pctD);

  const cls = classifyNPS(nps);

  // SVG layout: viewBox "0 0 400 200"
  // Semicírculo: centro (200, 185), raio externo 155, interno 115
  // Ângulos: 180° (esquerda) → 360°/0° (direita) passando por cima (270°)
  const CX = 200, CY = 185;
  const RO = 155, RI = 115; // outer / inner radius
  const RM = (RO + RI) / 2; // mid radius for stroke
  const SW = RO - RI;       // stroke width

  // Zonas: 180→240 (Detratores), 240→300 (Neutros), 300→360 (Promotores)
  const zones = [
    { s: 180, e: 240, color: "#ef4444", label: "Detratores" },
    { s: 240, e: 300, color: "#f59e0b", label: "Neutros"    },
    { s: 300, e: 360, color: "#22c55e", label: "Promotores" },
  ];

  // Ponteiro: NPS -100 → 180°, NPS +100 → 360°
  const needleDeg = 180 + ((nps + 100) / 200) * 180;
  const needleLen = RO - 8;
  const nx = CX + needleLen * Math.cos(toRad(needleDeg));
  const ny = CY + needleLen * Math.sin(toRad(needleDeg));

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Gauge SVG — ocupa 100% da largura do card */}
      <svg viewBox="0 0 400 200" className="w-full" style={{ overflow: "visible", maxHeight: 200 }}>
        <defs>
          <filter id="npsGlow2">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="npsGlowSoft">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Trilha de fundo */}
        <path
          d={arcStroke(CX, CY, RM, 180, 360)}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={SW + 4}
          strokeLinecap="butt"
        />

        {/* Zonas coloridas */}
        {zones.map((z) => (
          <path
            key={z.label}
            d={arcStroke(CX, CY, RM, z.s, z.e)}
            fill="none"
            stroke={z.color}
            strokeWidth={SW}
            strokeOpacity={total > 0 ? 0.75 : 0.25}
            strokeLinecap="butt"
          />
        ))}

        {/* Highlight glow no arco até o ponteiro */}
        {total > 0 && (
          <path
            d={arcStroke(CX, CY, RM, 180, Math.min(needleDeg, 359.9))}
            fill="none"
            stroke={cls.color}
            strokeWidth={SW + 8}
            strokeOpacity={0.18}
            strokeLinecap="butt"
            filter="url(#npsGlowSoft)"
          />
        )}

        {/* Separadores entre zonas */}
        {[240, 300].map((deg) => {
          const x1 = CX + (RI - 2) * Math.cos(toRad(deg));
          const y1 = CY + (RI - 2) * Math.sin(toRad(deg));
          const x2 = CX + (RO + 2) * Math.cos(toRad(deg));
          const y2 = CY + (RO + 2) * Math.sin(toRad(deg));
          return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(0,0,0,0.5)" strokeWidth={2.5} />;
        })}

        {/* Labels das zonas (fora do arco) */}
        {[
          { deg: 210, label: "Detratores", color: "#ef4444" },
          { deg: 270, label: "Neutros",    color: "#f59e0b" },
          { deg: 330, label: "Promotores", color: "#22c55e" },
        ].map(({ deg, label, color }) => {
          const pos = { x: CX + (RO + 18) * Math.cos(toRad(deg)), y: CY + (RO + 18) * Math.sin(toRad(deg)) };
          return (
            <text key={label} x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="middle"
              fontSize="10" fontWeight="700" fill={color} opacity="0.9">
              {label}
            </text>
          );
        })}

        {/* Ponteiro */}
        {total > 0 && (
          <g filter="url(#npsGlow2)">
            <line x1={CX} y1={CY} x2={nx} y2={ny}
              stroke="rgba(0,0,0,0.35)" strokeWidth={5} strokeLinecap="round" />
            <line x1={CX} y1={CY} x2={nx} y2={ny}
              stroke="white" strokeWidth={3} strokeLinecap="round" />
            <circle cx={CX} cy={CY} r={12} fill="#0f172a" stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} />
            <circle cx={CX} cy={CY} r={5}  fill="white" />
          </g>
        )}

        {/* Score NPS */}
        {total > 0 ? (
          <>
            <text x={CX} y={CY - 28} textAnchor="middle" fontSize="52" fontWeight="800"
              fill={cls.color} filter="url(#npsGlow2)">
              {nps >= 0 ? `+${nps}` : `${nps}`}
            </text>
            <text x={CX} y={CY - 4} textAnchor="middle" fontSize="12" fontWeight="700"
              fill={cls.color} opacity="0.85" letterSpacing="2">
              {cls.label}
            </text>
          </>
        ) : (
          <text x={CX} y={CY - 16} textAnchor="middle" fontSize="16" fill="#64748b">
            SEM DADOS
          </text>
        )}
      </svg>

      {/* Breakdown */}
      {total > 0 && (
        <div className="grid grid-cols-3 gap-3 w-full">
          {[
            { label: "Promotores", count: promotores, pct: pctP, color: "#22c55e", bg: "rgba(34,197,94,0.08)",  border: "rgba(34,197,94,0.2)"  },
            { label: "Neutros",    count: neutros,    pct: pctN, color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)" },
            { label: "Detratores", count: detratores, pct: pctD, color: "#ef4444", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.2)"  },
          ].map((item) => (
            <div key={item.label} className="rounded-xl p-3 text-center"
              style={{ background: item.bg, border: `1px solid ${item.border}` }}>
              <div className="text-2xl font-bold" style={{ color: item.color }}>{item.count}</div>
              <div className="text-xs font-semibold mt-0.5" style={{ color: item.color }}>{item.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{Math.round(item.pct)}%</div>
            </div>
          ))}
        </div>
      )}

      {/* Fórmula */}
      {total > 0 && (
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          NPS = % Promotores (5★) − % Detratores (1–3★)<br />
          <span style={{ color: "#22c55e" }}>{Math.round(pctP)}%</span>
          {" − "}
          <span style={{ color: "#ef4444" }}>{Math.round(pctD)}%</span>
          {" = "}
          <span style={{ color: cls.color, fontWeight: 700 }}>
            {nps >= 0 ? `+${nps}` : `${nps}`}
          </span>
          <span className="text-muted-foreground"> · {total} avaliações</span>
        </p>
      )}
    </div>
  );
}
