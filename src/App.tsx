import { Routes, Route, NavLink } from 'react-router-dom';
import { useAuth } from './lib/auth';
import ProjectsPage from './pages/Projects';
import PatternsPage from './pages/Patterns';
import StashPage from './pages/Stash';
import ToolsPage from './pages/Tools';
import GaugePage from './pages/Gauge';
import AbbreviationsPage from './pages/Abbreviations';
import SettingsPage from './pages/Settings';

export default function App() {
  const { unlocked } = useAuth();

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="logo">🧶 Loophole</div>
        <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Projects</NavLink>
        {unlocked && <>
          <NavLink to="/patterns" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Patterns</NavLink>
          <NavLink to="/stash" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Stash</NavLink>
          <NavLink to="/tools" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Tools</NavLink>
          <NavLink to="/gauge" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Gauge</NavLink>
          <NavLink to="/abbreviations" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Abbreviations</NavLink>
        </>}
        <div style={{ flex: 1 }} />
        <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          {unlocked ? '🔓 Settings' : '🔒 Unlock'}
        </NavLink>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {unlocked && <>
            <Route path="/patterns" element={<PatternsPage />} />
            <Route path="/stash" element={<StashPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/gauge" element={<GaugePage />} />
            <Route path="/abbreviations" element={<AbbreviationsPage />} />
          </>}
        </Routes>
      </main>
    </div>
  );
}
