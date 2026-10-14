import { getSession, setSession } from './auth';

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
  }
}

function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as { message?: unknown; issues?: { path: string; message: string }[] };
    if (b.issues?.length) return b.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ');
    if (typeof b.message === 'string') return b.message;
    if (Array.isArray(b.message)) return b.message.join('; ');
  }
  return fallback;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const s = getSession();
  if (s) headers.set('authorization', `Bearer ${s.token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, body });
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    setSession(null);
    window.location.href = '/login';
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new ApiError(res.status, messageOf(data, `${res.status} ${res.statusText}`), data);
  return data as T;
}

/** Download an authenticated file (e.g. an error report). */
export async function download(path: string, fallbackName: string) {
  const s = getSession();
  const res = await fetch(`${API_URL}${path}`, { headers: s ? { authorization: `Bearer ${s.token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`, null);
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
