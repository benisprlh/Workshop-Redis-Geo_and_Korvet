import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Circle,
  Polyline,
  Marker,
  Tooltip,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import { Map as MapIcon, Expand, RotateCw } from 'lucide-react';
import type { Asset, Technician, NearbyTechnician, Position } from '@fieldops/contracts';

const attribution =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
function icon(kind: 'asset' | 'tech' | 'point', selected: boolean, result = false, busy = false) {
  return L.divIcon({
    className: 'marker-container',
    html: `<span class="map-marker ${kind} ${selected ? 'selected' : ''} ${result ? 'result' : ''} ${busy ? 'busy' : ''}">${kind === 'tech' ? '<i></i>' : kind === 'asset' ? '<b></b>' : '<em></em>'}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}
function Events({
  onPoint,
  reset,
  bounds,
}: {
  onPoint: (p: Position) => void;
  reset: number;
  bounds: L.LatLngBounds;
}) {
  const map = useMapEvents({
    click: (event) => onPoint({ longitude: event.latlng.lng, latitude: event.latlng.lat }),
  });
  const currentBounds = useRef(bounds);
  currentBounds.current = bounds;
  useEffect(() => {
    // Posisi baru tidak menggeser peta yang sedang diperiksa; tombol area memakai bounds terbaru.
    map.fitBounds(currentBounds.current, { padding: [30, 54] });
  }, [map, reset]);
  const previous = useRef<[number, number]>([0, 0]);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (Math.abs(width - previous.current[0]) > 1 || Math.abs(height - previous.current[1]) > 1) {
        previous.current = [width, height];
        map.invalidateSize();
      }
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}
function MapControls() {
  const map = useMap();
  useEffect(() => {
    const control = L.control.scale({ imperial: false, position: 'bottomleft' });
    control.addTo(map);
    map.attributionControl.addAttribution(attribution);
    return () => {
      control.remove();
      map.attributionControl.removeAttribution(attribution);
    };
  }, [map]);
  return null;
}
export default function FieldMap({
  assets,
  technicians,
  center,
  assetId,
  selectedId,
  results,
  radiusKm,
  searched,
  onAsset,
  onTech,
  onPoint,
}: {
  assets: Asset[];
  technicians: Technician[];
  center: Position;
  assetId: string;
  selectedId: string;
  results: NearbyTechnician[];
  radiusKm: number;
  searched: boolean;
  onAsset: (id: string) => void;
  onTech: (id: string) => void;
  onPoint: (p: Position) => void;
}) {
  const [mode, setMode] = useState<'online' | 'offline'>('online');
  const [tileStatus, setTileStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [reset, setReset] = useState(0);
  const failedTiles = useRef(false);
  const selected = technicians.find((t) => t.id === selectedId);
  const bounds = useMemo(
    () =>
      L.latLngBounds([...assets, ...technicians].map((p) => [p.latitude, p.longitude])).pad(0.12),
    [assets, technicians],
  );
  useEffect(() => {
    if (mode !== 'online' || tileStatus !== 'loading') return;
    const timer = window.setTimeout(() => {
      failedTiles.current = true;
      setTileStatus('error');
      setMode('offline');
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [mode, tileStatus, attempt]);
  function retryTiles() {
    failedTiles.current = false;
    setAttempt((value) => value + 1);
    setTileStatus('loading');
    setMode('online');
  }
  return (
    <div className="map-wrap" data-map-mode={mode} data-map-status={tileStatus}>
      <div className="map-tools">
        <span>
          <MapIcon size={15} />
          Jakarta Pusat <small>Indonesia</small>
        </span>
        {mode === 'offline' && (
          <button className="text-button" onClick={retryTiles}>
            <RotateCw size={13} /> Muat ulang peta
          </button>
        )}
        <button
          className="icon-button"
          title="Tampilkan seluruh area"
          aria-label="Tampilkan seluruh area"
          onClick={() => setReset((v) => v + 1)}
        >
          <Expand size={16} />
        </button>
      </div>
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [30, 54] }}
        zoomSnap={0.25}
        zoomControl={true}
        minZoom={4}
        maxZoom={19}
        attributionControl={true}
        className="field-map"
      >
        {mode === 'online' && (
          <TileLayer
            key={attempt}
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxNativeZoom={19}
            keepBuffer={1}
            eventHandlers={{
              loading: () => setTileStatus('loading'),
              load: () => {
                if (!failedTiles.current) setTileStatus('ready');
              },
              tileerror: () => {
                failedTiles.current = true;
                setTileStatus('error');
                setMode('offline');
              },
            }}
          />
        )}
        <Events onPoint={onPoint} reset={reset} bounds={bounds} />
        <MapControls />
        {searched && (
          <Circle
            center={[center.latitude, center.longitude]}
            radius={radiusKm * 1000}
            pathOptions={{ color: '#2563eb', weight: 1, dashArray: '5 5', fillOpacity: 0.025 }}
          />
        )}
        {selected && (
          <Polyline
            positions={[
              [center.latitude, center.longitude],
              [selected.latitude, selected.longitude],
            ]}
            pathOptions={{ color: '#2563eb', weight: 2, dashArray: '5 5' }}
          />
        )}
        {assets.map((a) => (
          <Marker
            key={a.id}
            position={[a.latitude, a.longitude]}
            icon={icon('asset', assetId === a.id)}
            eventHandlers={{ click: () => onAsset(a.id) }}
          >
            <Tooltip key={mode} direction="top" offset={[0, -9]} permanent={mode === 'offline'}>
              {a.name} · {a.area}
            </Tooltip>
          </Marker>
        ))}
        {technicians.map((t) => (
          <Marker
            key={t.id}
            position={[t.latitude, t.longitude]}
            icon={icon(
              'tech',
              selectedId === t.id,
              results.some((r) => r.id === t.id),
              t.status === 'busy',
            )}
            eventHandlers={{ click: () => onTech(t.id) }}
          >
            <Tooltip direction="top" offset={[0, -9]}>
              {t.name} · {t.area} · {t.status === 'available' ? 'Tersedia' : 'Bertugas'}
            </Tooltip>
          </Marker>
        ))}
        {!assetId && (
          <Marker position={[center.latitude, center.longitude]} icon={icon('point', true)}>
            <Tooltip>Titik gangguan</Tooltip>
          </Marker>
        )}
      </MapContainer>
      <div className="map-legend">
        <span>
          <i className="legend-tech" /> Tersedia
        </span>
        <span>
          <i className="legend-busy" /> Bertugas
        </span>
        <span>
          <i className="legend-asset" /> Aset
        </span>
        <span>
          <i className="legend-line" /> Penghubung lokasi
        </span>
        <small>Aset & teknisi workshop</small>
      </div>
      {mode === 'offline' && (
        <div className="map-notice" role="status">
          Peta jalan tidak tersambung. Grid menampilkan koordinat dan wilayah yang sama.
        </div>
      )}
      {mode === 'online' && tileStatus === 'loading' && (
        <div className="map-loading" role="status">
          Memuat peta…
        </div>
      )}
    </div>
  );
}
