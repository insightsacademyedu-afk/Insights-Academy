import { useEffect, useState } from "react";
import { Pencil, RefreshCw, ShieldOff } from "lucide-react";
import AppLayout from "../components/AppLayout";
import DataTable from "../components/DataTable";
import Pagination from "../components/Pagination";
import ListToolbar from "../components/ListToolbar";
import Modal from "../components/Modal";
import Button from "../components/Button";
import { Field, TextInput, PasswordInput, Select } from "../components/FormFields";
import { guardiansApi } from "../api/guardians";
import { studentsApi } from "../api/students";
import { useResourceList } from "../lib/useResourceList";
import { useToast } from "../context/ToastContext";

export default function Guardians() {
  const list = useResourceList(guardiansApi);
  const toast = useToast();
  const [editor, setEditor] = useState(null);
  const [reset, setReset] = useState(null);
  const [revoke, setRevoke] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revokeError, setRevokeError] = useState("");
  async function revokeAccess() {
    setBusy(true); setRevokeError("");
    try { await guardiansApi.revokeLogin(revoke._id); toast.success("Guardian access revoked"); setRevoke(null); list.refetch(); }
    catch (error) { setRevokeError(error.message); }
    finally { setBusy(false); }
  }
  const columns = [
    { key: "displayName", header: "Guardian" },
    { key: "email", header: "Login email", render: row => row.email || "Not set" },
    { key: "phone", header: "Login phone", render: row => row.phone || "Not set" },
    { key: "studentIds", header: "Children", render: row => row.studentIds.map(child => child.fullName).join(", ") || "No available children" },
    { key: "status", header: "Access" },
    { key: "actions", header: "", render: row => <div className="flex flex-wrap justify-end gap-2">
      <button type="button" aria-label={`Edit ${row.displayName}`} onClick={() => setEditor(row)}><Pencil size={16} /></button>
      <button type="button" aria-label={`Reset password for ${row.displayName}`} onClick={() => setReset(row)}><RefreshCw size={16} /></button>
      {row.status === "active" && <button type="button" aria-label={`Revoke access for ${row.displayName}`} onClick={() => { setRevoke(row); setRevokeError(""); }}><ShieldOff size={16} /></button>}
    </div> },
  ];
  return <AppLayout title="Parents & guardians">
    <p className="mb-5 max-w-3xl text-sm text-ink-600">Create a guardian login, set the initial password and explicitly select their children. Guardians can only view those children's reports and fees. They can change their own password; you can reset forgotten passwords here.</p>
    <ListToolbar search={list.search} onSearchChange={list.setSearch} searchPlaceholder="Search guardian name, email or phone…" status={list.status} onStatusChange={list.setStatus} onCreate={() => setEditor({})} createLabel="New guardian login" />
    {list.error && <p role="alert" className="mb-4 text-brick-600">{list.error.message}</p>}
    <DataTable columns={columns} rows={list.items} loading={list.loading} emptyMessage="No guardian accounts yet." />
    <Pagination page={list.page} totalPages={list.totalPages} total={list.total} onChange={list.setPage} />
    {editor && <GuardianEditor account={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); list.refetch(); }} />}
    {reset && <ResetGuardianPassword account={reset} onClose={() => setReset(null)} />}
    <Modal open={!!revoke} onClose={() => setRevoke(null)} title="Revoke guardian access">
      <p className="text-sm">Revoke access for {revoke?.displayName}? Their active sessions will stop working. Student and financial records are kept.</p>
      {revokeError && <p role="alert" className="mt-3 text-brick-600">{revokeError}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => setRevoke(null)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={revokeAccess}>{busy ? "Revoking…" : "Revoke access"}</Button></div>
    </Modal>
  </AppLayout>;
}

