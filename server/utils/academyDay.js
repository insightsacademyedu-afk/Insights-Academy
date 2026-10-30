export const ACADEMY_TIMEZONE = "Asia/Karachi";
export function academyDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ACADEMY_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = type => parts.find(part => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

// Expiry is exclusive: issued 30 Oct -> valid through 29 Oct next year.
export function annualExpiry(date = new Date()) {
  const [year, month, day] = academyDay(date).split("-").map(Number);
  const lastDay = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  return new Date(Date.UTC(year + 1, month - 1, Math.min(day, lastDay)) - 5 * 60 * 60 * 1000);
}

export function validateDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw Object.assign(new Error("Enter a valid date in YYYY-MM-DD format"), { status: 400 });
  }
  return value;
}
