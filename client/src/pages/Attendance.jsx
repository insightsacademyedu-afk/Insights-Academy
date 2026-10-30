import { useEffect, useState } from "react";
import AppLayout from "../components/AppLayout";
import AttendanceScanner from "../components/AttendanceScanner";
import ManualStudentAttendance from "../components/ManualStudentAttendance";
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
  { key: "className", header: "Class / section", render: row => <><div>{row.className} / {row.sectionName}</div><div className="text-xs text-ink-500">{row.sessionName}</div></> },
  { key: "status", header: "Status", render: row => <span className={row.status === "absent" ? "text-brick-600" : "text-moss-600"}>{row.status === "absent" ? "Absent" : "Present"}</span> },
  { key: "checkedInAt", header: "Check-in (PKT)", render: row => attendanceTime(row.checkedInAt) },
  { key: "method", header: "Method", render: row => row.status === "absent" ? "—" : row.method === "manual" ? "Manual" : "QR scan" },
  { key: "recordedBy", header: "Recorded by", render: row => row.recordedBy?.displayName || row.recordedBy?.username || "—" },
];

export default function Attendance() {
  const { user } = useAuth();
  const manager = ["admin", "subadmin"].includes(user?.role);
  const [tab, setTab] = useState("records");
  const [student, setStudent] = useState(null);
  const [from, setFrom] = useState(todayInKarachi);
  const [to, setTo] = useState(todayInKarachi);
  const [status, setStatus] = useState("present");
  const [absentDay, setAbsentDay] = useState(todayInKarachi);
  const [klass, setKlass] = useState("");
  const [classes, setClasses] = useState([]);
  const [classError, setClassError] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [records, setRecords] = useState({ items: [], total: 0, totalPages: 1 });
  const queryKey = JSON.stringify([page, from, to, status, absentDay, student?._id, klass, reload]);
  const loading = records.queryKey !== queryKey;
  const error = loading ? "" : records.error;
  useEffect(() => {
    if (!manager) return;
    let active = true;
    async function loadClasses() {
      const items = [];
      let page = 1, totalPages = 1;
      do {
        const result = await classesApi.list({ page, limit: 100, status: "active" });
        items.push(...result.items); totalPages = result.totalPages || 1; page++;
      } while (active && page <= totalPages);
      if (active) setClasses(items);
    }
    loadClasses().catch(err => { if (active) setClassError(err.message); });
    return () => { active = false; };
  }, [manager]);
  useEffect(() => {
    const handle = setInterval(() => { if (document.visibilityState === "visible") setReload(value => value + 1); }, 30000);
    return () => clearInterval(handle);
  }, []);
  useEffect(() => {
    let active = true;
    attendanceApi.list({ page, limit: 20, ...(status === "absent" ? { status, day: absentDay } : { ...(from ? { from } : {}), ...(to ? { to } : {}) }), ...(student ? { student: student._id } : {}), ...(klass ? { class: klass } : {}) })
      .then(result => { if (active) setRecords({ ...result, queryKey, error: "" }); })
      .catch(err => { if (active) setRecords({ items: [], total: 0, totalPages: 1, queryKey, error: err.message }); });
    return () => { active = false; };
  }, [page, from, to, status, absentDay, student, klass, reload, queryKey]);
  return <AppLayout title="Attendance">
    <p className="mb-5 text-sm text-ink-600">One check-in per student per day, using Pakistan time. {manager ? "View academy attendance and student history." : "View attendance for your assigned students. Only admin and subadmin can mark attendance."}</p>
    <div className="mb-5 flex flex-wrap gap-2"><Button variant={tab === "records" ? "primary" : "ghost"} aria-pressed={tab === "records"} onClick={() => setTab("records")}>Attendance records</Button>{manager && <><Button variant={tab === "scan" ? "primary" : "ghost"} aria-pressed={tab === "scan"} onClick={() => setTab("scan")}>Scan student card</Button><Button variant={tab === "manual" ? "primary" : "ghost"} aria-pressed={tab === "manual"} onClick={() => setTab("manual")}>Mark class attendance</Button></>}</div>
    {classError && <p role="alert" className="mb-4 text-sm text-brick-600">Could not load classes: {classError}</p>}
    {manager && tab === "scan" && <Panel title="QR check-in"><AttendanceScanner onSaved={() => setReload(value => value + 1)} /></Panel>}
    {manager && tab === "manual" && <Panel title="Manual class attendance"><ManualStudentAttendance classes={classes} initialClass={klass} onSaved={() => setReload(value => value + 1)} /></Panel>}
    {tab === "records" && <Panel title="Daily attendance & history" action={<Button variant="ghost" disabled={loading} onClick={() => setReload(value => value + 1)}>Refresh</Button>}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="mb-4"><StudentSelector value={student} onChange={value => { setStudent(value); setPage(1); }} /></div>
        <Field label="Attendance status"><Select value={status} onChange={event => { setStatus(event.target.value); setPage(1); if (event.target.value === "absent") setAbsentDay(from && from === to && from <= todayInKarachi() ? from : todayInKarachi()); }}><option value="present">Present</option><option value="absent">Absent</option></Select></Field>
        {status === "absent" ? <Field label="Attendance date"><TextInput required type="date" max={todayInKarachi()} value={absentDay} onChange={event => { setAbsentDay(event.target.value || todayInKarachi()); setPage(1); }} /></Field> : <><Field label="From"><TextInput type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></Field>
        <Field label="To"><TextInput type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} /></Field></>}
        {manager && <Field label="Class"><Select value={klass} onChange={event => { setKlass(event.target.value); setPage(1); }}><option value="">All classes</option>{classes.map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</Select></Field>}
        {status !== "absent" && <div className="mb-4"><Button variant="ghost" onClick={() => { setFrom(""); setTo(""); setPage(1); }}>All dates</Button></div>}
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-brick-600">{error}</p>}
      {status === "absent" && <p className="mb-4 text-sm text-ink-600">Absent means no check-in on the selected date among active, enrolled students. Today's list updates as students arrive; holidays and leave are not excluded automatically.</p>}
      <DataTable columns={columns} rows={loading ? [] : records.items} loading={loading} emptyMessage={status === "absent" ? "No absent students found for this date and these filters." : "No check-ins found for these filters."} />
      {!loading && <Pagination page={page} total={records.total} totalPages={records.totalPages} onChange={setPage} />}
      <p className="mt-3 text-xs text-ink-500">Refreshes every 30 seconds while this page is visible. Class at check-in is preserved after transfers.</p>
    </Panel>}
  </AppLayout>;
}
