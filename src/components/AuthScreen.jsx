import { Activity, Loader2, LogIn, RadioTower, ShieldCheck, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useLifeOS } from '../context/LifeOSContext';

export function AuthScreen() {
  const { authError, signIn, signUp } = useLifeOS();
  const [mode, setMode] = useState('sign-in');
  const [form, setForm] = useState({ email: '', password: '' });
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const isSignUp = mode === 'sign-up';

  const submit = async (event) => {
    event.preventDefault();
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
      setLoading(false);
    }
  };

  return (
    <AuthFrame eyebrow="Secure Entry" title="LifeOS">
      <div className="rounded-md border border-white/5 bg-[#121212] p-3 shadow-glow sm:p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="data-text text-[10px] uppercase tracking-wider text-cyan-300">Midnight Ops</p>
            <h1 className="mt-1 text-xl font-semibold text-zinc-100">{isSignUp ? 'Create access' : 'Sign in'}</h1>
            <p className="mt-1 text-sm leading-5 text-zinc-500">
              Authenticate before entering the command center.
            </p>
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
            <ShieldCheck size={20} />
          </div>
        </div>

        <form onSubmit={submit} className="grid gap-3">
          <AuthField
            label="Email"
            type="email"
            value={form.email}
            onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
          />
          <AuthField
            label="Password"
            type="password"
            value={form.password}
            onChange={(value) => setForm((prev) => ({ ...prev, password: value }))}
          />

          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : isSignUp ? <UserPlus size={16} /> : <LogIn size={16} />}
            {loading ? 'Authenticating' : isSignUp ? 'Create Account' : 'Enter LifeOS'}
          </button>
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
            className="data-text text-[11px] text-cyan-300 transition hover:text-cyan-200 disabled:text-zinc-600"
          >
            {isSignUp ? 'Use existing account' : 'Create account'}
          </button>
          <span className="data-text text-[10px] uppercase text-zinc-600">Supabase Auth</span>
        </div>

        {message ? <p className="mt-3 rounded border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">{message}</p> : null}
        {authError || formError ? <p className="mt-3 rounded border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{authError || formError}</p> : null}
      </div>
    </AuthFrame>
  );
}

export function AuthLoadingScreen() {
  return (
    <AuthFrame eyebrow="Session Sync" title="LifeOS">
      <div className="flex items-center gap-3 rounded-md border border-white/5 bg-[#121212] p-4 shadow-glow">
        <Loader2 size={18} className="animate-spin text-cyan-300" />
        <div>
          <p className="text-sm font-semibold text-zinc-100">Restoring session</p>
          <p className="data-text text-[11px] text-zinc-500">Checking Supabase Auth state</p>
        </div>
      </div>
    </AuthFrame>
  );
}

export function AuthConfigScreen() {
  return (
    <AuthFrame eyebrow="Setup Required" title="LifeOS">
      <div className="rounded-md border border-amber-400/20 bg-amber-400/10 p-4 shadow-glow">
        <p className="text-sm font-semibold text-amber-100">Supabase environment is missing</p>
        <p className="mt-2 text-sm leading-6 text-amber-100/75">
          Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `.env.local`, run `supabase/schema.sql`,
          then restart the dev server.
        </p>
      </div>
    </AuthFrame>
  );
}

function AuthFrame({ children, eyebrow, title }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0a0a0a] px-3 py-6 text-zinc-100">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 shadow-glow">
            <RadioTower size={21} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-cyan-400" />
              <h1 className="text-lg font-semibold tracking-wide">{title}</h1>
            </div>
            <p className="data-text mt-1 text-[11px] uppercase tracking-wider text-zinc-500">{eyebrow}</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}

function AuthField({ label, onChange, type, value }) {
  return (
    <label className="rounded-md border border-white/5 bg-black/25 px-3 py-2">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="data-text mt-1 w-full bg-transparent text-base font-semibold text-zinc-100 outline-none placeholder:text-zinc-700"
      />
    </label>
  );
}
