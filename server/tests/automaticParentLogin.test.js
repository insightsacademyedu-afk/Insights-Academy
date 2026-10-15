import request from "supertest";
import app from "../app.js";
import User from "../models/User.js";
import Student from "../models/Student.js";
import { createAdminSession, createTeacherSession, extractCookieValue, withCsrf } from "./helpers/authHelpers.js";
import { createAcademicChain, createEnrolledStudent } from "./helpers/fixtures.js";

async function setup() {
  const admin = await createAdminSession(app);
  const chain = await createAcademicChain();
  const payload = { fullName: "First Child", gender: "male", dob: "2015-05-01",
    guardian: { fullName: "Family Parent", primaryPhone: "0300-1234567", email: "family@example.com" },
    enrollment: { class: chain.klass._id, section: chain.section._id, academicSession: chain.session._id } };
  const enroll = body => withCsrf(admin.agent.post("/api/students").send(body), admin.csrfToken);
  return { admin, chain, payload, enroll };
}

test("enrollment allows the default phone password without a change and preserves voluntary passwords for siblings", async () => {
  const { admin, payload, enroll } = await setup();
  const first = await enroll(payload);
  expect(first.status).toBe(201);
  expect(first.body.parentPortal.created).toBe(true);
  expect(first.body.parentPortal.phone).toBe('0300-1234567');
  expect(JSON.stringify(first.body)).not.toContain('passwordHash');
  const parent = request.agent(app);
  const login = await parent.post('/api/auth/login').send({ role: "parent", username: 'family@example.com', password: '0300-1234567' });
  expect(login.status).toBe(200);
  expect(login.body.user.mustChangePassword).toBe(false);
  expect(login.body.user.phone).toBe('0300-1234567');
  for (const username of ['family parent', '0300-1234567']) {
    expect((await request(app).post('/api/auth/login').send({ role: "parent", username, password: '0300-1234567' })).status).toBe(200);
  }
  expect((await request(app).post('/api/auth/login').send({ role: "parent", username: 'Family Parent', password: '03001234567' })).status).toBe(401);
  expect((await parent.get('/api/auth/me')).status).toBe(200);
  expect((await parent.get('/api/guardian-portal/children')).status).toBe(200);
  // Accounts created under the previous mandatory-change policy also have immediate access.
  await User.updateOne({ _id: first.body.parentPortal.accountId }, { $set: { mustChangePassword: true } });
  expect((await parent.get('/api/guardian-portal/children')).status).toBe(200);
  const changed = await withCsrf(parent.post('/api/auth/change-password').send({ currentPassword: '0300-1234567',
    newPassword: 'NewFamilyPassword123!', confirmPassword: 'NewFamilyPassword123!' }), extractCookieValue(login, 'ams_csrf'));
  expect(changed.status).toBe(200);
  const account = await User.findById(first.body.parentPortal.accountId).select('+passwordHash');
  expect(account.mustChangePassword).toBe(false);
  const sibling = await enroll({ ...payload, fullName: 'Second Child', guardian: { ...payload.guardian, primaryPhone: '+92 300 1234567' } });
  expect(sibling.status).toBe(201);
  expect(sibling.body.parentPortal.created).toBe(false);
  expect(sibling.body.parentPortal.accountId).toBe(first.body.parentPortal.accountId);
  expect((await User.findById(account._id).select('+passwordHash')).passwordHash).toBe(account.passwordHash);
  const children = await parent.get('/api/guardian-portal/children');
  expect(children.status).toBe(200);
  expect(children.body.items).toHaveLength(2);
  const unrelated = await enroll({ ...payload, guardian: { fullName: 'Family Parent', primaryPhone: '03121234567' } });
  expect(unrelated.status).toBe(201);
  expect((await request(app).post('/api/auth/login').send({ role: "parent", username: 'Family Parent', password: '03121234567' })).status).toBe(401);
  const forbiddenReset = await withCsrf(admin.agent.post(`/api/students/${first.body.student._id}/parent-login/reset-password`)
    .send({ accountId: unrelated.body.parentPortal.accountId }), admin.csrfToken);
  expect(forbiddenReset.status).toBe(404);
  const teacher = await createTeacherSession(app);
  const teacherReset = await withCsrf(teacher.agent.post(`/api/students/${first.body.student._id}/parent-login/reset-password`)
    .send({ accountId: account._id }), teacher.csrfToken);
  expect(teacherReset.status).toBe(403);
  const reset = await withCsrf(admin.agent.post(`/api/students/${first.body.student._id}/parent-login/reset-password`)
    .send({ accountId: account._id }), admin.csrfToken);
  expect(reset.status).toBe(200);
  expect((await parent.get('/api/auth/me')).status).toBe(401);
  const relogin = await parent.post('/api/auth/login').send({ role: "parent", username: '0300-1234567', password: '0300-1234567' });
  expect(relogin.status).toBe(200);
  expect(relogin.body.user.mustChangePassword).toBe(false);
  expect((await parent.get('/api/guardian-portal/children')).status).toBe(200);
});

