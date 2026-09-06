import { useEffect, useState } from 'react';
import { localDate } from '../utils/date';

export function useLocalDay() {
  const [day, setDay] = useState(() => localDate());
  useEffect(() => {
    const refresh = () => setDay(localDate());
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return day;
}
