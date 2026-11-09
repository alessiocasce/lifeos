// Capture the SDK return type before Supabase consumes/cleans the URL fragment.
// This only chooses a screen; Supabase still validates the session and every write.
export function readRecoveryReturn(hash='') {
  const params=new URLSearchParams(hash.replace(/^#/,''));
  const error=Boolean(params.get('error') || params.get('error_code'));
  return {recovery:params.get('type')==='recovery' && !error,
    expired:error && (params.get('type')==='recovery' || params.get('error_code')==='otp_expired')};
}
const returnState=readRecoveryReturn(typeof window!=='undefined' ? window.location.hash : '');
export const recoveryReturn=returnState.recovery;
export const expiredRecoveryReturn=returnState.expired;
