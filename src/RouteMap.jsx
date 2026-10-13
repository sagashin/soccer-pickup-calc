import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

// 外部データ（OSMの施設名など）をHTMLに埋め込む前にエスケープする
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MAP_LAYERS = [
  {
    id: 'gmap-traffic',
    label: 'Google 渋滞状況',
    url: 'https://mt1.google.com/vt/lyrs=m,traffic&x={x}&y={y}&z={z}&hl=ja',
    attribution: 'Map data &copy; Google',
  },
  {
    id: 'gmap-road',
    label: 'Google 標準',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ja',
    attribution: 'Map data &copy; Google',
  },
  {
    id: 'railway',
    label: '鉄道・路線図',
    url: 'https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
    attribution: '&copy; OpenRailwayMap, OpenStreetMap',
  },
  {
    id: 'gmap-hybrid',
    label: '航空写真',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=ja',
    attribution: 'Map data &copy; Google',
  },
  {
    id: 'osm',
    label: 'OSM',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
  },
];

export default function RouteMap({
  originCoords,
  destCoords,
  routeGeometry,
  nearbyParkings = [],
  nearbyConveniences = [],
  nearbyStations = [],
  spotFilter = 'all', // 'all' | 'parking' | 'convenience' | 'none'
  selectedSpotId = null,
  onSelectSpot = null,
  transportMode = 'car', // 'car' | 'train'
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const routeLayerGroupRef = useRef(null);
  const spotsLayerGroupRef = useRef(null);
  const stationsLayerGroupRef = useRef(null);
  const spotMarkersMapRef = useRef(new Map());

  const [activeLayerId, setActiveLayerId] = useState(() => (transportMode === 'train' ? 'gmap-road' : 'gmap-traffic'));

  // 初期マップ生成
  // 初期マップ生成
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([35.65, 139.6], 11);

      const initialLayer = MAP_LAYERS.find((l) => l.id === activeLayerId) || MAP_LAYERS[0];
      tileLayerRef.current = L.tileLayer(initialLayer.url, {
        attribution: initialLayer.attribution,
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);

      routeLayerGroupRef.current = L.layerGroup().addTo(mapInstanceRef.current);
      spotsLayerGroupRef.current = L.layerGroup().addTo(mapInstanceRef.current);
      stationsLayerGroupRef.current = L.layerGroup().addTo(mapInstanceRef.current);
    }
  }, []);

  // レイヤー切り替え
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const selected = MAP_LAYERS.find((l) => l.id === activeLayerId) || MAP_LAYERS[0];

    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }

    tileLayerRef.current = L.tileLayer(selected.url, {
      attribution: selected.attribution,
      maxZoom: 19,
    }).addTo(mapInstanceRef.current);
  }, [activeLayerId]);

  // 出発地・目的地ピンとルートポリライン描画
  useEffect(() => {
    if (!mapInstanceRef.current || !routeLayerGroupRef.current) return;

    const map = mapInstanceRef.current;
    const layers = routeLayerGroupRef.current;
    layers.clearLayers();

    if (originCoords && destCoords) {
      const originIcon = L.divIcon({
        className: 'custom-pin-origin',
        html: `<div style="background:#0284c7;color:white;font-weight:bold;font-size:11px;padding:3px 9px;border-radius:9999px;border:2px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.4);white-space:nowrap;transform:translate(-50%,-50%);display:flex;align-items:center;gap:3px;">
          <span>🏠</span><span>出発</span>
        </div>`,
        iconSize: [52, 26],
      });

      const destIcon = L.divIcon({
        className: 'custom-pin-dest',
        html: `<div style="background:#dc2626;color:white;font-weight:bold;font-size:11px;padding:3px 9px;border-radius:9999px;border:2px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.4);white-space:nowrap;transform:translate(-50%,-50%);display:flex;align-items:center;gap:3px;">
          <span>⚽</span><span>目的地</span>
        </div>`,
        iconSize: [64, 26],
      });

      L.marker([originCoords.lat, originCoords.lon], { icon: originIcon }).addTo(layers);
      L.marker([destCoords.lat, destCoords.lon], { icon: destIcon }).addTo(layers);

      if (routeGeometry && routeGeometry.coordinates && routeGeometry.coordinates.length > 0) {
        // routeGeometry.isLatLng が true の場合は [lat, lon] そのまま、偽の場合は GeoJSON [lon, lat]
        const latLngs = routeGeometry.isLatLng
          ? routeGeometry.coordinates
          : routeGeometry.coordinates.map(([lon, lat]) => [lat, lon]);

        const routeColor = transportMode === 'train' ? '#6366f1' : '#1a73e8';

        // 白縁 + 鮮やかライン
        L.polyline(latLngs, {
          color: '#ffffff',
          weight: 8,
          opacity: 0.9,
        }).addTo(layers);

        const routeLine = L.polyline(latLngs, {
          color: routeColor,
          weight: 5,
          opacity: 0.95,
          dashArray: transportMode === 'train' ? '8, 6' : undefined,
        }).addTo(layers);

        map.fitBounds(routeLine.getBounds(), { padding: [36, 36] });
      } else {
        const bounds = L.latLngBounds(
          [originCoords.lat, originCoords.lon],
          [destCoords.lat, destCoords.lon]
        );
        map.fitBounds(bounds, { padding: [36, 36] });
      }
    }
  }, [originCoords, destCoords, routeGeometry, transportMode]);

  // 周辺スポット（駐車場・コンビニ）ピンの描画
  useEffect(() => {
    if (!mapInstanceRef.current || !spotsLayerGroupRef.current) return;

    const spotsGroup = spotsLayerGroupRef.current;
    spotsGroup.clearLayers();
    spotMarkersMapRef.current.clear();

    if (spotFilter === 'none') return;

    const visibleParkings = spotFilter === 'all' || spotFilter === 'parking' ? nearbyParkings : [];
    const visibleConvs = spotFilter === 'all' || spotFilter === 'convenience' ? nearbyConveniences : [];

    // 1. 駐車場ピン (車モード時または明示選択時)
    visibleParkings.forEach((p) => {
      const isFacility = p.type === 'facility';
      const bgColor = isFacility ? '#059669' : '#d97706';
      const iconHtml = `<div style="background:${bgColor};color:white;font-weight:800;font-size:10px;padding:2px 6px;border-radius:9999px;border:1.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);white-space:nowrap;transform:translate(-50%,-50%);display:flex;align-items:center;gap:2px;">
        <span>🅿️</span><span>${p.walkMinutes}分</span>
      </div>`;

      const marker = L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: `custom-spot-parking-${p.id}`,
          html: iconHtml,
          iconSize: [44, 22],
        }),
        zIndexOffset: 100,
      });

      const popupHtml = `
        <div style="font-family:sans-serif;font-size:12px;line-height:1.4;max-width:210px;">
          <div style="font-size:10px;font-weight:bold;color:${isFacility ? '#059669' : '#d97706'};margin-bottom:2px;">
            ${escapeHtml(p.badgeLabel)} ${p.feeLabel ? `• ${escapeHtml(p.feeLabel)}` : ''}
          </div>
          <div style="font-weight:bold;font-size:13px;color:#0f172a;margin-bottom:4px;">
            ${escapeHtml(p.name)}
          </div>
          <div style="font-size:11px;color:#475569;margin-bottom:8px;">
            目的地から <strong>約${escapeHtml(p.distanceMeters)}m</strong> (徒歩約${escapeHtml(p.walkMinutes)}分)
          </div>
          <a href="${escapeHtml(p.googleNavUrl)}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;width:100%;text-align:center;background:#059669;color:white;padding:5px 8px;border-radius:8px;font-weight:bold;font-size:11px;text-decoration:none;">
            Googleマップでナビ
          </a>
        </div>
      `;
      marker.bindPopup(popupHtml);

      marker.on('click', () => {
        if (onSelectSpot) onSelectSpot(p);
      });

      marker.addTo(spotsGroup);
      spotMarkersMapRef.current.set(p.id, marker);
    });

    // 2. コンビニピン
    visibleConvs.forEach((c) => {
      const iconHtml = `<div style="background:#2563eb;color:white;font-weight:800;font-size:10px;padding:2px 6px;border-radius:9999px;border:1.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);white-space:nowrap;transform:translate(-50%,-50%);display:flex;align-items:center;gap:2px;">
        <span>🏪</span><span>${c.walkMinutes}分</span>
      </div>`;

      const marker = L.marker([c.lat, c.lon], {
        icon: L.divIcon({
          className: `custom-spot-conv-${c.id}`,
          html: iconHtml,
          iconSize: [44, 22],
        }),
        zIndexOffset: 90,
      });

      const popupHtml = `
        <div style="font-family:sans-serif;font-size:12px;line-height:1.4;max-width:210px;">
          <div style="font-size:10px;font-weight:bold;color:#2563eb;margin-bottom:2px;">
            🏪 ${escapeHtml(c.brandLabel)}
          </div>
          <div style="font-weight:bold;font-size:13px;color:#0f172a;margin-bottom:4px;">
            ${escapeHtml(c.name)}
          </div>
          <div style="font-size:11px;color:#475569;margin-bottom:8px;">
            目的地から <strong>約${escapeHtml(c.distanceMeters)}m</strong> (徒歩約${escapeHtml(c.walkMinutes)}分)
          </div>
          <a href="${escapeHtml(c.googleNavUrl)}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;width:100%;text-align:center;background:#2563eb;color:white;padding:5px 8px;border-radius:8px;font-weight:bold;font-size:11px;text-decoration:none;">
            Googleマップでナビ
          </a>
        </div>
      `;
      marker.bindPopup(popupHtml);

      marker.on('click', () => {
        if (onSelectSpot) onSelectSpot(c);
      });

      marker.addTo(spotsGroup);
      spotMarkersMapRef.current.set(c.id, marker);
    });
  }, [nearbyParkings, nearbyConveniences, spotFilter, onSelectSpot]);

  // 最寄り駅ピンの描画（電車モード時または駅がある場合）
  useEffect(() => {
    if (!mapInstanceRef.current || !stationsLayerGroupRef.current) return;

    const stationsGroup = stationsLayerGroupRef.current;
    stationsGroup.clearLayers();

    if (!Array.isArray(nearbyStations) || nearbyStations.length === 0) return;

    nearbyStations.forEach((station) => {
      const iconHtml = `<div style="background:#4f46e5;color:white;font-weight:800;font-size:10px;padding:2px 7px;border-radius:9999px;border:1.5px solid white;box-shadow:0 2px 7px rgba(0,0,0,0.4);white-space:nowrap;transform:translate(-50%,-50%);display:flex;align-items:center;gap:3px;">
        <span>🚉</span><span>${escapeHtml(station.name)}</span><span style="opacity:0.85;">(歩${station.walkMinutes}分)</span>
      </div>`;

      const marker = L.marker([station.lat, station.lon], {
        icon: L.divIcon({
          className: `custom-spot-station-${station.id}`,
          html: iconHtml,
          iconSize: [60, 22],
        }),
        zIndexOffset: 120,
      });

      const popupHtml = `
        <div style="font-family:sans-serif;font-size:12px;line-height:1.4;max-width:220px;">
          <div style="font-size:10px;font-weight:bold;color:#4f46e5;margin-bottom:2px;">
            🚉 最寄り駅・路線
          </div>
          <div style="font-weight:bold;font-size:14px;color:#0f172a;margin-bottom:3px;">
            ${escapeHtml(station.name)}
          </div>
          <div style="font-size:11px;color:#475569;margin-bottom:8px;">
            会場まで <strong>約${station.distanceMeters}m</strong> (徒歩約${station.walkMinutes}分)
          </div>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(station.name)}&travelmode=transit"
             target="_blank" rel="noopener noreferrer"
             style="display:inline-block;width:100%;text-align:center;background:#4f46e5;color:white;padding:5px 8px;border-radius:8px;font-weight:bold;font-size:11px;text-decoration:none;">
            この駅までの乗換案内
          </a>
        </div>
      `;
      marker.bindPopup(popupHtml);
      marker.addTo(stationsGroup);
    });
  }, [nearbyStations]);

  // スポット選択時のズーム & ポップアップ自動オープン
  useEffect(() => {
    if (!selectedSpotId || !mapInstanceRef.current) return;
    const marker = spotMarkersMapRef.current.get(selectedSpotId);
    if (marker) {
      const map = mapInstanceRef.current;
      map.panTo(marker.getLatLng(), { animate: true, duration: 0.5 });
      marker.openPopup();
    }
  }, [selectedSpotId]);

  const totalVisibleSpots =
    (spotFilter === 'all' || spotFilter === 'parking' ? nearbyParkings.length : 0) +
    (spotFilter === 'all' || spotFilter === 'convenience' ? nearbyConveniences.length : 0);

  return (
    <div className="space-y-2">
      {/* マップ表示モード切り替えタブ */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {MAP_LAYERS.map((layer) => {
            const active = activeLayerId === layer.id;
            return (
              <button
                key={layer.id}
                type="button"
                data-testid={`map-layer-${layer.id}`}
                onClick={() => setActiveLayerId(layer.id)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold border transition ${
                  active
                    ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {layer.label}
              </button>
            );
          })}
        </div>

        {/* 周辺スポット表示バッジ */}
        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">
          {transportMode === 'train' && nearbyStations.length > 0 && (
            <span className="text-indigo-700">🚉{nearbyStations.length}駅</span>
          )}
          {totalVisibleSpots > 0 && (
            <>
              {transportMode === 'car' && <span className="text-emerald-700">🅿️{nearbyParkings.length}</span>}
              <span className="text-sky-700">🏪{nearbyConveniences.length}</span>
            </>
          )}
        </div>
      </div>

      {/* マップ本体 */}
      <div className="relative w-full h-72 rounded-2xl overflow-hidden border border-slate-200 shadow-inner bg-slate-100">
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>

      {transportMode === 'car' && activeLayerId === 'gmap-traffic' && (
        <div className="flex items-center justify-center gap-3 text-[10px] font-bold text-slate-500 pt-0.5">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-1.5 rounded-sm bg-emerald-500 inline-block" /> スムーズ
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-1.5 rounded-sm bg-amber-500 inline-block" /> やや混雑
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-1.5 rounded-sm bg-red-600 inline-block" /> 渋滞
          </span>
        </div>
      )}

      {transportMode === 'train' && (
        <div className="flex items-center justify-center gap-3 text-[10px] font-bold text-indigo-700 pt-0.5">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-1.5 rounded-sm bg-indigo-500 inline-block" /> 🚉 電車・公共交通ルート
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-1.5 rounded-sm bg-indigo-300 inline-block" /> 🚶 徒歩・連絡区間
          </span>
        </div>
      )}
    </div>
  );
}
