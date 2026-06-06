// Base URL for the license API.
// - Browser (client): use NEXT_PUBLIC_API_URL, or '' for same-origin so the
//   Next.js rewrite proxies /api/v1/* to the internal API (all-in-one mode).
// - Server (NextAuth authorize, RSC): relative URLs don't work, so hit the API
//   directly via INTERNAL_API_URL (defaults to the in-container API port).
const API_URL =
  typeof window === 'undefined'
    ? process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001'
    : process.env.NEXT_PUBLIC_API_URL || '';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...init } = options;
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    request<{ token: string; admin: Admin }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: (token: string) => request<Admin>('/auth/me', { token }),
  changePassword: (token: string, current: string, next: string) =>
    request('/auth/change-password', {
      method: 'POST',
      token,
      body: JSON.stringify({ current_password: current, new_password: next }),
    }),
};

// ── Stats ─────────────────────────────────────────────────────────────────
export const statsApi = {
  get: (token: string) => request<Stats>('/logs/stats', { token }),
  expiring: (token: string, days = 30) =>
    request<{ data: License[]; count: number }>(`/logs/expiring?days=${days}`, { token }),
};

// ── Licenses ──────────────────────────────────────────────────────────────
export const licenseApi = {
  list: (token: string, params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return request<Paginated<License>>(`/issue?${q}`, { token });
  },
  get: (token: string, id: string) =>
    request<LicenseDetail>(`/issue/${id}`, { token }),
  issue: (token: string, body: IssueBody) =>
    request<{ key: string }>('/issue', { method: 'POST', token, body: JSON.stringify(body) }),
  extend: (token: string, id: string, expires_at: string) =>
    request('/issue/' + id + '/extend', {
      method: 'PATCH', token, body: JSON.stringify({ expires_at }),
    }),
  update: (token: string, id: string, body: Record<string, unknown>) =>
    request(`/issue/${id}`, { method: 'PATCH', token, body: JSON.stringify(body) }),
  remove: (token: string, id: string) =>
    request(`/issue/${id}`, { method: 'DELETE', token }),
  revoke: (token: string, key: string, reason?: string) =>
    request('/revoke', { method: 'POST', token, body: JSON.stringify({ key, reason }) }),
  restore: (token: string, key: string) =>
    request('/revoke/restore', { method: 'POST', token, body: JSON.stringify({ key }) }),
  bulkRevoke: (token: string, ids: string[], reason?: string) =>
    request('/revoke/bulk', { method: 'POST', token, body: JSON.stringify({ ids, reason }) }),
};

// ── Products ──────────────────────────────────────────────────────────────
export const productApi = {
  list: (token: string) => request<ProductWithStats[]>('/products', { token }),
  get: (token: string, id: string) => request<Product>(`/products/${id}`, { token }),
  create: (token: string, body: Omit<Product, 'id' | 'createdAt' | 'active'>) =>
    request<Product>('/products', { method: 'POST', token, body: JSON.stringify(body) }),
  update: (token: string, id: string, body: Partial<Product>) =>
    request<Product>(`/products/${id}`, { method: 'PATCH', token, body: JSON.stringify(body) }),
  delete: (token: string, id: string) =>
    request(`/products/${id}`, { method: 'DELETE', token }),
};

// ── Logs ──────────────────────────────────────────────────────────────────
export const logApi = {
  list: (token: string, params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return request<Paginated<VerifyLog>>(`/logs?${q}`, { token });
  },
};

// ── Types ─────────────────────────────────────────────────────────────────
export interface Admin {
  id: string;
  email: string;
  name: string;
  role: string;
  lastLoginAt?: string;
}

export interface Stats {
  licenses: {
    total: number; active: number; revoked: number;
    expired: number; expiring_soon: number;
  };
  verify_24h: {
    total: number; success: number; failed: number; success_rate: number;
  };
  hourly_chart: { hour: string; count: number }[];
  anomaly_license_ids: string[];
}

export interface License {
  id: string;
  key: string;
  customerName: string;
  customerEmail: string;
  domains: string[];
  versionRange: string | null;
  expiresAt: string | null;
  hwBinding: boolean;
  revoked: boolean;
  revokedAt: string | null;
  revokedReason: string | null;
  createdAt: string;
  product: { slug: string; name: string };
}

export interface LicenseDetail extends License {
  notes: string | null;
  domainChangeCount: number;
  maxDomainChanges: number;
  hwFingerprint: string | null;
  verifyLogs: VerifyLog[];
}

export interface IssueBody {
  product_id: string;
  customer_name: string;
  customer_email: string;
  domains: string[];
  version_range?: string | null;
  expires_at?: string | null;
  hw_binding?: boolean;
  notes?: string;
  max_domain_changes?: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  prefix: string;
  description?: string;
  versions: string[];
  active: boolean;
  createdAt: string;
}

export interface ProductWithStats extends Product {
  active_licenses: number;
  _count: { licenses: number };
}

export interface VerifyLog {
  id: string;
  key: string;
  licenseId?: string | null;
  domain: string;
  ip: string;
  version?: string;
  result: string;
  reason?: string;
  createdAt: string;
  license?: {
    customerName: string;
    customerEmail: string;
    product: { slug: string };
  };
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}
