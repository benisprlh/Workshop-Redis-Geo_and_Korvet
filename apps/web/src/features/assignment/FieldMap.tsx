import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapContainer,
  ImageOverlay,
  TileLayer,
  Circle,
  Polyline,
  Marker,
  Tooltip,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import { Map as MapIcon, Expand } from 'lucide-react';
import type { Asset, Technician, NearbyTechnician, Position } from '@fieldops/contracts';

const bounds: L.LatLngBoundsExpression = [
  [-7.05, 109.96],
  [-6.976, 110.058],
];
const schematic = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 980 740"><defs><pattern id="grid" width="70" height="70" patternUnits="userSpaceOnUse"><path d="M70 0H0V70" fill="none" stroke="#dce3e6" stroke-width="1"/></pattern></defs><rect width="980" height="740" fill="#edf1f0"/><rect width="980" height="740" fill="url(#grid)"/><path d="M0 90H165V0M300 0V176H0M495 0V200H980M820 0V740M0 410H315V740M0 620H980M580 340V740" stroke="#e2e8e5" stroke-width="28" fill="none"/><path d="M0 270Q300 315 470 276T980 275M395 0Q375 265 430 440T490 740M0 500Q240 482 420 510T980 470" stroke="#cdd5d8" stroke-width="20" fill="none"/><path d="M0 270Q300 315 470 276T980 275M395 0Q375 265 430 440T490 740M0 500Q240 482 420 510T980 470" stroke="#fff" stroke-width="16" fill="none"/><path d="M685 0Q605 155 708 290T745 740" stroke="#c8dbe3" stroke-width="31" fill="none"/><path d="M80 90h152v91H80zM590 520h120v130H590zM858 322h88v73h-88z" fill="#dfe9e0"/><g font-family="Arial,sans-serif" font-size="16" fill="#8a999d" letter-spacing="2"><text x="110" y="380">AREA BARAT</text><text x="445" y="380">AREA PUSAT</text><text x="825" y="205">AREA TIMUR</text><text x="365" y="670">AREA SELATAN</text><text x="310" y="90">AREA UTARA</text></g><g font-family="Arial,sans-serif" font-size="11" fill="#9aa5a7"><text x="15" y="730">SKEMA KOORDINAT SIMULASI · BUKAN PETA FASILITAS</text></g></svg>`;
const image = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(schematic)}`;
function icon(kind: 'asset' | 'tech' | 'point', selected: boolean, result = false, busy = false) {
  return L.divIcon({
    className: 'marker-container',
    html: `<span class="map-marker ${kind} ${selected ? 'selected' : ''} ${result ? 'result' : ''} ${busy ? 'busy' : ''}">${kind === 'tech' ? '<i></i>' : kind === 'asset' ? '<b></b>' : '<em></em>'}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}
function Events({ onPoint, reset }: { onPoint: (p: Position) => void; reset: number }) {
  const map = useMapEvents({
    click: (event) => onPoint({ longitude: event.latlng.lng, latitude: event.latlng.lat }),
  });
  useEffect(() => {
    map.fitBounds(bounds, { padding: [14, 14] });
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
function Scale() {
  const map = useMap();
  useEffect(() => {
    const control = L.control.scale({ imperial: false, position: 'bottomleft' });
    control.addTo(map);
    return () => {
      control.remove();
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
  const [tiles, setTiles] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [reset, setReset] = useState(0);
  const selected = technicians.find((t) => t.id === selectedId);
  return (
    <div className="map-wrap">
      <div className="map-tools">
        <span>
          <MapIcon size={15} />
          {tiles ? 'OpenStreetMap' : 'Peta skematis'}
        </span>
        <button
          className="text-button"
          onClick={() => {
            setTileError(false);
            setTiles(!tiles);
          }}
        >
          {tiles ? 'Gunakan skema' : 'Peta jalan'}
        </button>
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
        boundsOptions={{ padding: [14, 14] }}
        zoomSnap={0.25}
        zoomControl={true}
        minZoom={10}
        maxZoom={17}
        attributionControl={true}
        className="field-map"
      >
        <ImageOverlay url={image} bounds={bounds} />
        {tiles && (
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            eventHandlers={{
              tileerror: () => {
                setTileError(true);
                setTiles(false);
              },
            }}
          />
        )}
        <Events onPoint={onPoint} reset={reset} />
        <Scale />
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
            <Tooltip direction="top" offset={[0, -9]}>
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
              {t.name} · {t.status === 'available' ? 'Tersedia' : 'Bertugas'}
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
        <small>Semua posisi simulasi</small>
      </div>
      {tileError && (
        <div className="map-notice" role="status">
          Tile tidak tersedia. Peta skematis tetap dapat dipakai.
        </div>
      )}
    </div>
  );
}
