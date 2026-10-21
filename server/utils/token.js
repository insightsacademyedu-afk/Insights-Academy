import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

export function signToken(user, sessionId) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      tokenVersion: user.tokenVersion,
      sid: sessionId,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
}

export function getCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProd, // requires HTTPS in production
    sameSite: config.isProd ? "strict" : "lax",
    path: "/",
  };
}
