import { useEffect, useState } from "react";
import AppLayout from "../components/AppLayout";
import AttendanceScanner from "../components/AttendanceScanner";
import Panel from "../components/Panel";
import Button from "../components/Button";
import StudentSelector from "../components/StudentSelector";
import DataTable from "../components/DataTable";
import Pagination from "../components/Pagination";
import { Field, TextInput, Select } from "../components/FormFields";
import { useAuth } from "../context/AuthContext";
import { attendanceApi } from "../api/attendance";
import { classesApi } from "../api/academicSetup";
import { attendanceTime, todayInKarachi } from "../lib/attendance";

const columns = [
  { key: "student", header: "Student", render: row => <><div>{row.student?.fullName || "Archived student"}</div><div className="text-xs text-ink-500">{row.student?.admissionNumber}</div></> },
  { key: "day", header: "Date (PKT)" },
  { key: "className", header: "Class at check-in", render: row => <><div>{row.className} / {row.sectionName}</div><div className="text-xs text-ink-500">{row.sessionName}</div></> },
  { key: "status", header: "Status", render: () => <span className="text-moss-600">Present</span> },
  { key: "checkedInAt", header: "Check-in (PKT)", render: row => attendanceTime(row.checkedInAt) },
  { key: "recordedBy", header: "Recorded by", render: row => row.recordedBy?.displayName || row.recordedBy?.username || "—" },
];

export default function Attendance() {
  const { user } = useAuth();
  const manager = ["admin", "subadmin"].includes(user?.role);
  const [tab, setTab] = useState("records");
  const [student, setStudent] = useState(null);
  const [from, setFrom] = useState(todayInKarachi);
  const [to, setTo] = useState(todayInKarachi);
  const [klass, setKlass] = useState("");
  const [classes, setClasses] = useState([]);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [records, setRecords] = useState({ items: [], total: 0, totalPages: 1 });
  const queryKey = JSON.stringify([page, from, to, student?._id, klass, reload]);
  const loading = records.queryKey !== queryKey;
  const error = loading ? "" : records.error;
  useEffect(() => {
    if (!manager) return;
    let active = true;
    classesApi.list({ limit: 100, status: "active" }).then(result => { if (active) setClasses(result.items); }).catch(() => {});
    return () => { active = false; };
  }, [manager]);
  useEffect(() => {
    const handle = setInterval(() => { if (document.visibilityState === "visible") setReload(value => value + 1); }, 30000);
    return () => clearInterval(handle);
  }, []);
  useEffect(() => {
    let active = true;
    attendanceApi.list({ page, limit: 20, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(student ? { student: student._id } : {}), ...(klass ? { class: klass } : {}) })
      .then(result => { if (active) setRecords({ ...result, queryKey, error: "" }); })
      .catch(err => { if (active) setRecords({ items: [], total: 0, totalPages: 1, queryKey, error: err.message }); });
    return () => { active = false; };
  }, [page, from, to, student, klass, reload, queryKey]);
  return <AppLayout title="Attendance">
    <p className="mb-5 text-sm text-ink-600">One check-in per student per day, using Pakistan time. {manager ? "View academy attendance and student history." : "View attendance for your assigned students. Only admin and subadmin can mark attendance."}</p>
    <div className="mb-5 flex flex-wrap gap-2"><Button variant={tab === "records" ? "primary" : "ghost"} aria-pressed={tab === "records"} onClick={() => setTab("records")}>Attendance records</Button>{manager && <Button variant={tab === "scan" ? "primary" : "ghost"} aria-pressed={tab === "scan"} onClick={() => setTab("scan")}>Scan student card</Button>}</div>
    {manager && tab === "scan" && <Panel title="QR check-in"><AttendanceScanner onSaved={() => setReload(value => value + 1)} /></Panel>}
    {tab === "records" && <Panel title="Daily attendance & history" action={<Button variant="ghost" disabled={loading} onClick={() => setReload(value => value + 1)}>Refresh</Button>}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="mb-4"><StudentSelector value={student} onChange={value => { setStudent(value); setPage(1); }} /></div>
        <Field label="From"><TextInput type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></Field>
        <Field label="To"><TextInput type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} /></Field>
        {manager && <Field label="Class"><Select value={klass} onChange={event => { setKlass(event.target.value); setPage(1); }}><option value="">All classes</option>{classes.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</Select></Field>}
        <div className="mb-4"><Button variant="ghost" onClick={() => { setFrom(""); setTo(""); setPage(1); }}>All dates</Button></div>
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-brick-600">{error}</p>}
      <DataTable columns={columns} rows={loading ? [] : records.items} loading={loading} emptyMessage="No check-ins found for these filters. Unmarked students are not automatically counted as absent." />
      {!loading && <Pagination page={page} total={records.total} totalPages={records.totalPages} onChange={setPage} />}
      <p className="mt-3 text-xs text-ink-500">Refreshes every 30 seconds while this page is visible. Class at check-in is preserved after transfers.</p>
    </Panel>}
  </AppLayout>;
}
