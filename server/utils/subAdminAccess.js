const id = "[a-f\\d]{24}";
const matches = (path, pattern) => new RegExp(`^${pattern}/?$`, "i").test(path);

// Explicit allowlist: new academy modules stay inaccessible by default.
export function canAccessAsSubAdmin(req) {
  const { baseUrl, path, method } = req;
  const read = method === "GET";
  if (baseUrl === "/api/auth") return read && matches(path, "/me") || method === "POST" && matches(path, "/(?:logout|change-password)");
  if (baseUrl === "/api/settings") return read && matches(path, "/");
  if (["/api/academic-sessions", "/api/classes", "/api/sections", "/api/subjects"].includes(baseUrl)) {
    return read && matches(path, `/(?:${id})?`);
  }
  if (baseUrl === "/api/students") {
    return read && matches(path, `/(?:${id})?`) ||
      method === "POST" && (matches(path, "/") || matches(path, `/${id}/enroll`)) ||
      method === "PUT" && matches(path, `/${id}`);
  }
  if (baseUrl === "/api/tests") {
    return read && (matches(path, `/(?:${id}(?:/roster)?)?`) || matches(path, "/teachers")) ||
      method === "POST" && (matches(path, "/") || matches(path, `/${id}/(?:marks|finalize|amend)`));
  }
  if (baseUrl === "/api/dashboard") return read && matches(path, `/tests/${id}/grade-distribution`);
  if (baseUrl === "/api/fees") {
    if (!read) return false;
    if (matches(path, "/invoices")) return /^[a-f\d]{24}$/i.test(req.query.student || "");
    return matches(path, `/invoices/${id}`) || matches(path, `/students/${id}/summary`);
  }
  if (baseUrl === "/api/reports" && read) {
    if (matches(path, "/students")) return true;
    return matches(path, "/(?:fee-collection|outstanding-fees)") && /^[a-f\d]{24}$/i.test(req.query.student || "");
  }
  return false;
}
