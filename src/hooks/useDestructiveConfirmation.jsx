import { useRef, useState } from 'react';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { t } from '../i18n';

export function useDestructiveConfirmation() {
  const [request, setRequest] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const locked = useRef(false);
  const ask = options => { if (!locked.current) { setError(''); setRequest(options); } };
  const dialog = request ? <ConfirmationDialog title={t(request.title)} message={t(request.message)} confirmLabel={t(request.label)}
    busy={busy} error={t(error)} onCancel={() => { if (!locked.current) setRequest(null); }} onConfirm={async () => {
      if (locked.current) return;
      locked.current = true; setBusy(true); setError('');
      try { await request.action(); setRequest(null); }
      catch (failure) { setError(failure.message || 'Changes could not be saved. Try again.'); }
      finally { locked.current = false; setBusy(false); }
    }} /> : null;
  return { ask, dialog };
}
