const account = () => JSON.parse(localStorage.getItem('qa-user') || '{"id":"qa-user-a"}');
const key = () => `qa-rest:${account().id}`;
const read = () => JSON.parse(localStorage.getItem(key()) || '{"preference":{"enabled":false,"seconds":120,"notifications":false},"timer":null}');
const write = value => localStorage.setItem(key(), JSON.stringify(value));
export const workoutRestApi = {
  async read(workoutId) { const value = read(); return { ...value, timer: value.timer?.workout_id === workoutId ? value.timer : null }; },
  async save(preference) {
    if (localStorage.getItem('qa-rest-fail')) throw new Error('Training timer is unavailable. Your workout is still saved.');
    const value = read(); value.preference = preference; if (!preference.enabled) value.timer = null; write(value); return preference;
  },
  async cancel() { const value = read(); value.timer = null; write(value); },
  async enableNotifications() { if (localStorage.getItem('qa-push-fail')) throw new Error('Notification permission was not granted.'); },
  async detachDevice() {},
  async detachLocalDevice() {},
};
window.addEventListener('lifeos:workout-set-saved', event => {
  const value = read();
  if (value.preference.enabled && event.detail?.userId === account().id) {
    value.timer = { id: 'qa-rest-timer', workout_id: event.detail.sessionId, scheduled_for: new Date(Date.now() + value.preference.seconds * 1000).toISOString(), state: 'queued' }; write(value);
  }
});
