import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from './lib/auth';
import { APP_VERSION } from './lib/version';
import ProjectsPage from './pages/Projects';
import PatternsPage from './pages/Patterns';
import StashPage from './pages/Stash';
import ToolsPage from './pages/Tools';
import AbbreviationsPage from './pages/Abbreviations';
import SettingsPage from './pages/Settings';
import GeneratePage from './pages/Generate';
import TimelinePage from './pages/Timeline';
import SubstitutePage from './pages/Substitute';
import GaugePage from './pages/Gauge';

const WORKSHOP_PATHS = ['/gauge', '/generate', '/substitute', '/abbreviations'];

export default function App() {
  const { unlocked } = useAuth();
  const location = useLocation();
  const [workshopOpen, setWorkshopOpen] = useState(
    WORKSHOP_PATHS.some(p => location.pathname.startsWith(p))
  );

  const isWorkshopActive = WORKSHOP_PATHS.some(p => location.pathname.startsWith(p));

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="logo">🧶 Loophole</div>

        <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Projects</NavLink>

        {unlocked && <>
          <NavLink to="/patterns" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Patterns</NavLink>
          <NavLink to="/stash" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Stash</NavLink>
          <NavLink to="/tools" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Tools</NavLink>
          <NavLink to="/timeline" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>📅 Timeline</NavLink>

          {/* Workshop collapsible section */}
          <button
            onClick={() => setWorkshopOpen(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '8px 16px', borderRadius: 8,
              color: isWorkshopActive ? '#A78BFA' : '#9CA3AF',
              fontSize: 14, fontWeight: isWorkshopActive ? 600 : 500,
              marginTop: 4,
            }}
          >
            <span>🛠 Workshop</span>
            <span style={{ fontSize: 10, opacity: 0.6 }}>{workshopOpen ? '▲' : '▼'}</span>
          </button>

          {workshopOpen && (
            <div style={{ paddingLeft: 12 }}>
              <NavLink to="/gauge" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} style={{ fontSize: 13 }}>Gauge & Needles</NavLink>
              <NavLink to="/generate" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} style={{ fontSize: 13 }}>✨ Generate Pattern</NavLink>
              <NavLink to="/substitute" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} style={{ fontSize: 13 }}>🧶 Yarn Substitute</NavLink>
              <NavLink to="/abbreviations" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} style={{ fontSize: 13 }}>Abbreviations</NavLink>
            </div>
          )}
        </>}

        <div style={{ flex: 1 }} />
        <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          {unlocked ? '🔓 Settings' : '🔒 Unlock'}
        </NavLink>
        <div style={{ padding: '8px 16px', color: '#6B7280', fontSize: 11, textAlign: 'center' }}>
          v{APP_VERSION}
        </div>
      </nav>

      <main className="content">
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {unlocked && <>
            <Route path="/patterns" element={<PatternsPage />} />
            <Route path="/stash" element={<StashPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/gauge" element={<GaugePage />} />
            <Route path="/generate" element={<GeneratePage />} />
            <Route path="/substitute" element={<SubstitutePage />} />
            <Route path="/abbreviations" element={<AbbreviationsPage />} />
          </>}
        </Routes>
      </main>
    </div>
  );
}
