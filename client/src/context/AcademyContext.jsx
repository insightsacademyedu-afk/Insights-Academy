import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { fetchSettings, updateSettings } from "../api/settings";
import { AcademyContext, DEFAULT_ACADEMY_SETTINGS } from "./academy";

export function AcademyProvider({ children }) {
  const { status, user } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_ACADEMY_SETTINGS);

  useEffect(() => {
    if (status !== "authenticated" || user?.role === "guardian") return;
    let active = true;
    fetchSettings().then((value) => { if (active) setSettings({ ...DEFAULT_ACADEMY_SETTINGS, ...value }); }).catch(() => {});
    return () => { active = false; };
  }, [status, user?.role]);

  const saveSettings = useCallback(async (values) => {
    const saved = await updateSettings(values);
    setSettings({ ...DEFAULT_ACADEMY_SETTINGS, ...saved });
    return saved;
  }, []);

  const visibleSettings = status === "authenticated" && user?.role !== "guardian" ? settings : DEFAULT_ACADEMY_SETTINGS;
  return <AcademyContext.Provider value={{ settings: visibleSettings, saveSettings }}>{children}</AcademyContext.Provider>;
}
