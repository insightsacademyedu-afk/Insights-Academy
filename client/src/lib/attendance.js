export const attendanceTime = date => date ? new Intl.DateTimeFormat("en-PK", {
  timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hour12: true,
}).format(new Date(date)) : "—";

export const cardDate = date => date ? new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric",
}).format(new Date(date)) : "—";

export function todayInKarachi() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function safePhotoUrl(value) {
  return typeof value === "string" && (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) || /^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value)) ? value : "";
}
