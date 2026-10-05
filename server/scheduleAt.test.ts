import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleAt } from './scheduleAt';

describe('scheduleAt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T09:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('não executa um job mensal distante antecipadamente por overflow de setTimeout', async () => {
    const job = vi.fn();
    const target = new Date('2026-11-01T09:00:00Z');
    scheduleAt(target, job);
    await vi.advanceTimersByTimeAsync(22 * 24 * 60 * 60 * 1000);
    expect(job).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5 * 24 * 60 * 60 * 1000);
    expect(job).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('permite cancelar um agendamento sem executar o callback', async () => {
    const job = vi.fn();
    const schedule = scheduleAt(new Date('2026-11-01T09:00:00Z'), job);
    schedule.cancel();
    await vi.advanceTimersByTimeAsync(30 * 24 * 60 * 60 * 1000);
    expect(job).not.toHaveBeenCalled();
  });
});
