import { useState } from "react";
import { ChevronDown, LogOut, Menu } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import ThemeSwitch from "./ThemeSwitch";

export default function Topbar({ title, onOpenMobileNav }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-ink-200 bg-paper-50 px-4 py-4 md:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          onClick={onOpenMobileNav}
          className="md:hidden shrink-0 text-ink-700 -ml-1 p-2"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>
        <h1 className="min-w-0 font-display text-xl leading-tight text-ink-950 [overflow-wrap:anywhere] md:text-2xl">{title}</h1>
      </div>

      <ThemeSwitch />
      <div className="relative min-w-0 shrink-0 sm:max-w-[40%]">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Account menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? "account-menu" : undefined}
          onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }}
          className="relative z-20 flex min-h-10 w-full min-w-0 items-center gap-2 rounded-md border border-ink-200 bg-surface px-3 py-1.5 text-sm text-ink-800 hover:border-ink-300"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-action-900 text-xs font-medium text-white">
            {(user?.displayName || user?.username || "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden min-w-0 truncate sm:block" title={user?.displayName || user?.username}>{user?.displayName || user?.username}</span>
          <span className="hidden shrink-0 text-xs uppercase text-ink-500 tracking-wide sm:inline">
            {user?.role === "subadmin" ? "Sub-admin" : user?.role}
          </span>
          <ChevronDown size={14} className="shrink-0" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div id="account-menu" onKeyDown={(event) => { if (event.key === "Escape") setMenuOpen(false); }} className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-ink-200 bg-surface py-1 shadow-lg shadow-ink-950/5">
              <div className="px-3 py-2 border-b border-ink-100">
                <div className="text-sm leading-relaxed text-ink-900 [overflow-wrap:anywhere]">{user?.email || user?.phone}</div>
              </div>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-brick-600 hover:bg-brick-100/60"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