function GuardianEditor({ account, onClose, onSaved }) {
  const editing = !!account._id;
  const [form, setForm] = useState({ displayName: account.displayName || "", email: account.email || "", phone: account.phone || "", status: account.status || "active", password: "" });
  const [selected, setSelected] = useState(account.studentIds || []);
  const [search, setSearch] = useState("");
  const [choices, setChoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lookupError, setLookupError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      studentsApi.list({ page: 1, limit: 50, search }).then(result => { if (active) setChoices(result.items); })
        .catch(err => { if (active) setLookupError(err.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);
  function toggleChild(child) {
    if (selected.some(item => item._id === child._id)) setSelected(selected.filter(item => item._id !== child._id));
    else {
      setSelected([...selected, child]);
      if (!editing && !selected.length) setForm(value => ({ ...value,
        displayName: value.displayName || child.guardian?.fullName || "",
        email: value.email || child.guardian?.email || "",
        phone: value.phone || child.guardian?.primaryPhone || "",
      }));
    }
  }
  async function submit(event) {
    event.preventDefault(); setError("");
    if (!form.email.trim() && !form.phone.trim()) { setError("Enter a login email address or phone number."); return; }
    if (!selected.length) { setError("Select at least one child."); return; }
    setSaving(true);
    try {
      const { password, ...details } = form;
      const body = { ...details, studentIds: selected.map(child => child._id), ...(!editing ? { password } : {}) };
      if (editing) await guardiansApi.update(account._id, body);
      else await guardiansApi.create(body);
      toast.success(editing ? "Guardian account updated. Previous sessions have been signed out." : "Guardian login created. Share the login details and initial password privately.");
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  return <Modal open onClose={onClose} title={editing ? "Edit guardian access" : "New guardian login"} width="max-w-xl">
    <form onSubmit={submit}>
      {error && <p role="alert" className="mb-4 text-brick-600">{error}</p>}
      <Field label="Guardian name" required><TextInput required maxLength={120} value={form.displayName} onChange={event => setForm({ ...form, displayName: event.target.value })} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Login email"><TextInput type="email" maxLength={254} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Field>
        <Field label="Login phone"><TextInput type="tel" maxLength={64} value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></Field>
      </div>
      <p className="mb-4 text-xs text-ink-500">At least one login email or phone is required. Contact details alone never link a child automatically.</p>
      {!editing && <Field label="Initial password" required><PasswordInput required minLength={8} maxLength={72} autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></Field>}
      {editing && <Field label="Access status"><Select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>}
      <fieldset className="mb-5 rounded-md border border-ink-200 p-3">
        <legend className="px-1 text-sm font-medium">Children this guardian may view</legend>
        <div className="mb-3 flex flex-wrap gap-2">{selected.map(child => <button key={child._id} type="button" disabled={saving} onClick={() => toggleChild(child)} className="rounded bg-ink-100 px-2 py-1 text-xs" aria-label={`Remove ${child.fullName}`}>{child.fullName} ×</button>)}</div>
        <TextInput aria-label="Search children" placeholder="Search by student name or admission number" value={search} onChange={event => { setSearch(event.target.value); setLoading(true); setLookupError(""); }} />
        {loading && <p role="status" className="mt-2 text-sm">Loading children…</p>}
        {lookupError && <p role="alert" className="mt-2 text-brick-600">{lookupError}</p>}
        {!loading && !lookupError && <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
          {!choices.length && <p className="text-sm text-ink-500">No matching children. Create the student first.</p>}
          {choices.map(child => <label key={child._id} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={saving} checked={selected.some(item => item._id === child._id)} onChange={() => toggleChild(child)} />{child.fullName} · {child.admissionNumber}</label>)}
        </div>}
        <p className="mt-3 text-xs text-ink-500">Search to find additional children. Select each sibling explicitly.</p>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving}>{saving ? "Saving…" : editing ? "Save guardian access" : "Create guardian login"}</Button></div>
    </form>
  </Modal>;
}

function ResetGuardianPassword({ account, onClose }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  async function submit(event) {
    event.preventDefault(); setError("");
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    setSaving(true);
    try { await guardiansApi.resetPassword(account._id, password); toast.success("Guardian password reset. Share the new password privately."); onClose(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  return <Modal open onClose={onClose} title={`Reset password · ${account.displayName}`}>
    <p className="mb-4 text-sm text-ink-600">All existing sessions will be signed out. The guardian can change this password from My account.</p>
    <form onSubmit={submit}>
      {error && <p role="alert" className="mb-3 text-brick-600">{error}</p>}
      <Field label="New guardian password" required><PasswordInput required minLength={8} maxLength={72} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></Field>
      <Field label="Confirm guardian password" required><PasswordInput required minLength={8} maxLength={72} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></Field>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving}>{saving ? "Resetting…" : "Reset guardian password"}</Button></div>
    </form>
  </Modal>;
}
