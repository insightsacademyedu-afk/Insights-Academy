import request from "supertest";
import app from "../app.js";
import User from "../models/User.js";
import { createAdminSession, createTeacherSession } from "./helpers/authHelpers.js";

test.each(["admin", "staff", "parent"])("%s accounts can only sign in with their matching option", async selectedRole => {
  let user;
  if (selectedRole === "admin") ({ user } = await createAdminSession(app));
  else if (selectedRole === "staff") ({ user } = await createTeacherSession(app));
  else user = await User.create({
    username: "parent-role-test", email: "parent-role@example.com", displayName: "Role Test Parent",
    role: "guardian", passwordHash: await User.hashPassword("Password123!"), status: "active",
  });

  for (const role of ["admin", "staff", "parent"]) {
    const agent = request.agent(app);
    const response = await agent.post("/api/auth/login").send({ username: user.email, password: "Password123!", role });
    if (role === selectedRole) {
      expect(response.status).toBe(200);
      expect(response.body.user.role).toBe(selectedRole === "parent" ? "guardian" : selectedRole);
      expect((await agent.get("/api/auth/me")).status).toBe(200);
    } else {
      expect(response.status).toBe(401);
      expect(response.body.user).toBeUndefined();
      expect((await agent.get("/api/auth/me")).status).toBe(401);
    }
  }
});

test.each([undefined, null, "guardian", "owner", "", {}, ["admin"]])("missing or invalid login role %j is rejected", async role => {
  const { user } = await createAdminSession(app);
  const response = await request(app).post("/api/auth/login").send({ username: user.email, password: "Password123!", role });
  expect(response.status).toBe(400);
});
