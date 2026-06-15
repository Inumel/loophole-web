import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const TOKEN_KEY = 'loophole_token';

type AuthContextType = {
  unlocked: boolean;
  token: string | null;
  unlock: (password: string) => Promise<{ success: boolean; error?: string }>;
  lock: () => void;
};

const AuthContext = createContext<AuthContextType>({
  unlocked: false,
  token: null,
  unlock: async () => ({ success: false }),
  lock: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY)
  );

  const unlocked = !!token;

  async function unlock(password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        return { success: false, error: data.error ?? 'Incorrect password' };
      }

      setToken(data.token);
      localStorage.setItem(TOKEN_KEY, data.token);
      return { success: true };
    } catch {
      return { success: false, error: 'Connection error. Try again.' };
    }
  }

  function lock() {
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
  }

  return (
    <AuthContext.Provider value={{ unlocked, token, unlock, lock }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
