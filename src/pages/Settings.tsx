import { useState } from 'react';
import { useAuth } from '../lib/auth';

export default function SettingsPage() {
  const { unlocked, unlock, lock } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  async function handleUnlock() {
    if (!password.trim()) return;
    setLoading(true);
    setError('');
    const result = await unlock(password);
    setLoading(false);
    if (result.success) {
      setPassword('');
    } else {
      setError(result.error ?? 'Incorrect password.');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h1>Settings</h1>

      {unlocked ? (
        <div>
          <div style={{ background: '#1F2937', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 32 }}>🔓</span>
              <div>
                <p style={{ color: '#F9FAFB', fontSize: 16, fontWeight: 600 }}>Full access unlocked</p>
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>All features are available this session.</p>
              </div>
            </div>
            <button onClick={lock} style={{
              width: '100%', padding: '10px 16px', borderRadius: 8,
              border: '1px solid #374151', background: 'transparent',
              color: '#9CA3AF', cursor: 'pointer', fontSize: 14,
            }}>
              🔒 Lock & restrict access
            </button>
          </div>

          <div style={{ background: '#1a2540', borderRadius: 12, padding: 16, borderLeft: '3px solid #7C3AED' }}>
            <p style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 1.6 }}>
              Locking hides all pages except Projects, which becomes read-only.
              The session stays locked until the password is entered again.
            </p>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ background: '#1F2937', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 32 }}>🔒</span>
              <div>
                <p style={{ color: '#F9FAFB', fontSize: 16, fontWeight: 600 }}>Restricted access</p>
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Enter the password to unlock all features.</p>
              </div>
            </div>

            <div style={{
              animation: shake ? 'shake 0.4s ease' : 'none',
            }}>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                placeholder="Enter password"
                autoFocus
                style={{
                  width: '100%', background: '#374151',
                  border: `1px solid ${error ? '#EF4444' : '#4B5563'}`,
                  borderRadius: 8, padding: '12px 14px', color: '#F9FAFB',
                  fontSize: 16, boxSizing: 'border-box', marginBottom: 8,
                  outline: 'none',
                }}
              />
            </div>

            {error && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}

            <button onClick={handleUnlock} disabled={!password.trim() || loading} style={{
              width: '100%', padding: '12px 16px', borderRadius: 8,
              border: 'none', background: '#7C3AED',
              color: '#fff', cursor: password.trim() && !loading ? 'pointer' : 'default',
              fontSize: 15, fontWeight: 600,
              opacity: password.trim() && !loading ? 1 : 0.5,
            }}>
              {loading ? 'Checking…' : 'Unlock'}
            </button>
          </div>

          <div style={{ background: '#1a2540', borderRadius: 12, padding: 16, borderLeft: '3px solid #374151' }}>
            <p style={{ color: '#6B7280', fontSize: 13, lineHeight: 1.6 }}>
              Without a password, you can view existing projects but cannot edit them,
              create new ones, or access other sections of the app.
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-8px); }
          80% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}
