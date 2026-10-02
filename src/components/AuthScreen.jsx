import { Loader2, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';

export function AuthScreen() {
  const { authError, signIn, signUp } = useLifeOS();
  const [mode, setMode] = useState('sign-in');
  const [form, setForm] = useState({ email: '', password: '' });
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const isSignUp = mode === 'sign-up';

  const submit = async (event) => {
    event.preventDefault();
    if (submitting.current) return;
    setFormError('');
    setMessage('');

    if (!form.email.trim()) {
      setFormError('Email is required.');
      return;
    }

    if (form.password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    submitting.current = true;
    setLoading(true);
    try {
      const action = isSignUp ? signUp : signIn;
      const data = await action({ email: form.email.trim(), password: form.password });
      if (isSignUp && !data.session) {
        setMessage('Account created. Check your email to confirm the account, then sign in.');
        setMode('sign-in');
        setForm((prev) => ({ ...prev, password: '' }));
      }
    } catch (error) {
      setFormError(error.message || 'Authentication failed.');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <AuthFrame eyebrow="Private workspace" title="LifeOS">
      <div className="border-t border-white/15 pt-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100">{isSignUp ? 'Create access' : 'Sign in'}</h2>
          </div>
          <div className="grid h-11 w-11 shrink-0 place-items-center text-zinc-400">
            <ShieldCheck size={20} aria-hidden="true" />
          </div>
        </div>

        <form onSubmit={submit} aria-busy={loading}>
          <fieldset disabled={loading} className="grid min-w-0 gap-4">
            <AuthField
              label="Email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
            />
            <AuthField
              label="Password"
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
              {loading ? 'Authenticating' : isSignUp ? 'Create Account' : 'Enter LifeOS'}
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
            {isSignUp ? 'Use existing account' : 'Create account'}
          </button>
        </div>

        {message ? <p role="status" className="mt-3 border-l-2 border-emerald-400/50 px-3 py-2 text-sm leading-6 text-emerald-200">{message}</p> : null}
        {formError || authError ? <p role="alert" className="mt-3 border-l-2 border-red-400/50 px-3 py-2 text-sm leading-6 text-red-200">{formError || authError}</p> : null}
      </div>
    </AuthFrame>
  );
}

export function AuthLoadingScreen() {
  return (
    <AuthFrame eyebrow="Private workspace" title="LifeOS">
      <div role="status" className="flex items-center gap-3 border-t border-white/15 py-6">
        <Loader2 size={18} className="animate-spin text-zinc-400" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-zinc-100">Restoring session</p>
        </div>
      </div>
    </AuthFrame>
  );
}

export function AuthConfigScreen() {
  return (
    <AuthFrame eyebrow="Setup Required" title="LifeOS">
      <div role="alert" className="border-t border-amber-400/30 py-6">
        <p className="text-sm font-semibold text-amber-100">Supabase environment is missing</p>
        <p className="mt-2 text-sm leading-6 text-amber-100/75">
          Configure the public Supabase URL and anonymous key, then restart the app.
        </p>
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
      <span className="text-sm text-zinc-300">{label}</span>
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
