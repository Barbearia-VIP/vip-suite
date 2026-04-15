/**
 * DateRangePicker.tsx — Componente reutilizável de seleção de período
 * Layout compacto: 1 mês, largura fixa 300px, atalhos rápidos e lista de meses
 */
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, ChevronDown, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { format, subDays, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Tipos exportados ─────────────────────────────────────────────────────────
export type MonthFilter = { mode: "month"; periodo: string };
export type RangeFilter = { mode: "range"; dataInicio: string; dataFim: string; label: string };
export type DateFilter = MonthFilter | RangeFilter;

export function toISO(d: Date) { return format(d, "yyyy-MM-dd"); }

export function getFilterLabel(filter: DateFilter, periodos: { val: string; label: string }[]) {
  if (filter.mode === "month") {
    return periodos.find(p => p.val === filter.periodo)?.label ?? filter.periodo;
  }
  if (filter.dataInicio === filter.dataFim) {
    return format(new Date(filter.dataInicio + "T12:00:00"), "dd/MM/yyyy");
  }
  return `${format(new Date(filter.dataInicio + "T12:00:00"), "dd/MM")} – ${format(new Date(filter.dataFim + "T12:00:00"), "dd/MM/yyyy")}`;
}

export function buildPeriodos(monthCount = 24) {
  const now = new Date();
  const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const list = [];
  for (let i = 0; i < monthCount; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    list.push({ val, label: `${MESES[d.getMonth()]} ${d.getFullYear()}` });
  }
  return list;
}

function getQuickRanges() {
  const today = new Date();
  return [
    { label: "Hoje", dataInicio: toISO(today), dataFim: toISO(today) },
    { label: "Ontem", dataInicio: toISO(subDays(today, 1)), dataFim: toISO(subDays(today, 1)) },
    { label: "Esta semana", dataInicio: toISO(startOfWeek(today, { weekStartsOn: 1 })), dataFim: toISO(endOfWeek(today, { weekStartsOn: 1 })) },
    { label: "Últimos 7 dias", dataInicio: toISO(subDays(today, 6)), dataFim: toISO(today) },
    { label: "Últimos 30 dias", dataInicio: toISO(subDays(today, 29)), dataFim: toISO(today) },
  ];
}

// ─── Componente principal ─────────────────────────────────────────────────────
interface DateRangePickerProps {
  filter: DateFilter;
  onFilterChange: (f: DateFilter) => void;
  periodos?: { val: string; label: string }[];
  monthCount?: number;
  align?: "start" | "center" | "end";
}

export function DateRangePicker({
  filter,
  onFilterChange,
  periodos: periodosProp,
  monthCount = 24,
  align = "end",
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [calRange, setCalRange] = useState<DateRange | undefined>(undefined);
  const periodos = periodosProp ?? useMemo(() => buildPeriodos(monthCount), [monthCount]);
  const quickRanges = useMemo(() => getQuickRanges(), []);

  const buttonLabel = getFilterLabel(filter, periodos);

  function applyCalRange() {
    if (!calRange?.from) return;
    const from = toISO(calRange.from);
    const to = toISO(calRange.to ?? calRange.from);
    const label = from === to
      ? format(calRange.from, "dd/MM/yyyy")
      : `${format(calRange.from, "dd/MM")} – ${format(calRange.to ?? calRange.from, "dd/MM/yyyy")}`;
    onFilterChange({ mode: "range", dataInicio: from, dataFim: to, label });
    setOpen(false);
  }

  function clearToCurrentMonth() {
    const now = new Date();
    onFilterChange({
      mode: "month",
      periodo: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    });
    setCalRange(undefined);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5 min-w-[140px] justify-between bg-muted/50"
        >
          <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm truncate">{buttonLabel}</span>
          {filter.mode === "range" ? (
            <X
              className="w-3.5 h-3.5 text-muted-foreground shrink-0 hover:text-foreground"
              onClick={e => { e.stopPropagation(); clearToCurrentMonth(); }}
            />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto p-0 shadow-xl"
        align={align}
        side="bottom"
        sideOffset={6}
        avoidCollisions={true}
        collisionPadding={12}
      >
        <div className="flex flex-col w-[300px]">

          {/* ── Topo: Calendário compacto de 1 mês ── */}
          <div className="p-3 border-b border-border">
            <CalendarUI
              mode="range"
              selected={calRange}
              onSelect={setCalRange}
              locale={ptBR}
              numberOfMonths={1}
              disabled={{ after: new Date() }}
              className="rounded-md"
            />
            {calRange?.from && (
              <div className="mt-2 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs text-center font-medium">
                {calRange.to && calRange.from.getTime() !== calRange.to.getTime()
                  ? `${format(calRange.from, "dd/MM/yyyy", { locale: ptBR })} → ${format(calRange.to, "dd/MM/yyyy", { locale: ptBR })}`
                  : format(calRange.from, "dd/MM/yyyy", { locale: ptBR })
                }
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <Button size="sm" className="flex-1 h-7 text-xs" disabled={!calRange?.from} onClick={applyCalRange}>
                Aplicar
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!calRange?.from} onClick={() => setCalRange(undefined)}>
                Limpar
              </Button>
            </div>
          </div>

          {/* ── Atalhos rápidos ── */}
          <div className="p-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Atalhos</p>
            <div className="flex flex-wrap gap-1">
              {quickRanges.map(r => (
                <button
                  key={r.label}
                  onClick={() => {
                    onFilterChange({ mode: "range", dataInicio: r.dataInicio, dataFim: r.dataFim, label: r.label });
                    setCalRange(undefined);
                    setOpen(false);
                  }}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    filter.mode === "range" && (filter as RangeFilter).label === r.label
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted text-foreground"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Meses ── */}
          <div className="p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Por mês</p>
            <div className="max-h-[120px] overflow-y-auto space-y-0.5 pr-1">
              {periodos.map(p => (
                <button
                  key={p.val}
                  onClick={() => {
                    onFilterChange({ mode: "month", periodo: p.val });
                    setCalRange(undefined);
                    setOpen(false);
                  }}
                  className={`w-full text-left text-sm px-2 py-1 rounded hover:bg-muted transition-colors ${
                    filter.mode === "month" && (filter as MonthFilter).periodo === p.val
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

        </div>
      </PopoverContent>
    </Popover>
  );
}
