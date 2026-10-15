import { useAuth } from "../context/AuthContext";
import DashboardAdmin from "./DashboardAdmin";
import DashboardTeacher from "./DashboardTeacher";
import GuardianPortal from "./GuardianPortal";
import DashboardSubAdmin from "./DashboardSubAdmin";

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === "guardian") return <GuardianPortal />;
  if (user?.role === "subadmin") return <DashboardSubAdmin />;
  return user?.role === "admin" ? <DashboardAdmin /> : <DashboardTeacher />;
}
