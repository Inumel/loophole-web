import { createContext, useContext, useState, ReactNode } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const TOKEN_KEY   = 'loophole_token';
const USER_ID_KEY = 'loophole_user_id';

type AuthContextType = {
  unlocked: boolean;
  token: string | null;
  userId: string | null;
  unlock: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  lock: () => void;
};

const AuthContext = createContext<AuthContextType>({
  unlocked: false,
  token: null,
  userId: null,
  unlock: async () => ({ success: false }),
  lock: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token,  setToken]  = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem(USER_ID_KEY));

  const unlocked = !!token;

  async function unlock(username: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        return { success: false, error: data.error ?? 'Incorrect username or password' };
      }

      setToken(data.token);
      setUserId(data.userId);
      localStorage.setItem(TOKEN_KEY,   data.token);
      localStorage.setItem(USER_ID_KEY, data.userId);
      return { success: true };
    } catch {
      return { success: false, error: 'Connection error. Try again.' };
    }
  }

  function lock() {
    setToken(null);
    setUserId(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
  }

  return (
    <AuthContext.Provider value={{ unlocked, token, userId, unlock, lock }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
