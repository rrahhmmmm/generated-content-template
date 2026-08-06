export const APP_TIMEZONE = "Asia/Jakarta";
export const APP_UTC_OFFSET = "+07:00";

export function parseDayStart(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(`${s}T00:00:00.000${APP_UTC_OFFSET}`);
  return isNaN(d.getTime()) ? undefined : d;
}

export function parseDayEnd(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(`${s}T23:59:59.999${APP_UTC_OFFSET}`);
  return isNaN(d.getTime()) ? undefined : d;
}

const fmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: APP_TIMEZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

export const formatDateTime = (d: Date) => fmt.format(d);
