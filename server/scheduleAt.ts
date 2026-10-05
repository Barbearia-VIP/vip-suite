// Node.js executa imediatamente timers com atraso superior a 2^31-1 ms.
// Para datas distantes, acorda no máximo a cada 24 horas e recalcula o tempo restante.
const MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000;

export function scheduleAt(target: Date, callback: () => void | Promise<void>): { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const tick = () => {
    if (cancelled) return;
    const remaining = target.getTime() - Date.now();
    if (remaining > 0) {
      timer = setTimeout(tick, Math.min(remaining, MAX_TIMER_DELAY_MS));
      return;
    }
    timer = null;
    void callback();
  };
  tick();

  return {
    cancel: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
