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
            ⚙️
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
          </>}
        </Routes>
      </main>
    </div>
  );
}
