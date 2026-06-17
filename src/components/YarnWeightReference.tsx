import { YARN_WEIGHT_REFERENCE } from '../lib/theme';

export default function YarnWeightReference() {
  return (
    <div className="card" style={{ cursor: 'default', marginBottom: 16, overflowX: 'auto' }}>
      <p className="card-title" style={{ marginBottom: 12 }}>Yarn Weight Reference</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
        <thead>
          <tr style={{ background: 'var(--bg-accent)' }}>
            {['Name', 'Standard', 'Ply', 'Wraps Per Inch', 'Needles'].map(h => (
              <th key={h} style={{
                textAlign: 'left', padding: '8px 10px', color: 'var(--text-accent)',
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {YARN_WEIGHT_REFERENCE.map((row, i) => (
            <tr key={row.name} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-muted)' }}>
              <td style={{ padding: '8px 10px', color: 'var(--text-primary)', fontWeight: 600, borderTop: '1px solid var(--border-light)' }}>{row.name}</td>
              <td style={{ padding: '8px 10px', color: 'var(--text-body)', borderTop: '1px solid var(--border-light)' }}>{row.standard}</td>
              <td style={{ padding: '8px 10px', color: 'var(--text-body)', borderTop: '1px solid var(--border-light)' }}>{row.ply}</td>
              <td style={{ padding: '8px 10px', color: 'var(--text-body)', borderTop: '1px solid var(--border-light)' }}>{row.wpi}</td>
              <td style={{ padding: '8px 10px', color: 'var(--text-accent)', fontWeight: 600, borderTop: '1px solid var(--border-light)' }}>{row.needles}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
