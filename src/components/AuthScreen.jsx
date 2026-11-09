import { t } from '../i18n';
import { Loader2, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';
import { setLanguage, useLanguage } from '../i18n';
import { authApi, identityApi } from '../services/lifeosApi';
import { normalizeUsername } from '../utils/userSettingsIdentity';
import { expiredRecoveryReturn } from '../utils/authRecovery';

export function AuthScreen() {
  const language=useLanguage();
  const { authError, signIn, signUp } = useLifeOS();
  const [mode, setMode] = useState('sign-in');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [formError, setFormError] = useState(expiredRecoveryReturn ? 'This reset link is invalid or expired. Request a new reset link.' : '');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [availability, setAvailability] = useState('');
  const availabilityRequest = useRef(0);
  const checkUsername = async () => {
    const request = ++availabilityRequest.current;
    if (!/^[a-z][a-z0-9_]{2,23}$/i.test(form.username)) { setAvailability(''); return; }
    try { const available = await identityApi.available(form.username); if (request === availabilityRequest.current) setAvailability(available ? 'Username is available.' : 'Username is already taken.'); }
    catch { if (request === availabilityRequest.current) setAvailability('Availability will be checked when you create your account.'); }
  };
  const submitting = useRef(false);

  const isSignUp = mode === 'sign-up';

  const submit = async (event) => {
    event.preventDefault();
    if (submitting.current) return;
    setFormError('');
    setMessage('');

    if (!form.email.trim()) {
      setFormError(t("Email is required."));
      return;
    }

    if (form.password.length < 6) {
      setFormError(t("Password must be at least 6 characters."));
      return;
    }
    if (isSignUp && !/^[a-z][a-z0-9_]{2,23}$/i.test(form.username)) {
      setFormError(t('Use a 3–24 character username starting with a letter.'));
      return;
    }

    submitting.current = true;
    setLoading(true);
    try {
      const action = isSignUp ? signUp : signIn;
      const data = await action({ email: form.email.trim(), password: form.password, ...(isSignUp ? { username: form.username.trim(), language } : {}) });
      if (isSignUp && !data.session) {
        setMessage(t("Account created. Check your email to confirm the account, then sign in."));
        setMode('sign-in');
        setForm((prev) => ({ ...prev, password: '' }));
      }
    } catch (error) {
      setFormError(error.message || t("Authentication failed."));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  if (mode === 'reset-request') return <PasswordResetRequest onBack={() => setMode('sign-in')} />;
  return (
    <AuthFrame eyebrow={t("Private workspace")} title={t("LifeOS")}>
      <div className="border-t border-white/15 pt-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100">{isSignUp ? t("Create access") : t("Sign in")}</h2>
          </div>
          <div className="grid h-11 w-11 shrink-0 place-items-center text-zinc-400">
            <ShieldCheck size={20} aria-hidden="true" />
          </div>
        </div>

        <label className="mb-4 grid gap-2 text-sm">{t('Language')}<select aria-label={t('Language')} className="min-h-11 rounded border border-white/15 bg-[#14171b] px-3" value={language} onChange={e=>setLanguage(e.target.value)}><option value="en">{t("English")}</option><option value="it">{t("Italiano")}</option></select></label>
        <form onSubmit={submit} aria-busy={loading}>
          {isSignUp ? <p className="mb-4 text-sm leading-relaxed text-zinc-400">{t('Completed workouts are shared with signed-in members once your public profile is set up. You can turn this off in Settings. Notes stay private unless enabled.')}</p> : null}
          <fieldset disabled={loading} className="grid min-w-0 gap-4">
            {isSignUp ? <label className="grid gap-2"><span className="text-sm text-zinc-300">{t('Username')}</span><input aria-label={t('Username')} autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={24} pattern="[a-z][a-z0-9_]{2,23}" className="min-h-12 rounded border border-white/15 bg-[#14171b] px-3" value={form.username} onBlur={checkUsername} onChange={e => { availabilityRequest.current++; setAvailability(''); setForm(v => ({ ...v, username: normalizeUsername(e.target.value) })); }} /><span className="text-xs text-zinc-400">{t('Your username is visible to other LifeOS members.')}</span>{availability ? <span role="status" className="text-xs text-zinc-300">{t(availability)}</span> : null}</label> : null}
            <AuthField
              label={t("Email")}
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
            />
            <AuthField
              label={t("Password")}
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={form.password}
              onChange={(value) => setForm((prev) => ({ ...prev, password: value }))}
            />

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded border border-zinc-300 bg-zinc-200 px-3 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-400"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : isSignUp ? <UserPlus size={16} /> : <LogIn size={16} />}
              {loading ? t("Authenticating") : isSignUp ? t("Create Account") : t("Enter LifeOS")}
            </button>
          </fieldset>
        </form>

        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setMode(isSignUp ? 'sign-in' : 'sign-up');
              setFormError('');
              setMessage('');
            }}
            className="min-h-11 rounded px-2 text-sm text-zinc-300 transition hover:text-white disabled:text-zinc-500"
          >
            {isSignUp ? t("Use existing account") : t("Create account")}
          </button>
          {!isSignUp && <button type="button" className="min-h-11 px-2 text-sm text-zinc-300" disabled={loading} onClick={() => setMode('reset-request')}>{t('Forgot password?')}</button>}
        </div>

        {message ? <p role="status" className="mt-3 border-l-2 border-emerald-400/50 px-3 py-2 text-sm leading-6 text-emerald-200">{t(message)}</p> : null}
        {formError || authError ? <p role="alert" className="mt-3 border-l-2 border-red-400/50 px-3 py-2 text-sm leading-6 text-red-200">{formError || authError}</p> : null}
      </div>
    </AuthFrame>
  );
}

function PasswordResetRequest({ onBack }) {
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState(false);
  const locked = useRef(false);
  return <AuthFrame eyebrow={t('Private workspace')} title="LifeOS"><h2 className="mb-6 text-xl font-semibold">{t('Reset password')}</h2>
    <form className="grid gap-4" onSubmit={async event => {
      event.preventDefault(); if (locked.current) return;
      locked.current = true; setBusy(true); setError('');
      try { await authApi.requestPasswordReset(email); setSent(true); }
      catch { setError('The reset link could not be requested. Try again later.'); }
      finally { locked.current = false; setBusy(false); }
    }}><AuthField label={t('Email')} type="email" autoComplete="email" value={email} onChange={setEmail} />
      <button type="submit" disabled={busy || sent || !email.trim()} className="primary-button min-h-12">{t(busy ? 'Sending...' : 'Send reset link')}</button>
      <button type="button" disabled={busy} className="min-h-11 text-zinc-300" onClick={onBack}>{t('Back to sign in')}</button>
    </form>{sent && <p role="status" className="mt-4 text-sm leading-6 text-zinc-300">{t('If an account exists, a password reset link will arrive by email. Check your inbox and spam folder.')}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{t(error)}</p>}
  </AuthFrame>;
}

export function PasswordRecoveryScreen({ onDone }) {
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const locked = useRef(false);
  return <AuthFrame eyebrow={t('Private workspace')} title="LifeOS"><h2 className="mb-6 text-xl font-semibold">{t('Choose a new password')}</h2>
    <form className="grid gap-4" onSubmit={async event => {
      event.preventDefault(); if (locked.current) return;
      if (password.length < 8) { setError('Use at least 8 characters.'); return; }
      if (password !== confirmation) { setError('Passwords do not match.'); return; }
      locked.current = true; setBusy(true); setError('');
      try { await authApi.updatePassword(password); setPassword(''); setConfirmation(''); onDone(); }
      catch (failure) { setError(failure.message || 'Password update failed. Request another reset link if it expired.'); }
      finally { locked.current = false; setBusy(false); }
    }}><AuthField label={t('New password')} type="password" autoComplete="new-password" value={password} onChange={setPassword} />
      <AuthField label={t('Confirm password')} type="password" autoComplete="new-password" value={confirmation} onChange={setConfirmation} />
      <button type="submit" disabled={busy} className="primary-button min-h-12">{t(busy ? 'Saving...' : 'Update password')}</button>
    </form>{error && <p role="alert" className="mt-4 text-sm text-red-300">{t(error)}</p>}
  </AuthFrame>;
}

export function AuthLoadingScreen() {
  return (
    <AuthFrame eyebrow={t("Private workspace")} title={t("LifeOS")}>
      <div role="status" className="flex items-center gap-3 border-t border-white/15 py-6">
        <Loader2 size={18} className="animate-spin text-zinc-400" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-zinc-100">{t("Restoring session")}</p>
        </div>
      </div>
    </AuthFrame>
  );
}

export function AuthConfigScreen() {
  return (
    <AuthFrame eyebrow={t("Setup Required")} title={t("LifeOS")}>
      <div role="alert" className="border-t border-amber-400/30 py-6">
        <p className="text-sm font-semibold text-amber-100">{t("Supabase environment is missing")}</p>
        <p className="mt-2 text-sm leading-6 text-amber-100/75">{t("Configure the public Supabase URL and anonymous key, then restart the app.")}</p>
      </div>
    </AuthFrame>
  );
}

function AuthFrame({ children, eyebrow, title }) {
  return (
    <main className="auth-entry grid min-h-dvh place-items-center px-6 text-zinc-100">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-semibold">{title}</h1>
            </div>
            <p className="mt-2 text-sm text-zinc-400">{eyebrow}</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}

function AuthField({ label, onChange, type, value, autoComplete }) {
  return (
    <label className="grid min-w-0 gap-2">
      <span className="text-sm text-zinc-300">{t(label)}</span>
      <input
        type={type}
        name={type === 'email' ? 'email' : 'password'}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full min-w-0 rounded border border-white/15 bg-[#14171b] px-3 py-3 text-base text-zinc-100 disabled:text-zinc-400"
      />
    </label>
  );
}
