import { useSyncExternalStore } from "react";

const storageKey = "academy-theme";
const getTheme = () => document.documentElement.dataset.theme === "dark" ? "dark" : "light";

function subscribe(listener) {
  function onStorage(event) {
    if (event.key !== storageKey && event.key !== null) return;
    document.documentElement.dataset.theme = event.newValue === "dark" ? "dark" : "light";
    listener();
  }
  window.addEventListener("academy:theme-change", listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("academy:theme-change", listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light");
  function toggleTheme() {
    const next = getTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(storageKey, next); } catch { /* Still works when storage is unavailable. */ }
    window.dispatchEvent(new Event("academy:theme-change"));
  }
  return { theme, toggleTheme };
}
