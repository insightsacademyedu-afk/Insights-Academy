import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { SUBADMIN_PATHS } from "../lib/nav";

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-paper-100">
        <div className="font-display text-ink-500 text-sm tracking-wide">Loading…</div>
      </div>
    );
  }

  if (status === "anonymous") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && user.role !== "admin" && !(user.role === "subadmin" && SUBADMIN_PATHS.includes(location.pathname))) {
    return <Navigate to="/" replace />;
  }

  if (location.pathname === "/notifications" && !["admin", "guardian"].includes(user.role)) return <Navigate to="/" replace />;

  if (user.role === "guardian" && !["/", "/account", "/notifications"].includes(location.pathname)) {
    return <Navigate to="/" replace />;
  }

  if (user.role === "subadmin" && !SUBADMIN_PATHS.includes(location.pathname)) return <Navigate to="/" replace />;

  return children;
}
