import { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as authApi from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | authenticated | anonymous

  useEffect(() => {
    authApi
      .fetchMe()
      .then((u) => {
        setUser(u);
        setStatus("authenticated");
      })
      .catch(() => {
        setUser(null);
        setStatus("anonymous");
      });
  }, []);

  useEffect(() => {
    const expired = () => { setUser(null); setStatus('anonymous'); };
    window.addEventListener('ams:session-expired', expired);
    return () => window.removeEventListener('ams:session-expired', expired);
  }, []);

  const login = useCallback(async (username, password, role) => {
    const u = await authApi.login(username, password, role);
    setUser(u);
    setStatus("authenticated");
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const current = await authApi.fetchMe();
    setUser(current);
    return current;
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, logout, refreshUser, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
