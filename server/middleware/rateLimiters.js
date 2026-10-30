import rateLimit from "express-rate-limit";

// Under the automated test suite every request comes from the same
// "IP" (supertest talks to the app in-process), so a whole run can
// easily exceed real-world limits without a single genuine abuse
// pattern occurring. Keep the real limits in every other environment;
// only relax them here so tests exercise business logic, not the
// rate limiter itself (that's covered by its own dedicated test).
const isTest = process.env.NODE_ENV === "test";

// Slows down brute-force attempts against the login endpoint specifically.
// This is on top of the per-account lockout in authController — the two
// work together: this limits by IP, the account lockout limits by account.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 20, // 20 attempts per IP per 15 min across all accounts
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again later." },
});

// A more relaxed general limiter for the rest of the API.
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// Morning arrivals must not consume the general 300-request portal budget.
// The ingress limit protects authentication; the account limit follows auth.
export const attendanceIngressRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 10000 : 600,
  standardHeaders: true, legacyHeaders: false,
  message: { message: "Too many scan requests. Please wait a moment and retry." },
});
export const attendanceAccountRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 10000 : 120,
  keyGenerator: req => String(req.user._id),
  standardHeaders: true, legacyHeaders: false,
  message: { message: "Scanning too quickly. Please wait a moment and retry." },
});

// Phase 10: a tighter limiter for account-credential actions that aren't
// the login route itself but have the same abuse shape — create-login,
// reset-password, and revoke-login all mint or destroy access to a real
// account. These previously only got the general 300/15min limiter, which
// is loose enough that a compromised admin session (or a leaked admin
// cookie) could be used to hammer password resets across the whole staff
// directory. `loginRateLimiter` is IP-scoped and unauthenticated by
// design (it protects the login form itself); this one is for already-
// authenticated admin-only mutations, so a lower ceiling doesn't risk
// locking out a legitimate anonymous user the way a stricter
// `loginRateLimiter` would.
export const sensitiveActionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10000 : 10, // 10 create-login/reset-password/revoke-login calls per IP per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many account actions from this IP. Please try again later." },
});
