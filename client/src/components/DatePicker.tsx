/**
 * DatePicker.tsx — Seletor de data com Popover + Calendar
 * Substitui inputs type="date" em todo o sistema.
 * Aceita valor como string "YYYY-MM-DD" para compatibilidade com os forms existentes.
 */
import { useState } from "react";
import { format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  /** Valor atual no formato "YYYY-MM-DD" */
  value: string;
  /** Callback chamado com a nova data no formato "YYYY-MM-DD" */
  onChange: (value: string) => void;
  /** Placeholder exibido quando não há data selecionada */
  placeholder?: string;
  /** Data máxima permitida no formato "YYYY-MM-DD" */
  max?: string;
  /** Data mínima permitida no formato "YYYY-MM-DD" */
  min?: string;
  /** Classes CSS adicionais para o botão trigger */
  className?: string;
  /** Desabilitar o seletor */
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Selecionar data",
  max,
  min,
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  // Converte string "YYYY-MM-DD" para Date
  const parseDate = (str: string): Date | undefined => {
    if (!str) return undefined;
    const d = parseISO(str);
    return isValid(d) ? d : undefined;
  };

  const selected = parseDate(value);
  const maxDate = max ? parseDate(max) : undefined;
  const minDate = min ? parseDate(min) : undefined;

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      // Formata como "YYYY-MM-DD" em UTC local para evitar drift de fuso
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      onChange(`${y}-${m}-${d}`);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal h-9 px-3",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-60" />
          {selected
            ? format(selected, "dd/MM/yyyy", { locale: ptBR })
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          locale={ptBR}
          disabled={(date) => {
            if (maxDate && date > maxDate) return true;
            if (minDate && date < minDate) return true;
            return false;
          }}
          defaultMonth={selected ?? (maxDate ?? new Date())}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * DateRangePicker — Dois DatePickers lado a lado para seleção de intervalo.
 */
interface DateRangePickerProps {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  maxDate?: string;
  className?: string;
}

export function DateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
  maxDate,
  className,
}: DateRangePickerProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DatePicker
        value={from}
        onChange={onFromChange}
        placeholder="Data inicial"
        max={to || maxDate}
        className="w-36"
      />
      <span className="text-muted-foreground text-sm shrink-0">até</span>
      <DatePicker
        value={to}
        onChange={onToChange}
        placeholder="Data final"
        min={from}
        max={maxDate}
        className="w-36"
      />
    </div>
  );
}
