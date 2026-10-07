import { useState, type ReactNode } from 'react';
import { LayoutDashboard, MapPin, Activity, PanelRightOpen, BookOpen, Menu } from 'lucide-react';
import type { Snapshot } from '@fieldops/contracts';

export type Page = 'overview' | 'geo' | 'monitor';
const pages = [
  { id: 'overview' as const, label: 'Ringkasan', icon: LayoutDashboard },
  { id: 'geo' as const, label: 'Penugasan Lapangan', icon: MapPin },
  { id: 'monitor' as const, label: 'Monitoring Aset', icon: Activity },
];
export function AppShell({
  page,
  state,
  online,
  navigate,
  openWorkshop,
  children,
}: {
  page: Page;
  state?: Snapshot;
  online: boolean;
  navigate: (page: Page) => void;
  openWorkshop: () => void;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const passed = state?.exercises.filter((exercise) => exercise.status === 'passed').length || 0;
  function select(next: Page) {
    navigate(next);
    setMenu(false);
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? 'mobile-open' : ''}`}>
        <a className="wordmark" href="#overview" onClick={() => select('overview')}>
          <span className="brand-symbol">F</span>FieldOps
        </a>
        <div className="workspace-label">
          <span className="workspace-dot" />
          Lingkungan simulasi
        </div>
        <nav aria-label="Navigasi utama">
          {pages.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={page === item.id ? 'page' : undefined}
              className={page === item.id ? 'active' : ''}
              onClick={() => select(item.id)}
            >
              <item.icon size={18} />
              {item.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="sidebar-help" onClick={() => openWorkshop()}>
            <BookOpen size={17} />
            <span>
              Panduan workshop<small>Geospatial & streaming</small>
            </span>
          </button>
          <div className="sidebar-version">
            <span>Data simulasi</span>
            <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="app-header">
          <button
            className="icon-button mobile-menu"
            aria-label="Buka navigasi"
            onClick={() => setMenu((value) => !value)}
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumbs">
            Konsol operasional<span>/</span>
            <strong>{pages.find((item) => item.id === page)?.label}</strong>
          </div>
          <div className="header-actions">
            <span className="live-indicator">
              <i className={`dot ${online ? 'green' : ''}`} />
              {online ? 'Dashboard tersambung' : 'Menghubungkan…'}
            </span>
            <button className="button secondary workshop-button" onClick={() => openWorkshop()}>
              <PanelRightOpen size={16} />
              Mode workshop<span>{passed}/4</span>
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
        <footer className="app-footer">
          <span>Wilayah nyata Indonesia · aset, teknisi & sensor workshop</span>
          <span>
            {state?.assets.length || 0} aset · {state?.technicians.length || 0} teknisi
          </span>
        </footer>
      </div>
    </div>
  );
}
