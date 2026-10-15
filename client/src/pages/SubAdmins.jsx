import { useState } from "react";
import AppLayout from "../components/AppLayout";
import Button from "../components/Button";
import Modal from "../components/Modal";
import DataTable from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";
import { Field, PasswordInput, Select, TextInput } from "../components/FormFields";
import { subAdminsApi } from "../api/subAdmins";
import { useFetch } from "../lib/useFetch";
import { useToast } from "../context/ToastContext";

export default function SubAdmins() {
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(null);
  const { data, loading, error } = useFetch(() => subAdminsApi.list(), [revision]);
  return <AppLayout title="Sub-admins">
    <p className="mb-4 max-w-3xl text-sm text-ink-600">Sub-admins have separate logins for student registration, tests and reports. They can view one student's invoices and fee reports at a time. They cannot record payments or access academy-wide financial totals, salaries, expenses or settings.</p>
    <div className="mb-4 flex justify-end"><Button onClick={() => setEditing({})}>New sub-admin</Button></div>
    {error && <p role="alert" className="mb-4 text-sm text-brick-600">{error.message}</p>}
    <DataTable rows={data?.items || []} loading={loading} emptyMessage="No sub-admin accounts yet." columns={[
      { key: "displayName", header: "Name" }, { key: "username", header: "Username" }, { key: "email", header: "Email" },
      { key: "status", header: "Status", render: row => <StatusBadge status={row.status} /> },
      { key: "actions", header: "", render: row => <Button variant="ghost" onClick={() => setEditing(row)}>Manage account</Button> },
    ]} />
    {editing && <AccountForm key={editing._id || "new"} account={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setRevision(value => value + 1); }} />}
  </AppLayout>;
}

function AccountForm({ account, onClose, onSaved }) {
  const [form, setForm] = useState({ displayName: account.displayName || "", username: account.username || "", email: account.email || "", status: account.status || "active", password: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const update = key => event => setForm(value => ({ ...value, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      if (account._id) await subAdminsApi.update(account._id, form);
      else await subAdminsApi.create(form);
      toast.success(account._id ? "Sub-admin updated. Existing sessions have been signed out." : "Sub-admin login created.");
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  return <Modal open onClose={onClose} title={account._id ? "Manage sub-admin" : "New sub-admin"}>
    <form onSubmit={submit}>
      {error && <p role="alert" className="mb-4 text-sm text-brick-600">{error}</p>}
      <Field label="Name" required><TextInput required maxLength={120} value={form.displayName} onChange={update("displayName")} disabled={saving} /></Field>
      <Field label="Username" required><TextInput required minLength={3} maxLength={40} pattern="[a-zA-Z0-9._-]{3,40}" autoComplete="off" value={form.username} onChange={update("username")} disabled={saving} /></Field>
      <Field label="Email" required><TextInput required type="email" maxLength={254} value={form.email} onChange={update("email")} disabled={saving} /></Field>
      <Field label={account._id ? "New password (leave blank to keep current)" : "Password"} required={!account._id}><PasswordInput required={!account._id} minLength={8} maxLength={72} autoComplete="new-password" value={form.password} onChange={update("password")} disabled={saving} /></Field>
      <Field label="Status"><Select value={form.status} onChange={update("status")} disabled={saving}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
      <p className="mb-4 text-xs text-ink-500">Sign in using the Sub-admin option on the login page. Deactivation or saving account changes signs out existing sessions.</p>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button><Button disabled={saving}>{saving ? "Saving…" : "Save sub-admin"}</Button></div>
    </form>
  </Modal>;
}
