import { Routes, Route, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { APP_VERSION } from './lib/version';
import DashboardPage from './pages/Dashboard';
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

import NextPatternPage from './pages/NextPattern';

export default function App() {
  const { unlocked } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app">
      {/* Persistent header */}
      <header className="app-header">
        <span className="header-version">v{APP_VERSION}</span>
        <a className="header-logo" onClick={() => navigate('/')} href="#">
          <span className="header-logo-dot" />
          Loophole
        </a>
        <div className="header-settings">
          <button onClick={() => navigate('/settings')} aria-label="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
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
            <Route path="/next-pattern" element={<NextPatternPage />} />
          </>}
        </Routes>
      </main>
    </div>
  );
}
