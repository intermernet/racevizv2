import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
// We import `Map` as `MapLibreMap` to avoid conflicting with the built-in JS `Map` data structure.
import { Map as MapLibreMap, Marker, LngLatBounds, NavigationControl, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Import shared types and utility functions
import type { PublicEventData } from '../../types/index.ts';
import { useRaceAnimation } from '../../hooks/useRaceAnimation.ts';
import { getPositionAtTime, calculateSpeedAndHeading, calculateRacePlacing, getCardinalDirection } from '../../utils/MapUtils.ts';

// Import child UI components
import { MapControls } from './controls/MapControls.tsx';
import { TimelineSlider } from './controls/TimelineSlider.tsx';

// Import component-specific styles
import './EventMap.css';
import './RacerMarker.css';

// Get the MapTiler API key from environment variables
const MAPTILER_API_KEY = import.meta.env.VITE_MAPTILER_API_KEY;

// A unique key to identify our custom data layers and sources.
const RACEVIZ_METADATA_KEY = 'raceviz-layer';

interface EventMapProps {
  eventData: PublicEventData;
}

export const EventMap: React.FC<EventMapProps> = ({ eventData }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<{ [racerId: number]: Marker }>({});
  const trackBoundsRef = useRef<LngLatBounds | null>(null);
  const lastIndexRef = useRef<{ [racerId: number]: number }>({});
  const isInitialLoadRef = useRef(true);
  
  const [selectedRacerId, setSelectedRacerId] = useState<number | null>(null);
  const popupRef = useRef<Popup | null>(null);

  const [mapStyle, setMapStyle] = useState(`https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_API_KEY}`);

  const { startTime, endTime } = useMemo(() => {
    let minTime = Infinity;
    let maxTime = -Infinity;
    eventData.paths.forEach(path => {
        if (path.points.length > 0) {
            const firstPointTime = new Date(path.points[0].timestamp).getTime();
            const lastPointTime = new Date(path.points[path.points.length - 1].timestamp).getTime();
            if (firstPointTime < minTime) minTime = firstPointTime;
            if (lastPointTime > maxTime) maxTime = lastPointTime;
        }
    });
    return {
        startTime: minTime === Infinity ? new Date(eventData.event.startDate) : new Date(minTime),
        endTime: maxTime === -Infinity ? new Date(eventData.event.endDate) : new Date(maxTime),
    };
  }, [eventData]);

  // The high-performance animation frame handler.
  const handleAnimationFrame = useCallback((newTime: Date) => {
    if (!eventData) return;
    
    // 1. Update all racer marker positions imperatively.
    for (const path of eventData.paths) {
      const marker = markersRef.current[path.racerId];
      if (!marker) continue;
      const lastIndex = lastIndexRef.current[path.racerId] || 0;
      const positionResult = getPositionAtTime(path, newTime, lastIndex);
      if (positionResult) {
        marker.setLngLat([positionResult.lon, positionResult.lat]);
        lastIndexRef.current[path.racerId] = positionResult.foundIndex;
      }
    }
    
    // 2. If a popup is open, update its position and content imperatively.
    if (selectedRacerId !== null && popupRef.current) {
        const selectedPath = eventData.paths.find(p => p.racerId === selectedRacerId);
        const racerProfile = eventData.users.find(u => u.id === selectedRacerId);
        if (!selectedPath || !racerProfile) return;

        const lastIndex = lastIndexRef.current[selectedRacerId] || 0;
        const posResult = getPositionAtTime(selectedPath, newTime, lastIndex);
        if (!posResult || posResult.foundIndex >= selectedPath.points.length - 1) {
            // Hide popup if racer has finished by removing it from the map.
            if(popupRef.current) popupRef.current.remove();
            popupRef.current = null;
            setSelectedRacerId(null);
            return;
        }
        
        const { speedKph, heading } = calculateSpeedAndHeading(
            selectedPath.points[posResult.foundIndex],
            selectedPath.points[posResult.foundIndex + 1]
        );
        const placings = calculateRacePlacing(eventData.paths, newTime);
        const rank = placings.find(p => p.racerId === selectedRacerId)?.rank;
        const totalRacers = eventData.paths.length;

        const popupHTML = `
          <div class="racer-popup">
            <div class="popup-header" style="background-color: ${selectedPath.trackColor};">${racerProfile.username}</div>
            <div class="popup-content">
              <div><strong>Speed:</strong> ${speedKph.toFixed(1)} km/h</div>
              <div><strong>Heading:</strong> ${heading.toFixed(0)}° (${getCardinalDirection(heading)})</div>
              <div><strong>Position:</strong> ${rank || 'N/A'} / ${totalRacers}</div>
            </div>
          </div>`;
        
        popupRef.current.setLngLat([posResult.lon, posResult.lat]);
        popupRef.current.setHTML(popupHTML);
    }
  }, [eventData, selectedRacerId]);

  // The hook now receives our high-performance callback.
  const { isPlaying, speed, progress, togglePlayPause, setSpeed, scrubTo } = useRaceAnimation({
    startTime,
    endTime,
    onFrame: handleAnimationFrame,
  });

  // --- EFFECT 1: INITIALIZE THE MAP INSTANCE (RUNS ONLY ONCE) ---
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;
    mapRef.current = new MapLibreMap({
      container: mapContainerRef.current,
      style: mapStyle,
      center: [-98.5795, 39.8283],
      zoom: 3,
    });
    mapRef.current.addControl(new NavigationControl(), 'top-right');
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // --- EFFECT 2: MANAGE DATA LAYERS (RUNS WHEN DATA CHANGES) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !eventData) return;

    const addDataToMap = () => {
      if (map.getSource(`track-${eventData.paths[0]?.racerId}`)) return;
      const bounds = new LngLatBounds();
      lastIndexRef.current = {};

      eventData.paths.forEach(path => {
        lastIndexRef.current[path.racerId] = 0;
        if (path.points.length < 2) return;
        
        const sourceId = `track-${path.racerId}`;
        const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
          type: 'Feature', properties: {},
          geometry: { type: 'LineString', coordinates: path.points.map(p => [p.lon, p.lat]) },
        };
        map.addSource(sourceId, { type: 'geojson', data: geojson });
        map.addLayer({
          id: sourceId, type: 'line', source: sourceId,
          metadata: { [RACEVIZ_METADATA_KEY]: true },
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': path.trackColor, 'line-width': 3, 'line-opacity': 0.8 },
        });
        path.points.forEach(p => bounds.extend([p.lon, p.lat]));
      });

      eventData.paths.forEach(path => {
        if (path.points.length === 0) return;
        const racerProfile = eventData.users.find(u => u.id === path.racerId);
        const el = document.createElement('div');
        el.className = 'racer-marker';
        el.style.backgroundImage = `url(${racerProfile?.avatarUrl || 'https://via.placeholder.com/40'})`;
        el.style.borderColor = path.trackColor;
        el.addEventListener('click', () => setSelectedRacerId(prevId => (prevId === path.racerId ? null : path.racerId)));
        const startPos = path.points[0];
        const marker = new Marker({ element: el }).setLngLat([startPos.lon, startPos.lat]).addTo(map);
        markersRef.current[path.racerId] = marker;
      });
      
      if (!bounds.isEmpty()) {
        trackBoundsRef.current = bounds;
        map.fitBounds(bounds, { padding: 60, duration: 0 });
      }
    };

    map.once('load', addDataToMap);

    return () => {
      if (map.isStyleLoaded()) {
        Object.values(markersRef.current).forEach(marker => marker.remove());
        markersRef.current = {};
        eventData?.paths.forEach(path => {
          const sourceId = `track-${path.racerId}`;
          if (map.getLayer(sourceId)) map.removeLayer(sourceId);
          if (map.getSource(sourceId)) map.removeSource(sourceId);
        });
      }
    };
  }, [Map, eventData]);

  // --- EFFECT 3: THE DEFINITIVE STYLE CHANGE HANDLER ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateMapStyle = async () => {
      const currentStyle = map.getStyle();
      if (!currentStyle || !currentStyle.sources) return;

      const racevizSources = new Map<string, any>();
      const racevizLayers: maplibregl.LayerSpecification[] = [];

      for (const layer of currentStyle.layers) {
        if ((layer.metadata as any)?.[RACEVIZ_METADATA_KEY]) {
          racevizLayers.push(layer);
          const sourceId = layer.type !== 'background' && layer.source;
          if (sourceId && currentStyle.sources[sourceId]) {
            racevizSources.set(sourceId, currentStyle.sources[sourceId]);
          }
        }
      }
      
      const newStyle = await fetch(mapStyle).then(res => res.json());
      newStyle.sources = { ...newStyle.sources, ...Object.fromEntries(racevizSources) };
      newStyle.layers.push(...racevizLayers);
      map.setStyle(newStyle);
    };
    updateMapStyle();
  }, [Map, mapStyle]);

  // --- EFFECT 4: MANAGE POPUP CREATION/DESTRUCTION ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    
    if (selectedRacerId !== null) {
      if (!popupRef.current) {
        popupRef.current = new Popup({
            closeButton: true,
            closeOnClick: false,
            anchor: 'bottom',
            offset: 30,
        }).addTo(map);
        popupRef.current.on('close', () => setSelectedRacerId(null));
      }
    } else {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    }
  }, [Map, selectedRacerId]);

  const handleResetView = () => {
    if (mapRef.current && trackBoundsRef.current) {
      mapRef.current.fitBounds(trackBoundsRef.current, { padding: 60, duration: 1000 });
    }
  };

  return (
    <div className="event-map-wrapper">
      <div ref={mapContainerRef} className="map-container" />
      <TimelineSlider
        progress={progress}
        totalDurationMs={endTime.getTime() - startTime.getTime()}
        onScrub={scrubTo}
      />
      <MapControls
        isPlaying={isPlaying}
        onPlayPause={togglePlayPause}
        speed={speed}
        onSpeedChange={setSpeed}
        onResetView={handleResetView}
        onStyleChange={setMapStyle}
        maptilerApiKey={MAPTILER_API_KEY}
      />
    </div>
  );
};