import { useCallback, useEffect, useState } from "react";
import AppLayout from "../components/AppLayout";
import Panel from "../components/Panel";
import Button from "../components/Button";
import Pagination from "../components/Pagination";
import { Field, TextInput, TextArea, Select } from "../components/FormFields";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { notificationsApi } from "../api/notifications";

function useNotificationFetch(fetcher, revision = 0) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    fetcher().then(data => { if (active) setState({ fetcher, revision, data, loading: false, error: null }); })
      .catch(error => { if (active) setState({ fetcher, revision, data: null, loading: false, error }); });
    return () => { active = false; };
  }, [fetcher, revision]);
  return state?.fetcher === fetcher && state.revision === revision ? state : { data: null, loading: true, error: null };
}

export default function Notifications() {
  const { user } = useAuth();
  const guardian = user.role === "guardian";
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [readError, setReadError] = useState("");
  const [reading, setReading] = useState("");
  const [queueError, setQueueError] = useState("");
  const [processing, setProcessing] = useState(false);
  const fetchHistory = useCallback(() => notificationsApi.list(guardian, page), [guardian, page]);
  const { data, loading, error } = useNotificationFetch(fetchHistory, revision);
  useEffect(() => {
    if (guardian || !data?.hasQueuedEmails) return;
    let active = true;
    const timer = setTimeout(() => {
      notificationsApi.processQueue().then(() => {
        if (active) { setQueueError(""); setRevision(value => value + 1); }
      }).catch(err => { if (active) setQueueError(err.message); });
    }, 10000);
    return () => { active = false; clearTimeout(timer); };
  }, [guardian, data]);
  async function processQueue() {
    setProcessing(true); setQueueError("");
    try { await notificationsApi.processQueue(); setRevision(value => value + 1); }
    catch (err) { setQueueError(err.message); }
    finally { setProcessing(false); }
  }
  async function markRead(id) {
    setReadError(""); setReading(id);
    try { await notificationsApi.markRead(id); setRevision(value => value + 1); }
    catch (err) { setReadError(err.message); }
    finally { setReading(""); }
  }
  return <AppLayout title="Notifications">
    <p className="mb-5 text-sm text-ink-600">{guardian ? "Messages from your academy. Use Refresh to check for new notifications." : "Send messages to individual guardians, a student's guardians, or all registered guardian accounts. Messages appear in the guardian portal and are emailed to accounts with a registered email address."}</p>
    {!guardian && <Composer onSent={() => { setPage(1); setRevision(value => value + 1); }} />}
    <div className="mb-4 mt-6 flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-display text-lg">{guardian ? `Your inbox${data ? ` (${data.unreadCount} unread)` : ""}` : "Sent notifications"}</h2>
      <Button variant="ghost" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh</Button>
    </div>
    {(error || readError) && <p role="alert" className="mb-4 text-brick-600">{error?.message || readError}</p>}
    {queueError && <p role="alert" className="mb-4 text-brick-600">Could not process queued emails: {queueError}</p>}
    {!guardian && data?.hasQueuedEmails && <div className="mb-4 flex flex-wrap items-center gap-3">
      <p className="text-sm text-ink-600">Emails are queued. Keep this page open to continue sending on free hosting.</p>
      <Button variant="ghost" disabled={processing} onClick={processQueue}>{processing ? "Processing..." : "Process queued emails"}</Button>
    </div>}
    {loading ? <p role="status">Loading notifications...</p> : <div className="space-y-4">
      {!error && !data?.items.length && <Panel><p className="text-sm text-ink-500">{guardian ? "No notifications yet." : "No notifications sent yet."}</p></Panel>}
      {data?.items.map(item => <Panel key={item._id} title={item.title}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
          <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
          <span>{guardian ? (item.read ? "Read" : "Unread") : `${item.recipientCount} guardian account${item.recipientCount === 1 ? "" : "s"} · ${item.audience === "all" ? "All registered guardians" : "Selected recipients"}`}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm text-ink-800 [overflow-wrap:anywhere]">{item.message}</p>
        {!guardian && item.email && <p className="mt-3 text-xs text-ink-500">Email: {item.email.sent} accepted by provider · {item.email.pending} queued · {item.email.failed} failed · {item.email.skipped} without email.{item.emailUnavailable ? " Email service was not configured when this was sent. Configure Resend or SMTP before sending future emails." : ""}</p>}
        {!guardian && item.email?.failures?.map(reason => <p key={reason} className="mt-2 text-sm text-brick-600">{reason}</p>)}
        {!guardian && item.email?.sent > 0 && <p className="mt-2 text-xs text-ink-500">Provider acceptance does not confirm inbox delivery. If the message is missing, check spam and the provider's delivery or bounce log.</p>}
        {guardian && !item.read && <Button className="mt-4" variant="ghost" disabled={!!reading} onClick={() => markRead(item._id)}>{reading === item._id ? "Saving..." : "Mark as read"}</Button>}
      </Panel>)}
    </div>}
    {data && <Pagination page={page} totalPages={data.totalPages} total={data.total} onChange={setPage} />}
  </AppLayout>;
}

function Composer({ onSent }) {
  const toast = useToast();
  const [audience, setAudience] = useState("selected");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState([]);
  const [kind, setKind] = useState("guardians");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const fetchRecipients = useCallback(() => notificationsApi.recipients({ kind, search, page, limit: 10 }), [kind, search, page]);
  const { data, loading, error: recipientError } = useNotificationFetch(fetchRecipients);
  function toggle(item) {
    const key = `${kind}:${item._id}`;
    setSelected(value => value.some(row => row.key === key) ? value.filter(row => row.key !== key) : [...value, { key, kind, id: item._id, name: item.fullName || item.displayName || item.username }]);
  }
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const result = await notificationsApi.send({ title, message, audience,
        guardianIds: audience === "selected" ? selected.filter(row => row.kind === "guardians").map(row => row.id) : [],
        studentIds: audience === "selected" ? selected.filter(row => row.kind === "students").map(row => row.id) : [],
      });
      toast.success(`Notification sent to ${result.recipientCount} guardian account${result.recipientCount === 1 ? "" : "s"}.`);
      setResult(result);
      setTitle(""); setMessage(""); setSelected([]); onSent();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  return <Panel title="Send notification"><form onSubmit={submit}>
    <fieldset disabled={saving} className="min-w-0">
      {result && <p role="status" className="mb-4 text-sm text-ink-700">Delivered to {result.recipientCount} portal inbox(es). {result.emailSent || 0} email(s) accepted by provider; {result.emailQueued} email(s) queued; {result.emailFailed || 0} failed; {result.emailSkipped} account(s) without email.{result.emailUnavailable ? " Email service is not configured, so emails could not be sent. Configure Resend or SMTP on the server." : " Check sent history for results. Keep this page open while emails remain queued."}</p>}
      {error && <p role="alert" className="mb-4 text-brick-600">{error}</p>}
      <Field label="Send to"><Select value={audience} onChange={event => setAudience(event.target.value)}>
        <option value="selected">Selected guardians / students</option><option value="all">All registered guardians</option>
      </Select></Field>
      {audience === "all" ? <p className="mb-4 text-sm text-ink-600">This sends to every active guardian login registered at the time of sending. Each account receives one copy.</p> : <div className="mb-5 rounded-md border border-ink-200 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Find recipients by"><Select value={kind} onChange={event => { setKind(event.target.value); setPage(1); setSearch(""); }}><option value="guardians">Guardian account</option><option value="students">Student</option></Select></Field>
          <Field label="Search recipients"><TextInput value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={kind === "students" ? "Name or admission number" : "Name, phone or email"} /></Field>
        </div>
        {recipientError && <p role="alert" className="text-brick-600">{recipientError.message}</p>}
        {loading ? <p role="status">Loading recipients...</p> : <div className="max-h-64 space-y-2 overflow-y-auto">
          {!data?.items.length && <p className="text-sm text-ink-500">No matching recipients.</p>}
          {data?.items.map(item => <label key={item._id} className="flex items-start gap-3 rounded p-2 text-sm hover:bg-paper-100">
            <input type="checkbox" className="mt-1" disabled={kind === "students" && !item.guardianCount} checked={selected.some(row => row.key === `${kind}:${item._id}`)} onChange={() => toggle(item)} />
            <span>{item.fullName || item.displayName || item.username}<span className="block text-xs text-ink-500">{kind === "students" ? `${item.admissionNumber} · ${item.guardianCount} active guardian login(s)` : `${item.phone || ""} · ${item.email || "No email registered; portal only"}`}</span></span>
          </label>)}
        </div>}
        {data && <Pagination page={page} totalPages={data.totalPages} total={data.total} onChange={setPage} />}
        <p className="mt-3 text-xs text-ink-500">Students need an active linked parent login to receive messages through their guardians. A guardian linked to multiple selected students receives one copy.</p>
        <div className="mt-3 flex flex-wrap gap-2">{selected.map(row => <button type="button" key={row.key} className="rounded border border-ink-200 px-2 py-1 text-xs" aria-label={`Remove ${row.name}`} onClick={() => setSelected(value => value.filter(item => item.key !== row.key))}>{row.name} ×</button>)}</div>
      </div>}
      <Field label="Title" required><TextInput required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></Field>
      <Field label="Message" required><TextArea required rows={5} maxLength={5000} value={message} onChange={event => setMessage(event.target.value)} /></Field>
      <Button type="submit" disabled={saving || !title.trim() || !message.trim() || (audience === "selected" && !selected.length)}>{saving ? "Sending..." : audience === "all" ? "Send to all guardians" : "Send notification"}</Button>
    </fieldset>
  </form></Panel>;
}
