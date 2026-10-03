import { createClient, SupabaseClient, Session, User as SupabaseAuthUser, AuthChangeEvent } from '@supabase/supabase-js';

// Environment Supabase Credentials with sanitization
const getEnvVar = (key: string): string => {
  try {
    return ((import.meta as any).env?.[key] || '').trim();
  } catch {
    return '';
  }
};

const rawUrl = getEnvVar('VITE_SUPABASE_URL');
const rawKey = getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY') || getEnvVar('VITE_SUPABASE_ANON_KEY');

// Validate URL format to prevent malformed requests that cause 401/400 errors
const isValidSupabaseUrl = (url: string): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !url.includes('placeholder') && !url.includes('undefined');
  } catch {
    return false;
  }
};

export const isSupabaseClientConfigured = Boolean(
  isValidSupabaseUrl(rawUrl) && rawKey && rawKey.length > 10 && !rawKey.includes('placeholder')
);

export const SUPABASE_URL = isSupabaseClientConfigured ? rawUrl : '';
export const SUPABASE_ANON_KEY = isSupabaseClientConfigured ? rawKey : '';

/**
 * Robust Supabase Client with auto token refresh, session persistence, and custom fetch error recovery
 */
export const supabase: SupabaseClient | null = isSupabaseClientConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        storageKey: 'codeguard_supabase_auth_token',
      },
      global: {
        headers: {
          'x-client-info': 'codeguard-platform-2026',
        },
        fetch: async (url, options = {}) => {
          try {
            const response = await fetch(url, options);
            // Detect 401 Unauthorized errors caused by expired or invalid refresh tokens
            if (response.status === 401) {
              const urlStr = typeof url === 'string' ? url : url.toString();
              // If it's an auth token refresh or user query error, clear corrupted auth state to prevent endless 401 loops
              if (urlStr.includes('/auth/v1/token') || urlStr.includes('/auth/v1/user')) {
                console.warn('[Supabase Client] 401 Unauthorized encountered during auth request. Clearing invalid session.');
                if (typeof window !== 'undefined') {
                  window.localStorage.removeItem('codeguard_supabase_auth_token');
                  // Also clean legacy Supabase default keys
                  for (let i = window.localStorage.length - 1; i >= 0; i--) {
                    const key = window.localStorage.key(i);
                    if (key && (key.startsWith('sb-') || key.includes('supabase.auth.token'))) {
                      window.localStorage.removeItem(key);
                    }
                  }
                }
              }
            }
            return response;
          } catch (err) {
            console.warn('[Supabase Client Fetch Error]:', err);
            throw err;
          }
        },
      },
    })
  : null;

/**
 * Safely get current session with 401 catch and recovery
 */
export async function safeGetSession(): Promise<Session | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      if (error.status === 401 || error.message?.toLowerCase().includes('refresh token')) {
        console.warn('[Supabase Auth] Session invalid or expired (401). Clearing session.');
        await supabase.auth.signOut().catch(() => {});
      }
      return null;
    }
    return data?.session || null;
  } catch (err: any) {
    console.warn('[Supabase safeGetSession caught]:', err?.message || err);
    return null;
  }
}

/**
 * Safely get current authenticated user
 */
export async function safeGetUser(): Promise<SupabaseAuthUser | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (error.status === 401) {
        console.warn('[Supabase Auth] User 401 Unauthorized. Clearing stale token.');
        await supabase.auth.signOut().catch(() => {});
      }
      return null;
    }
    return data?.user || null;
  } catch (err: any) {
    console.warn('[Supabase safeGetUser caught]:', err?.message || err);
    return null;
  }
}

/**
 * Explicit token refreshing helper
 */
export async function refreshSupabaseSession(): Promise<Session | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      console.warn('[Supabase Token Refresh Failed]:', error.message);
      return null;
    }
    return data.session;
  } catch (err: any) {
    console.warn('[Supabase refreshSession caught]:', err?.message || err);
    return null;
  }
}

/**
 * Row-Level Security (RLS) Policy Validation helper
 * Tests table accessibility and returns detailed status
 */
export async function validateRlsPolicy(tableName: string): Promise<{
  accessible: boolean;
  statusCode?: number;
  message: string;
  isRlsRestricted?: boolean;
}> {
  if (!supabase) {
    return {
      accessible: false,
      message: 'Supabase is not configured or disabled.',
    };
  }

  try {
    // Attempt a light query to test table RLS read permissions
    const { data, error, status } = await supabase
      .from(tableName)
      .select('id')
      .limit(1);

    if (error) {
      const isRls = error.code === '42501' || status === 401 || status === 403 || error.message?.toLowerCase().includes('policy');
      return {
        accessible: false,
        statusCode: status || 401,
        message: error.message || 'Access restricted by RLS policy',
        isRlsRestricted: isRls,
      };
    }

    return {
      accessible: true,
      statusCode: status || 200,
      message: `RLS policy allows access to ${tableName} (${data?.length ?? 0} rows visible).`,
    };
  } catch (err: any) {
    return {
      accessible: false,
      statusCode: 500,
      message: err?.message || 'Error validating RLS policy',
    };
  }
}

/**
 * Validates all standard core tables against RLS policies
 */
export async function validateCoreRlsPolicies(): Promise<Record<string, { accessible: boolean; statusCode?: number; message: string; isRlsRestricted?: boolean }>> {
  const tables = ['users', 'assessments', 'questions', 'attempts', 'submissions', 'classes', 'departments', 'institutions'];
  const results: Record<string, { accessible: boolean; statusCode?: number; message: string; isRlsRestricted?: boolean }> = {};
  
  if (!supabase) return results;

  await Promise.all(
    tables.map(async (tbl) => {
      results[tbl] = await validateRlsPolicy(tbl);
    })
  );

  return results;
}
