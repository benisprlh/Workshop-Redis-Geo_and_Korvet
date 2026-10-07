import { useCallback, useEffect, useState } from 'react';
import type { Snapshot } from '@fieldops/contracts';
import { request } from '../shared/api';

export function useOperations() {
  const [state, setState] = useState<Snapshot>();
  const [online, setOnline] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      setState(await request('/state'));
      setError('');
    } catch {
      setError('API tidak dapat dijangkau. Periksa layanan API lalu coba lagi.');
    }
  }, []);
  useEffect(() => {
    void reload();
    const source = new EventSource('/api/events');
    source.addEventListener('snapshot', (event) => {
      try {
        setState(JSON.parse((event as MessageEvent).data));
        setOnline(true);
        setError('');
      } catch {
        setError('Data dashboard tidak dapat dibaca. Muat ulang halaman.');
      }
    });
    source.onerror = () => setOnline(false);
    source.onopen = () => setOnline(true);
    return () => source.close();
  }, [reload]);
  return { state, online, error, reload };
}
