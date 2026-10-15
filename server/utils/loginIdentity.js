// Accept common display separators without treating user input as regex syntax.
export function normalizeLoginPhone(value) {
  if (typeof value !== "string" || value.length > 64 || !/^\+?[\d\s().-]+$/.test(value.trim())) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^03\d{9}$/.test(digits)) digits = `92${digits.slice(1)}`;
  if (!/^\d{7,15}$/.test(digits)) return null;
  return digits;
}

export function phoneLoginPattern(value) {
  const digits = normalizeLoginPhone(value);
  if (!digits) return null;
  const variants = new Set([digits, `00${digits}`]);
  // Pakistani mobile numbers may be entered in local or international format.
  if (/^923\d{9}$/.test(digits)) variants.add(`0${digits.slice(2)}`);
  const separator = "[\\s().-]*";
  const alternatives = [...variants].map(number => [...number].join(separator));
  return new RegExp(`^\\s*\\+?(?:${alternatives.join("|")})\\s*$`);
}
