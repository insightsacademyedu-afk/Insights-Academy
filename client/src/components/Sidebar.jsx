import { NavLink } from "react-router-dom";
import { Lock } from "lucide-react";
import { NAV_SECTIONS, CURRENT_PHASE, canAccessNav } from "../lib/nav";
import { useAuth } from "../context/AuthContext";
import { useAcademy } from "../context/academy";
import AcademyBrand from "./AcademyBrand";
import { useMenuScroll } from "../lib/useMenuScroll";

export default function Sidebar() {
  const { user } = useAuth();
  const { settings } = useAcademy();
  const menuScroll = useMenuScroll("sidebar", user);

  return (
    <aside className="theme-navigation hidden md:flex w-64 shrink-0 flex-col bg-ink-950 text-paper-100">
      <div className="flex items-center gap-3 px-6 py-6 border-b border-ink-800">
        <AcademyBrand dark compact />
      </div>

      <nav {...menuScroll} aria-label="Main navigation" className="min-h-0 flex-1 overflow-y-auto px-3 py-5 space-y-6">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((item) => canAccessNav(item, user?.role));
          if (!items.length) return null;
          return (
            <div key={section.label}>
              <div className="px-3 mb-2 text-[11px] font-medium text-ink-500 tracking-wide">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const enabled = item.phase <= CURRENT_PHASE;
                  const Icon = item.icon;
                  if (!enabled) {
                    return (
                      <div
                        key={item.to}
                        className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-ink-500"
                        title={`Coming in build phase ${item.phase}`}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon size={16} strokeWidth={1.75} />
                          {item.label}
                        </span>
                        <Lock size={12} strokeWidth={2} />
                      </div>
                    );
                  }
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? "bg-ink-800 text-paper-50"
                            : "text-ink-200 hover:bg-ink-900 hover:text-paper-50"
                        }`
                      }
                    >
                      <Icon size={16} strokeWidth={1.75} />
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="px-6 py-4 [overflow-wrap:anywhere] border-t border-ink-800 text-[11px] text-ink-500">
        {settings.academyPhone || settings.academyName}
      </div>
    </aside>
  );
}
