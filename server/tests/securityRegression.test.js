import request from "supertest";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import app from "../app.js";
import User from "../models/User.js";
import { createAdminSession, withCsrf } from "./helpers/authHelpers.js";
import { decodeBackup, encodeBackup, MAX_EXPANDED_BACKUP_BYTES, FORMAT, VERSION } from "../services/localBackup.js";

async function prepareReset(user, code = "123456") {
  await User.updateOne({ _id: user._id }, { $set: {
    passwordResetTokenHash: createHash("sha256").update(code).digest("hex"),
    passwordResetExpiresAt: new Date(Date.now() + 600000), passwordResetAttempts: 0,
  } });
}
const resetBody = (email, code = "123456") => ({ email, code,
  newPassword: "NewPass8", confirmPassword: "NewPass8" });

test("parallel reset guesses cannot bypass the five-attempt account limit", async () => {
  const { user } = await createAdminSession(app);
  await prepareReset(user);
  const responses = await Promise.all(Array.from({ length: 12 }, () =>
    request(app).post("/api/auth/reset-password").send(resetBody(user.email, "654321"))));
  expect(responses.every(res => res.status === 400)).toBe(true);
  const updated = await User.findById(user._id).select("+passwordResetAttempts");
  expect(updated.passwordResetAttempts).toBe(5);
  expect((await request(app).post("/api/auth/reset-password").send(resetBody(user.email))).status).toBe(400);
});

test("a reset code can be consumed only once under concurrency and invalidates sessions", async () => {
  const { user, agent } = await createAdminSession(app);
  await prepareReset(user);
  const short = await request(app).post("/api/auth/reset-password").send({ ...resetBody(user.email), newPassword: "short77", confirmPassword: "short77" });
  expect(short.status).toBe(400);
  const responses = await Promise.all(Array.from({ length: 2 }, () =>
    request(app).post("/api/auth/reset-password").send(resetBody(user.email))));
  expect(responses.map(res => res.status).sort()).toEqual([200, 400]);
  expect((await agent.get("/api/auth/me")).status).toBe(401);
  expect((await User.findById(user._id)).tokenVersion).toBe(1);
});

test("changing a password cancels an outstanding reset code", async () => {
  const { user, agent, csrfToken } = await createAdminSession(app);
  await prepareReset(user);
  const response = await withCsrf(agent.post("/api/auth/change-password").send({
    currentPassword: "Password123!", newPassword: "ChangedPassword123!", confirmPassword: "ChangedPassword123!",
  }), csrfToken);
  expect(response.status).toBe(200);
  expect((await request(app).post("/api/auth/reset-password").send(resetBody(user.email))).status).toBe(400);
});

test("parallel bad logins trigger account lockout without losing increments", async () => {
  const { user } = await createAdminSession(app);
  await Promise.all(Array.from({ length: 8 }, () => request(app).post("/api/auth/login")
    .send({ role: "admin", username: user.username, password: "wrong" })));
  expect((await request(app).post("/api/auth/login").send({ role: "admin", username: user.username, password: "Password123!" })).status).toBe(423);
});

test("logout revokes copied session cookies on the server", async () => {
  const { agent, csrfToken, loginRes } = await createAdminSession(app);
  const cookie = loginRes.headers["set-cookie"].map(value => value.split(";")[0]).join("; ");
  expect((await withCsrf(agent.post("/api/auth/logout"), csrfToken)).status).toBe(200);
  expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(401);
});

test("reset secrets are never serialized, even when explicitly selected", async () => {
  const { user } = await createAdminSession(app);
  await prepareReset(user);
  const selected = await User.findById(user._id).select("+passwordResetTokenHash +passwordResetExpiresAt +passwordResetAttempts");
  const json = selected.toJSON();
  for (const key of ["passwordResetTokenHash", "passwordResetExpiresAt", "passwordResetAttempts"]) expect(json).not.toHaveProperty(key);
});

test("matching attacker-chosen CSRF cookies and headers are rejected", async () => {
  const response = await request(app).post("/api/auth/logout")
    .set("Cookie", "ams_csrf=attacker-chosen").set("x-csrf-token", "attacker-chosen");
  expect(response.status).toBe(403);
  expect(response.body.message).toMatch(/csrf/i);
});

test("untrusted origins are rejected even on public password-reset routes", async () => {
  const response = await request(app).post("/api/auth/request-password-reset")
    .set("Origin", "https://attacker.example").send({ email: "admin@example.com" });
  expect(response.status).toBe(403);
});

test("private API responses cannot be cached", async () => {
  expect((await request(app).get("/api/auth/me")).headers["cache-control"]).toBe("no-store");
});

test("nested query selectors and repeated filter values are rejected", async () => {
  const { agent } = await createAdminSession(app);
  for (const query of ["status[$ne]=inactive", "status=active&status=inactive"]) {
    expect((await agent.get(`/api/students?${query}`)).status).toBe(400);
  }
});

test("compressed backups cannot expand beyond the memory limit", async () => {
  const compressed = gzipSync(Buffer.alloc(MAX_EXPANDED_BACKUP_BYTES + 1, 32));
  await expect(decodeBackup(compressed)).rejects.toMatchObject({ status: 400 });
});

test("empty, reserved-name and malformed backups are rejected before restore", async () => {
  for (const collections of [{}, [], { constructor: [] }, { users: [null] }, { users: [[]] }]) {
    const compressed = await encodeBackup({ format: FORMAT, version: VERSION, collections });
    await expect(decodeBackup(compressed)).rejects.toMatchObject({ status: 400 });
  }
});
