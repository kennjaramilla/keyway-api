// Synced from keyway/src/features/requests/time.ts by `npm run sync:domain`. Edit it there, not here.
// Building-local time helpers. Buildings carry an IANA timezone; the API stores UTC.

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function zonedParts(date: Date, timeZone: string): Parts {
  let format = partFormatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    partFormatters.set(timeZone, format);
  }
  const values = Object.fromEntries(
    format.formatToParts(date).map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year!,
    month: values.month!,
    day: values.day!,
    hour: values.hour!,
    minute: values.minute!,
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** YYYY-MM-DD of `date` in the building's timezone. */
export function localDate(date: Date, timeZone: string) {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Minutes since local midnight of `date` in the building's timezone. */
export function localMinutes(date: Date, timeZone: string) {
  const { hour, minute } = zonedParts(date, timeZone);
  return hour * 60 + minute;
}

/** HH:MM of `date` in the building's timezone. */
export function localTime(date: Date, timeZone: string) {
  const minutes = localMinutes(date, timeZone);
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** The UTC instant for a building-local wall time ("2026-10-20", "10:30"). */
export function zonedTimeToUtc(isoDate: string, time: string, timeZone: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wall;
  // Two passes settle the offset, including across DST changes.
  for (let pass = 0; pass < 2; pass++) {
    const parts = zonedParts(new Date(guess), timeZone);
    const seen = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    guess += wall - seen;
  }
  return new Date(guess);
}

export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
