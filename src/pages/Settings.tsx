import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { getPref, setPref, PREF_KEYS } from '../lib/prefs';
import { useTheme } from '../lib/useTheme';

type PrefKey = keyof typeof PREF_KEYS;

export default function SettingsPage() {
  const { unlocked, userId, unlock, lock } = useAuth();
  const { dark, toggleDark } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [saved, setSaved] = useState(false);

  // Preferences state — read from localStorage on first render
  const [defaultYarnUnit, setDefaultYarnUnit] = useState(() => getPref('DEFAULT_YARN_UNIT'));
  const [defaultGaugeUnit, setDefaultGaugeUnit] = useState(() => getPref('DEFAULT_GAUGE_UNIT'));
  const [needleSystem, setNeedleSystem] = useState(() => getPref('PREFERRED_NEEDLE_SYSTEM'));
  const [rowIncrement, setRowIncrement] = useState(() => getPref('ROW_COUNTER_INCREMENT'));
  const [dateFormat, setDateFormat] = useState(() => getPref('DATE_FORMAT'));
  const [timerReminder, setTimerReminder] = useState(() => getPref('TIMER_REMINDER_HOURS'));

  async function handleUnlock() {
    if (!username.trim() || !password.trim()) return;
    setLoading(true); setError('');
    const result = await unlock(username.trim(), password);
    setLoading(false);
    if (result.success) { setUsername(''); setPassword(''); }
    else {
      setError(result.error ?? 'Incorrect username or password.');
      setShake(true); setTimeout(() => setShake(false), 500);
    }
  }

  function savePrefs() {
    setPref('DEFAULT_YARN_UNIT', defaultYarnUnit);
    setPref('DEFAULT_GAUGE_UNIT', defaultGaugeUnit);
    setPref('PREFERRED_NEEDLE_SYSTEM', needleSystem);
    setPref('ROW_COUNTER_INCREMENT', rowIncrement || '1');
    setPref('DATE_FORMAT', dateFormat);
    setPref('TIMER_REMINDER_HOURS', timerReminder || '0');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h1>Settings</h1>

      {/* ── Preferences ──────────────────────────────────────────────────── */}
      {unlocked && (
        <div style={{ marginBottom: 32 }}>
          <p style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
            Preferences
          </p>

          <OptionRow
            label="Default yarn unit"
            hint="Unit pre-selected when adding new yarn"
            options={['g', 'oz', 'yards', 'meters', 'skeins']}
            value={defaultYarnUnit}
            onChange={setDefaultYarnUnit}
          />

          <OptionRow
            label="Default gauge unit"
            hint="Pre-selected in the gauge calculator"
            options={['10cm', '4in']}
            value={defaultGaugeUnit}
            onChange={setDefaultGaugeUnit}
          />

          <OptionRow
            label="Preferred needle system"
            hint="Highlighted column in needle size converter"
            options={['metric', 'US', 'UK']}
            value={needleSystem}
            onChange={setNeedleSystem}
          />

          <OptionRow
            label="Date format"
            options={['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY']}
            value={dateFormat}
            onChange={setDateFormat}
          />

          {/* Dark mode toggle */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={label}>{dark ? '🌙 Dark mode' : '☀️ Light mode'}</p>
                <p style={hint_s}>Twilight Rose dark theme</p>
              </div>
              <button
                onClick={toggleDark}
                style={{
                  width: 52, height: 28, borderRadius: 14,
                  background: dark ? 'var(--primary)' : 'var(--border-medium)',
                  border: 'none', cursor: 'pointer', position: 'relative',
                  transition: 'background 0.2s',
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 11, background: '#fff',
                  position: 'absolute', top: 3,
                  left: dark ? 27 : 3,
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
            </div>
          </div>

          <div style={card}>
            <p style={label}>Row counter increment</p>
            <p style={hint}>How many rows each +/− click counts</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {['1', '2', '4', '6', '8', '10'].map(n => (
                <button key={n} onClick={() => setRowIncrement(n)} style={{
                  padding: '6px 14px', borderRadius: 16, border: '1px solid',
                  borderColor: rowIncrement === n ? 'var(--primary)' : 'var(--border-medium)',
                  background: rowIncrement === n ? 'var(--primary)' : 'transparent',
                  color: rowIncrement === n ? 'var(--primary-text)' : 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 13,
                }}>{n}</button>
              ))}
              <input
                value={['1','2','4','6','8','10'].includes(rowIncrement) ? '' : rowIncrement}
                onChange={e => e.target.value && setRowIncrement(e.target.value)}
                placeholder="custom"
                type="number"
                style={{
                  width: 80, background: 'var(--bg-input)', border: '1px solid',
                  borderColor: !['1','2','4','6','8','10'].includes(rowIncrement) ? 'var(--primary)' : 'var(--border-input)',
                  borderRadius: 16, padding: '6px 12px', color: 'var(--text-body)',
                  fontSize: 13, textAlign: 'center',
                }}
              />
            </div>
          </div>

          <div style={card}>
            <p style={label}>Timer reminder</p>
            <p style={hint}>Show a reminder if a session timer runs longer than this (0 = off)</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {['0', '2', '4', '6', '8'].map(h => (
                <button key={h} onClick={() => setTimerReminder(h)} style={{
                  padding: '6px 14px', borderRadius: 16, border: '1px solid',
                  borderColor: timerReminder === h ? 'var(--primary)' : 'var(--border-medium)',
                  background: timerReminder === h ? 'var(--primary)' : 'transparent',
                  color: timerReminder === h ? 'var(--primary-text)' : 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 13,
                }}>{h === '0' ? 'Off' : `${h}h`}</button>
              ))}
            </div>
          </div>

          <button
            onClick={savePrefs}
            className="btn btn-primary"
            style={{ marginTop: 8 }}
          >
            {saved ? '✓ Saved' : 'Save Preferences'}
          </button>
        </div>
      )}

      {/* ── Access control ───────────────────────────────────────────────── */}
      <p style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>
        Access
      </p>

      {unlocked ? (
        <div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 32 }}>🔓</span>
              <div>
                <p style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600 }}>Full access unlocked</p>
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Signed in as <strong>{userId}</strong></p>
              </div>
            </div>
            <button onClick={lock} style={{
              width: '100%', padding: '10px 16px', borderRadius: 8,
              border: '1px solid var(--border-medium)', background: 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14,
            }}>
              🔒 Lock & restrict access
            </button>
          </div>
          <div style={{ background: 'var(--bg-accent)', borderRadius: 12, padding: 16, borderLeft: '3px solid var(--border-accent)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
              Locking hides all pages except Projects, which becomes read-only.
              The session stays locked until the password is entered again.
            </p>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 32 }}>🔒</span>
              <div>
                <p style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600 }}>Restricted access</p>
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Enter the password to unlock all features.</p>
              </div>
            </div>
            <div style={{ animation: shake ? 'shake 0.4s ease' : 'none' }}>
              <input
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                placeholder="Username"
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                style={{
                  width: '100%', background: 'var(--bg-input)',
                  border: `1px solid ${error ? 'var(--danger-vivid)' : 'var(--border-input)'}`,
                  borderRadius: 8, padding: '12px 14px', color: 'var(--text-body)',
                  fontSize: 16, boxSizing: 'border-box', marginBottom: 8, outline: 'none',
                }}
              />
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                placeholder="Password"
                style={{
                  width: '100%', background: 'var(--bg-input)',
                  border: `1px solid ${error ? 'var(--danger-vivid)' : 'var(--border-input)'}`,
                  borderRadius: 8, padding: '12px 14px', color: 'var(--text-body)',
                  fontSize: 16, boxSizing: 'border-box', marginBottom: 8, outline: 'none',
                }}
              />
            </div>
            {error && <p style={{ color: 'var(--danger-vivid)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button onClick={handleUnlock} disabled={!username.trim() || !password.trim() || loading} style={{
              width: '100%', padding: '12px 16px', borderRadius: 8,
              border: 'none', background: 'var(--primary)', color: 'var(--primary-text)',
              cursor: username.trim() && password.trim() && !loading ? 'pointer' : 'default',
              fontSize: 15, fontWeight: 600,
              opacity: username.trim() && password.trim() && !loading ? 1 : 0.5,
            }}>
              {loading ? 'Checking…' : 'Unlock'}
            </button>
          </div>
          <div style={{ background: 'var(--bg-accent)', borderRadius: 12, padding: 16, borderLeft: '3px solid var(--border-medium)' }}>
            <p style={{ color: 'var(--text-faint)', fontSize: 13, lineHeight: 1.6 }}>
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

function OptionRow({ label: l, hint, options, value, onChange }: {
  label: string; hint?: string;
  options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={card}>
      <p style={label}>{l}</p>
      {hint && <p style={hint_s}>{hint}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)} style={{
            padding: '6px 14px', borderRadius: 16, border: '1px solid',
            borderColor: value === o ? 'var(--primary)' : 'var(--border-medium)',
            background: value === o ? 'var(--primary)' : 'transparent',
            color: value === o ? 'var(--primary-text)' : 'var(--text-muted)',
            cursor: 'pointer', fontSize: 13,
          }}>{o}</button>
        ))}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: 'var(--bg-card)', borderRadius: 12, padding: 16, marginBottom: 10,
  border: '1px solid var(--border-light)',
};
const label: React.CSSProperties = {
  color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, marginBottom: 2,
};
const hint: React.CSSProperties = {
  color: 'var(--text-muted)', fontSize: 13,
};
const hint_s = hint;
