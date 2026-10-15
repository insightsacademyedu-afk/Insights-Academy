import { useAuth } from "../context/AuthContext";
import DashboardAdmin from "./DashboardAdmin";
import DashboardTeacher from "./DashboardTeacher";
import GuardianPortal from "./GuardianPortal";

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === "guardian") return <GuardianPortal />;
  return user?.role === "admin" ? <DashboardAdmin /> : <DashboardTeacher />;
}
