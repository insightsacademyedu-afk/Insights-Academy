import { Link } from "react-router-dom";
import { GraduationCap, ClipboardList, FileBarChart, Wallet } from "lucide-react";
import AppLayout from "../components/AppLayout";

export default function DashboardSubAdmin() {
  return <AppLayout title="Dashboard">
    <p className="mb-6 text-sm text-ink-600">Manage student registration and tests, or select a student to view their invoices and fee reports.</p>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { to: "/students", title: "Students", text: "Register students and manage enrollment", icon: GraduationCap },
        { to: "/tests", title: "Tests & results", text: "Create tests, enter marks and view results", icon: ClipboardList },
        { to: "/fees", title: "Student invoices", text: "View one student's invoices and payment history", icon: Wallet },
        { to: "/reports", title: "Reports", text: "Student, test and individual fee reports", icon: FileBarChart },
      ].map(({ to, title, text, icon: Icon }) => <Link key={to} to={to} className="depth-card rounded-lg border border-ink-200 bg-paper-50 p-5 hover:border-brass-500 focus-visible:outline-2 focus-visible:outline-brass-500">
        <Icon size={22} className="mb-4 text-brass-600" />
        <h2 className="mb-2 font-display text-lg text-ink-950">{title}</h2>
        <p className="text-sm text-ink-600">{text}</p>
      </Link>)}
    </div>
  </AppLayout>;
}
