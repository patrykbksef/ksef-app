/** Calendar month bounds in Europe/Warsaw, as UTC ISO strings for DB filters. */

function warsawParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const map = Object.fromEntries(
    parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Convert a Warsaw wall-clock time to a UTC Instant (ISO). */
function warsawWallTimeToUtcIso(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): string {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i++) {
    const p = warsawParts(new Date(utcMs));
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    utcMs += desired - asUtc;
  }
  return new Date(utcMs).toISOString();
}

export function currentMonthRangeWarsaw(now = new Date()): {
  startIso: string;
  endIso: string;
} {
  const { year, month } = warsawParts(now);
  const startIso = warsawWallTimeToUtcIso(year, month, 1);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endIso = warsawWallTimeToUtcIso(nextYear, nextMonth, 1);
  return { startIso, endIso };
}
