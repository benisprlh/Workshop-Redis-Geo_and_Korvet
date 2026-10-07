import { useEffect, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ExerciseId } from '@fieldops/contracts';
import OverviewPage from '../features/overview/OverviewPage';
import AssignmentPage from '../features/assignment/AssignmentPage';
import MonitoringPage from '../features/monitoring/MonitoringPage';
import WorkshopDrawer from '../features/workshop/WorkshopDrawer';
import { AppShell, type Page } from './AppShell';
import { useOperations } from './useOperations';

const validPages = ['overview', 'geo', 'monitor'];
export default function App() {
  const { state, online, error, reload } = useOperations();
  const [page, setPage] = useState<Page>(() =>
    validPages.includes(location.hash.slice(1)) ? (location.hash.slice(1) as Page) : 'overview',
  );
  const [drawer, setDrawer] = useState(false);
  const [exercise, setExercise] = useState<ExerciseId>();
  const [initialAsset, setInitialAsset] = useState<string>();
  useEffect(() => {
    const onHash = () => {
      const next = location.hash.slice(1);
      if (validPages.includes(next)) setPage(next as Page);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const open = useCallback((id?: ExerciseId) => {
    setExercise(id);
    setDrawer(true);
  }, []);
  const close = useCallback(() => setDrawer(false), []);
  function navigate(next: Page, assetId?: string) {
    setInitialAsset(assetId);
    setPage(next);
    location.hash = next;
    window.scrollTo(0, 0);
  }
  return (
    <>
      <AppShell page={page} state={state} online={online} navigate={navigate} openWorkshop={open}>
        {error && (
          <div className="global-error" role="alert">
            <span>{error}</span>
            <button className="text-button" onClick={() => void reload()}>
              <RefreshCw size={14} />
              Coba lagi
            </button>
          </div>
        )}
        {state ? (
          page === 'overview' ? (
            <OverviewPage state={state} navigate={navigate} open={open} />
          ) : page === 'geo' ? (
            <AssignmentPage state={state} open={open} />
          ) : (
            <MonitoringPage state={state} initialAsset={initialAsset} open={open} />
          )
        ) : (
          <div className="app-loading">
            <div className="loading-line" />
            <h1>Menyiapkan konsol</h1>
            <p>Memuat metadata aset dan koneksi lab.</p>
          </div>
        )}
      </AppShell>
      {drawer && state && <WorkshopDrawer state={state} active={exercise} close={close} />}
    </>
  );
}
