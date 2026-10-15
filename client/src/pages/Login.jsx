import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { requestPasswordReset, resetPassword } from "../api/auth";
import { Field, PasswordInput, TextInput } from "../components/FormFields";
import AcademyBrand from "../components/AcademyBrand";
import ThemeSwitch from "../components/ThemeSwitch";

export default function Login() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginRole, setLoginRole] = useState("admin");
  const [mode, setMode] = useState("login");
  const [resetForm, setResetForm] = useState({ email: "", code: "", newPassword: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (status === "authenticated") {
    return <Navigate to={location.state?.from?.pathname || "/"} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username.trim(), password, loginRole);
      navigate(location.state?.from?.pathname || "/", { replace: true });
    } catch (err) {
      setError(err.message || "Couldn't sign in. Check your username, email or phone number and password.");
    } finally {
      setSubmitting(false);
    }
  }

  async function requestCode(event) {
    event.preventDefault();
    setError(""); setSubmitting(true);
    try {
      await requestPasswordReset(resetForm.email);
      setMode("reset");
    } catch (err) { setError(err.message || "The reset code could not be requested."); }
    finally { setSubmitting(false); }
  }

  async function submitReset(event) {
    event.preventDefault();
    setError("");
    if (resetForm.newPassword !== resetForm.confirmPassword) { setError("New passwords do not match."); return; }
    setSubmitting(true);
    try {
      await resetPassword(resetForm);
      setMode("login"); setPassword(""); setResetForm({ email: "", code: "", newPassword: "", confirmPassword: "" });
      setError("Password reset successfully. You can now sign in.");
    } catch (err) { setError(err.message || "The password could not be reset."); }
    finally { setSubmitting(false); }
  }

  function showLogin() {
    setMode("login"); setError(""); setSubmitting(false);
  }

  return (
    <main className="academy-login">
      <svg className="academy-login__corner" viewBox="0 0 260 180" fill="none" aria-hidden="true"><path d="M0 110h28c18 0 28-7 40-20L155 0M0 156h30c18 0 28-6 40-19L205 0" stroke="currentColor" /></svg>
      <div className="academy-login__slogan" aria-label="Better Students. Brighter Futures."><p>Better Students</p><p>Brighter Futures</p><span /></div>
      <svg className="academy-login__watermark" viewBox="0 0 300 335" aria-hidden="true">
        <path d="M150 0 300 72 150 145 0 72Z" fill="currentColor" />
        <path d="M67 99v69l83 51 83-51V99l-83 40Z" fill="currentColor" />
        <path d="M276 79h5v65a9 9 0 0 1 2 17l8 47h-22l8-47a9 9 0 0 1-1-17Z" fill="currentColor" />
        <path d="M150 260C109 223 67 209 15 211l14 23c48 4 83 21 117 48C111 266 60 251 5 256l5 24c61-2 106 13 140 45 34-32 79-47 140-45l5-24c-55-5-106 10-141 26 34-27 69-44 117-48l14-23c-52-2-94 12-135 49Z" fill="currentColor" />
      </svg>
      <div className="academy-login__content">
        <div className="mb-4 flex justify-end"><ThemeSwitch /></div>
        <header className="academy-login__brand">
          <h1 className="sr-only">Insights Academy portal</h1>
          <AcademyBrand dark />
          <p>LEARN <span>·</span> GROW <span>·</span> SUCCEED</p>
        </header>

        {mode === "login" && <form onSubmit={handleSubmit} className="academy-login-card">
          <h2 className="font-display text-lg text-center text-ink-950 mb-5">Insights Academy</h2>

          <fieldset className="academy-login-roles mb-5" disabled={submitting}>

            <div className="academy-login-roles__options">
              {["admin", "staff", "parent"].map((role) => (
                <label key={role} className={`cursor-pointer rounded-md border px-2 py-2 text-center text-sm transition-colors ${loginRole === role ? "border-brass-500 bg-brass-500/10 text-ink-950" : "border-ink-200 text-ink-600 hover:border-brass-500"}`}>
                  <input
                    type="radio"
                    name="loginRole"
                    value={role}
                    checked={loginRole === role}
                    onChange={() => { setLoginRole(role); setError(""); }}
                    className="sr-only peer"
                  />
                  <span className="rounded-sm peer-focus-visible:outline-2 peer-focus-visible:outline-brass-500 peer-focus-visible:outline-offset-2">{role === "admin" ? "Admin" : role === "staff" ? "Staff" : "Parent"}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <div className="mb-4 rounded-md border border-brick-600/30 bg-brick-100 px-3 py-2 text-sm text-brick-600">
              {error}
            </div>
          )}

          <label className="block mb-4">
            <span className="block text-xs font-medium text-ink-600 mb-1.5">Username, email or phone number</span>
            <input
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-950 outline-none focus:border-ink-700 focus:ring-2 focus:ring-ink-700/10"
              placeholder="Username, email or phone number"
            />
          </label>

          <label className="block mb-6">
            <span className="block text-xs font-medium text-ink-600 mb-1.5">Password</span>
            <PasswordInput
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brass-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          {loginRole === "admin" && <button type="button" onClick={() => { setMode("request"); setError(""); }} className="mt-4 w-full text-sm text-ink-600 underline underline-offset-2 hover:text-ink-950">
            Forgot password?
          </button>}
          {loginRole === "parent" && <p className="academy-login-card__help">Parents and guardians: use your registered name, email or phone.<br />For a forgotten password, contact the academy administrator.</p>}
          {loginRole === "staff" && <p className="academy-login-card__help">For a forgotten password, contact the academy administrator.</p>}
        </form>}

        {mode === "request" && <form onSubmit={requestCode} className="academy-login-card">
          <h2 className="font-display text-lg text-ink-950 mb-2">Reset password</h2>
          <p className="mb-5 text-sm text-ink-600">Enter your account email. We will send you a six-digit reset code.</p>
          {error && <div className="mb-4 rounded-md border border-brick-600/30 bg-brick-100 px-3 py-2 text-sm text-brick-600">{error}</div>}
          <Field label="Account email" required><TextInput type="email" required autoComplete="email" value={resetForm.email} onChange={(event) => setResetForm({ ...resetForm, email: event.target.value })} /></Field>
          <button type="submit" disabled={submitting} className="w-full rounded-md bg-brass-500 py-2.5 text-sm font-medium text-white disabled:opacity-60">{submitting ? "Sending…" : "Send reset code"}</button>
          <button type="button" onClick={showLogin} className="mt-4 w-full text-sm text-ink-600 underline underline-offset-2 hover:text-ink-950">Back to sign in</button>
        </form>}

        {mode === "reset" && <form onSubmit={submitReset} className="academy-login-card">
          <h2 className="font-display text-lg text-ink-950 mb-2">Enter reset code</h2>
          <p className="mb-5 text-sm text-ink-600">Check your email. The code expires in 10 minutes.</p>
          {error && <div className="mb-4 rounded-md border border-brick-600/30 bg-brick-100 px-3 py-2 text-sm text-brick-600">{error}</div>}
          <Field label="Account email" required><TextInput type="email" required value={resetForm.email} onChange={(event) => setResetForm({ ...resetForm, email: event.target.value })} /></Field>
          <Field label="Six-digit code" required><TextInput required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={resetForm.code} onChange={(event) => setResetForm({ ...resetForm, code: event.target.value.replace(/\D/g, "").slice(0, 6) })} /></Field>
          <Field label="New password" required><PasswordInput required minLength={8} maxLength={72} autoComplete="new-password" value={resetForm.newPassword} onChange={(event) => setResetForm({ ...resetForm, newPassword: event.target.value })} /></Field>
          <Field label="Confirm new password" required><PasswordInput required minLength={8} maxLength={72} autoComplete="new-password" value={resetForm.confirmPassword} onChange={(event) => setResetForm({ ...resetForm, confirmPassword: event.target.value })} /></Field>
          <button type="submit" disabled={submitting} className="w-full rounded-md bg-brass-500 py-2.5 text-sm font-medium text-white disabled:opacity-60">{submitting ? "Resetting…" : "Reset password"}</button>
          <button type="button" onClick={showLogin} className="mt-4 w-full text-sm text-ink-600 underline underline-offset-2 hover:text-ink-950">Back to sign in</button>
        </form>}

      </div>
    </main>
  );
}