test("legacy default passwords accept the guardian phone exactly as recorded without overwriting chosen passwords", async () => {
  const { payload, enroll } = await setup();
  const created = await enroll(payload);
  const id = created.body.parentPortal.accountId;
  await User.updateOne({ _id: id }, { $unset: { phoneAsEntered: 1 }, $set: { passwordHash: await User.hashPassword('03001234567') } });
  const login = await request(app).post('/api/auth/login').send({ role: "parent", username: 'Family Parent', password: '0300-1234567' });
  expect(login.status).toBe(200);
  expect(login.body.user.phone).toBe('0300-1234567');
  await User.updateOne({ _id: id }, { $unset: { phoneAsEntered: 1 }, $set: { passwordHash: await User.hashPassword('ChosenPassword123!') } });
  expect((await request(app).post('/api/auth/login').send({ role: "parent", username: 'Family Parent', password: '0300-1234567' })).status).toBe(401);
  expect((await request(app).post('/api/auth/login').send({ role: "parent", username: 'Family Parent', password: 'ChosenPassword123!' })).status).toBe(200);
});

test("invalid parent contacts and conflicting identities roll back enrollment", async () => {
  const { payload, enroll } = await setup();
  expect((await enroll({ ...payload, guardian: { ...payload.guardian, primaryPhone: 'invalid' } })).status).toBe(400);
  expect(await Student.countDocuments()).toBe(0);
  expect(await User.countDocuments({ role: 'guardian' })).toBe(0);
  const shortPhone = await enroll({ ...payload, guardian: { ...payload.guardian, primaryPhone: '1234567' } });
  expect(shortPhone.status).toBe(400);
  expect(shortPhone.body.message).toContain('at least 8 characters');
  expect((await enroll(payload)).status).toBe(201);
  const conflict = await enroll({ ...payload, guardian: { ...payload.guardian, fullName: 'Different Parent' } });
  expect(conflict.status).toBe(409);
  expect(await Student.countDocuments()).toBe(1);
  expect(await User.countDocuments({ role: 'guardian' })).toBe(1);
});

test("older students can enable a parent login from their student record and contacts stay synchronized", async () => {
  const { admin, chain } = await setup();
  const { student } = await createEnrolledStudent(chain);
  const enabled = await withCsrf(admin.agent.post(`/api/students/${student._id}/parent-login/enable`).send({}), admin.csrfToken);
  expect(enabled.status).toBe(200);
  const detail = await admin.agent.get(`/api/students/${student._id}`);
  expect(detail.body.parentPortals).toHaveLength(1);
  const accountId = detail.body.parentPortals[0]._id;
  const updated = await withCsrf(admin.agent.put(`/api/students/${student._id}`).send({
    guardian: { primaryPhone: '03111234567', email: 'updated-parent@example.com' },
  }), admin.csrfToken);
  expect(updated.status).toBe(200);
  const account = await User.findById(accountId);
  expect(account.phone).toBe('923111234567');
  expect(account.email).toBe('updated-parent@example.com');
  expect(await account.constructor.findById(accountId).select('+passwordHash').then(user => user.comparePassword('03111234567'))).toBe(true);
  const reset = await withCsrf(admin.agent.post(`/api/students/${student._id}/parent-login/reset-password`).send({ accountId }), admin.csrfToken);
  expect(reset.status).toBe(200);
  const login = await request(app).post('/api/auth/login').send({ role: "parent", username: '03111234567', password: '03111234567' });
  expect(login.status).toBe(200);
  const disabled = await withCsrf(admin.agent.post(`/api/students/${student._id}/parent-login/disable`).send({ accountId }), admin.csrfToken);
  expect(disabled.status).toBe(200);
  expect((await request(app).post('/api/auth/login').send({ role: "parent", username: '03111234567', password: '03111234567' })).status).toBe(403);
});
