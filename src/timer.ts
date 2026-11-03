export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function remainingSeconds(deadline: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function nextBreak(cycle: number, every: number) {
  const done = cycle + 1;
  const isLong = done >= every;
  return { cycle: isLong ? 0 : done, mode: isLong ? "long" as const : "short" as const };
}
