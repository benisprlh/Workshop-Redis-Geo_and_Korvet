import type { Hint, Snapshot, StorageSnapshot } from '@fieldops/contracts';
export async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    path.includes('validate') ? 120000 : 15000,
  );
  try {
    const response = await fetch(`/api${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const raw = await response.text();
    let data: unknown;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error('Respons API tidak dapat dibaca. Periksa log layanan API.');
    }
    if (!response.ok) {
      const error = data as { error?: unknown; message?: string };
      throw new Error(
        typeof error.error === 'string'
          ? error.error
          : (error.message ?? `Permintaan gagal (${response.status}).`),
      );
    }
    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw new Error('Permintaan melewati batas waktu. Periksa koneksi lab lalu coba lagi.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
export const getState = () => request<Snapshot>('/state');
export const getStorage = () =>
  request<StorageSnapshot & { error?: string; verifiedEventIds?: string[] }>('/storage');
export async function getHints(): Promise<Hint[]> {
  const response = await request<Hint[] | { hints: Hint[] }>('/workshop/hints');
  return Array.isArray(response) ? response : response.hints;
}
export const number = (n: number, digits = 1) =>
  n.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const time = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';
