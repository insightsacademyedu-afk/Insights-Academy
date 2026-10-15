import { useCallback } from "react";

// Page layouts remount on navigation. Keep menu positions for this app session.
const positions = new Map();

export function useMenuScroll(menu, user) {
  const key = `${user?._id || user?.id || user?.username || "anonymous"}:${user?.role || ""}:${menu}`;
  const ref = useCallback((element) => {
    if (element) element.scrollTop = positions.get(key) || 0;
  }, [key]);
  const onScroll = useCallback((event) => {
    positions.set(key, event.currentTarget.scrollTop);
  }, [key]);

  return { ref, onScroll };
}
