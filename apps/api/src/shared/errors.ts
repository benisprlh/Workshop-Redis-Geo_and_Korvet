import { WorkshopTodoError } from '../workshop/support.js';

export class InfrastructureError extends Error {
  constructor(
    message = 'Infrastruktur tidak tersambung. Periksa Redis, Korvet, dan advertised host.',
  ) {
    super(message);
    this.name = 'InfrastructureError';
  }
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class CheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckError';
  }
}
export async function timeout<T>(
  promise: Promise<T>,
  ms: number,
  message = 'Batas waktu operasi tercapai.',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  ms: number,
  message: string,
): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await predicate()) return;
    await delay(150);
  }
  throw new CheckError(message);
}
export function safeMessage(error: unknown): string {
  if (
    error instanceof WorkshopTodoError ||
    error instanceof ApiError ||
    error instanceof CheckError ||
    error instanceof InfrastructureError
  )
    return error.message;
  // Jangan mengekspor error client mentah yang mungkin berisi URI/kredensial.
  return 'Operasi gagal. Periksa parameter latihan, koneksi lab, dan advertised host Korvet.';
}
