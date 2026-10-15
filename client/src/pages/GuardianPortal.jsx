import { useEffect, useState } from "react";
import AppLayout from "../components/AppLayout";
import Panel from "../components/Panel";
import DataTable from "../components/DataTable";
import Pagination from "../components/Pagination";
import { guardianPortalApi } from "../api/guardians";
import { formatCurrency, formatDate } from "../lib/format";

const recordColumns = {
  tests: [
    { key: "test", header: "Test", render: row => <><div>{row.test.title}</div><div className="text-xs text-ink-500">{row.test.subject?.name} · {row.test.academicSession?.name}</div></> },
    { key: "date", header: "Date", render: row => formatDate(row.test.testDate) },
    { key: "marks", header: "Marks", render: row => `${row.marksObtained} / ${row.test.maxMarks}` },
    { key: "grade", header: "Grade", render: row => `${row.summary.grade} (${row.summary.percentage}%)` },
    { key: "passed", header: "Result", render: row => row.summary.passed ? "Pass" : "Needs improvement" },
    { key: "remarks", header: "Remarks" },
  ],
  invoices: [
    { key: "period", header: "Period" },
    { key: "invoiceType", header: "Fee type" },
    { key: "totalAmount", header: "Total", render: row => formatCurrency(row.totalAmount) },
    { key: "amountPaid", header: "Paid", render: row => formatCurrency(row.amountPaid) },
    { key: "dueDate", header: "Due date", render: row => formatDate(row.dueDate) },
    { key: "status", header: "Status", render: row => row.status.replaceAll("_", " ") },
  ],
  payments: [
    { key: "receiptNumber", header: "Receipt" },
    { key: "paidAt", header: "Date", render: row => formatDate(row.paidAt) },
    { key: "amount", header: "Amount", render: row => formatCurrency(row.amount) },
    { key: "method", header: "Method", render: row => row.method.replaceAll("_", " ") },
  ],
};

export default function GuardianPortal() {
  const [children, setChildren] = useState([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    guardianPortalApi.children().then(({ items }) => {
      if (!active) return;
      setChildren(items); setSelected(items[0]?._id || "");
    }).catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <AppLayout title="Parent & guardian portal">
    <p className="mb-5 text-sm text-ink-600">View your linked children's finalized test reports, fee invoices and payment history. Manage your password under My account.</p>
    {loading && <p role="status">Loading your children…</p>}
    {error && <p role="alert" className="text-brick-600">{error}</p>}
    {!loading && !error && !children.length && <Panel><p>No children are currently linked to your account. Please contact the academy administrator.</p></Panel>}
    {!!children.length && <>
      <label className="mb-5 block max-w-md text-sm font-medium">Child
        <select className="mt-2 w-full rounded-md border border-ink-200 bg-surface p-2" value={selected} onChange={event => setSelected(event.target.value)}>
          {children.map(child => <option key={child._id} value={child._id}>{child.fullName} · {child.admissionNumber}</option>)}
        </select>
      </label>
      <ChildReport key={selected} id={selected} />
    </>}
  </AppLayout>;
}

function ChildReport({ id }) {
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState("");
  const [kind, setKind] = useState("tests");
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState({ items: [], total: 0, totalPages: 1 });
  const loading = records.kind !== kind || records.page !== page;
  const error = loading ? "" : records.error;
  useEffect(() => {
    let active = true;
    guardianPortalApi.overview(id).then(value => { if (active) setOverview(value); })
      .catch(err => { if (active) setOverviewError(err.message); });
    return () => { active = false; };
  }, [id]);
  useEffect(() => {
    let active = true;
    guardianPortalApi.records(id, kind, page).then(value => { if (active) setRecords({ ...value, kind, page, error: "" }); })
      .catch(err => { if (active) setRecords({ items: [], total: 0, totalPages: 1, kind, page, error: err.message }); });
    return () => { active = false; };
  }, [id, kind, page]);

  return <div className="space-y-5">
    {overviewError && <p role="alert" className="text-brick-600">{overviewError}</p>}
    {overview && <Panel title={overview.student.fullName}>
      <div className="flex flex-wrap justify-between gap-4 text-sm">
        <div><p>Admission: {overview.student.admissionNumber}</p><p className="mt-1 text-ink-600">{overview.placement ? `${overview.placement.class?.name || ""} / ${overview.placement.section?.name || ""} · ${overview.placement.academicSession?.name || ""} · Roll ${overview.placement.rollNumber}` : "No current class placement"}</p></div>
        <div><p className="text-ink-500">Outstanding fees</p><p className="mt-1 font-display text-xl">{formatCurrency(overview.outstanding)}</p></div>
      </div>
    </Panel>}
    <div className="flex flex-wrap gap-2" aria-label="Child records">
      {Object.entries({ tests: "Test reports", invoices: "Fee invoices", payments: "Payment history" }).map(([key, label]) =>
        <button type="button" key={key} aria-pressed={kind === key} className={`rounded-md border px-4 py-2 text-sm ${kind === key ? "bg-action-900 text-white" : "bg-surface text-ink-700"}`} onClick={() => { setKind(key); setPage(1); }}>{label}</button>)}
    </div>
    {kind === "tests" && <p className="text-sm text-ink-500">Only finalized test reports are published here.</p>}
    {error && <p role="alert" className="text-brick-600">{error}</p>}
    <DataTable columns={recordColumns[kind]} rows={records.kind === kind && records.page === page ? records.items : []} loading={loading || records.kind !== kind || records.page !== page} emptyMessage="No records available yet." />
    {!loading && records.kind === kind && records.page === page && <Pagination page={page} totalPages={records.totalPages} total={records.total} onChange={setPage} />}
  </div>;
}
