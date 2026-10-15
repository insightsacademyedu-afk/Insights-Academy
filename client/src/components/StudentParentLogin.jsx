import { useState } from "react";
import { studentsApi } from "../api/students";
import Button from "./Button";

export default function StudentParentLogin({ studentId, accounts = [], onUpdated }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function act(action, account) {
    if (action === "reset-password" && !window.confirm("Reset this parent's password to their phone number? They can change it anytime in My account. This affects their account for all their children.")) return;
    if (action === "disable" && !window.confirm("Disable this parent's login for all their children?")) return;
    setBusy(true); setMessage("");
    try {
      const result = await studentsApi.parentLogin(studentId, action, account?._id);
      await onUpdated();
      setMessage(result.message);
    } catch (error) { setMessage(error.message || "Parent login could not be updated."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-md border border-ink-200 bg-paper-100 p-4 space-y-3">
    <h3 className="font-semibold">Parent portal login</h3>
    <p className="text-sm text-ink-600">Parents see only their children's reports and fee history. One login works for all siblings.</p>
    {accounts.map(account => <div key={account._id} className="space-y-2 border-t border-ink-200 pt-3 text-sm">
      <p>{account.displayName} · {account.status === 'active' ? 'Login enabled' : 'Login disabled'}</p>
      <p>Sign in with: {account.displayName} or {account.phone}{account.email ? ` or ${account.email}` : ''}</p>
      <p>Default password: the primary phone number exactly as entered during registration. Parents can keep it or change it anytime in My account.</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !account.phone} variant="ghost" onClick={() => act('reset-password', account)}>Reset parent password</Button>
        {account.status === 'active' && <Button disabled={busy} variant="ghost" onClick={() => act('disable', account)}>Disable parent login</Button>}
        {account.status !== 'active' && <Button disabled={busy} onClick={() => act('enable', account)}>Enable parent login</Button>}
      </div>
    </div>)}
    {!accounts.length && <Button disabled={busy} onClick={() => act('enable')}>Enable parent login</Button>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
