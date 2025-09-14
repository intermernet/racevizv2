import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
// We import `Map` as `MapLibreMap` to avoid conflicting with the built-in JS `Map` data structure.
import { Map as MapLibreMap, LngLatBounds, NavigationControl, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Import shared types and utility functions
import type { PublicEventData, LeaderboardItem } from '../../types/index.ts';
import { useRaceAnimation } from '../../hooks/useRaceAnimation.ts';
import { getPositionAtTime, calculateSpeedAndHeading, calculateRacePlacing, getCardinalDirection } from '../../utils/mapUtils.ts';

// Import child UI components
import { MapControls } from './controls/MapControls.tsx';
import { TimelineSlider } from './controls/TimelineSlider.tsx';
import { Leaderboard } from './leaderboard/Leaderboard.tsx';

// Import component-specific styles
import './EventMap.css';
import './RacerMarker.css';

// Get the MapTiler API key from environment variables
const MAPTILER_API_KEY = import.meta.env.VITE_MAPTILER_API_KEY;
const API_BASE_URL = import.meta.env.VITE_API_URL;
const RACEVIZ_METADATA_KEY = 'raceviz-layer';

interface EventMapProps {
  eventData: PublicEventData;
}

// Create a new type that intersects LayerSpecification with our custom metadata.
// This is the correct way to add properties to a union type.
// type RaceVizLayerSpecification = LayerSpecification & {
//   metadata?: { [key: string]: any };
// };

export const EventMap: React.FC<EventMapProps> = ({ eventData }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const racerPopupsRef = useRef<{ [racerId: number]: Popup }>({});
  const trackBoundsRef = useRef<LngLatBounds | null>(null);
  const lastIndexRef = useRef<{ [racerId: number]: number }>({});
  const [isMapReady, setIsMapReady] = useState(false); // Gatekeeper for data-dependent effects
  
  const [selectedRacerId, setSelectedRacerId] = useState<number | null>(null);
  const infoPopupRef = useRef<Popup | null>(null);

  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardItem[]>([]);

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
        startTime: minTime === Infinity ? new Date(eventData.event.startDate || Date.now()) : new Date(minTime),
        endTime: maxTime === -Infinity ? new Date(eventData.event.endDate || Date.now()) : new Date(maxTime),
    };
  }, [eventData]);

  const {
    currentTime,
    isPlaying,
    speed,
    progress,
    togglePlayPause,
    setSpeed,
    scrubTo,
  } = useRaceAnimation({ startTime, endTime });

  // --- AUTHORITATIVE MAP EFFECT ---
  // This single effect manages the entire lifecycle of the map instance.
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: mapStyle, // Initial style
      center: [-98.5795, 39.8283],
      zoom: 3,
    });
    mapRef.current = map;

    const cleanupPopups = () => {
      Object.values(racerPopupsRef.current).forEach(popup => popup.remove());
      racerPopupsRef.current = {};
    };

    const setupMapData = () => {
      if (!mapRef.current) return; // Guard against cleanup race conditions
      const currentMap = mapRef.current;

      // Only clean up popups. Layers and sources are automatically cleared by map.setStyle().
      cleanupPopups();

      const bounds = new LngLatBounds();
      lastIndexRef.current = {};

      eventData.paths.forEach(path => {
        lastIndexRef.current[path.racerId] = 0;
        if (path.points.length < 2) return;

        const sourceId = `track-${path.racerId}`;
        currentMap.addSource(sourceId, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.points.map(p => [p.lon, p.lat]) } } });
        currentMap.addLayer({
          id: sourceId, type: 'line', source: sourceId,
          metadata: { [RACEVIZ_METADATA_KEY]: true },
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': path.trackColor, 'line-width': 3, 'line-opacity': 0.8 },
        });
        path.points.forEach(p => bounds.extend([p.lon, p.lat]));
      });

      eventData.paths.forEach(path => {
        if (path.points.length === 0) return;
        const racer = eventData.racers.find(r => r.id === path.racerId);

        const el = document.createElement('img');
        el.className = 'racer-marker';
        
        const fallbackAvatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(racer?.racerName || 'R')}&background=333&color=fff&size=40`;
        let finalAvatarUrl = racer?.trackAvatarUrl || fallbackAvatarUrl;

        // Replicate the logic from UserAvatar.tsx to handle relative paths
        if (finalAvatarUrl.startsWith('/')) {
          finalAvatarUrl = `${API_BASE_URL.replace('/api/v1', '')}${finalAvatarUrl}`;
        }

        el.src = finalAvatarUrl;
        el.alt = `${racer?.racerName || 'Racer'}'s avatar`;
        el.onerror = () => { el.src = fallbackAvatarUrl; };

        el.addEventListener('click', () => setSelectedRacerId(prevId => (prevId === path.racerId ? null : path.racerId)));

        const startPos = path.points[0];
        const markerPopup = new Popup({
          closeButton: false, closeOnClick: false, anchor: 'center', className: 'racer-marker-popup'
        }).setLngLat([startPos.lon, startPos.lat]).setDOMContent(el).addTo(currentMap);
        racerPopupsRef.current[path.racerId] = markerPopup;
      });

      if (!bounds.isEmpty()) {
        trackBoundsRef.current = bounds;
        currentMap.fitBounds(bounds, { padding: 60, duration: 0 });
      }

      setIsMapReady(true);
    };

    const onMapLoad = () => {
      setupMapData();
    };

    map.on('load', onMapLoad);
    map.addControl(new NavigationControl(), 'top-right');

    return () => {
      map.off('load', onMapLoad);
      map.remove();
      mapRef.current = null;
    };
  }, [eventData, mapStyle]); // Re-run this entire effect when eventData or mapStyle changes

  // --- EFFECT 2: UNIFIED ANIMATION FOR MARKERS AND POPUPS ---
  // Note: Renumbered from 3 to 2
  useEffect(() => {
    if (!isMapReady || !eventData || !eventData.racers || !eventData.users) return;

    // Calculate placings once for use throughout this effect.
    const placings = calculateRacePlacing(eventData.paths, new Date(currentTime));

    // Update all racer "marker" popups
    for (const path of eventData.paths) {
      const markerPopup = racerPopupsRef.current[path.racerId];
      if (!markerPopup) continue;
      const lastIndex = lastIndexRef.current[path.racerId] || 0;
      const positionResult = getPositionAtTime(path, new Date(currentTime), lastIndex);
      if (positionResult) {
        markerPopup.setLngLat([positionResult.lon, positionResult.lat]);
        lastIndexRef.current[path.racerId] = positionResult.foundIndex;
      }
    }

    // Update the z-index of racer markers based on their current rank.
    const totalRacers = eventData.paths.length;
    placings.forEach(place => {
      const popup = racerPopupsRef.current[place.racerId];
      if (popup) {
        // Higher rank (lower number) gets a higher z-index.
        popup.getElement().style.zIndex = String(totalRacers - place.rank);
      }
    });
    
    // If leaderboard is open, calculate and update its data
    if (isLeaderboardOpen) {
        const newLeaderboardData: LeaderboardItem[] = [];
        for (const place of placings) {
            const racer = eventData.racers.find(r => r.id === place.racerId);
            if (!racer) continue;
            const path = eventData.paths.find(p => p.racerId === place.racerId);
            if (!path) continue;
            const posResult = getPositionAtTime(path, new Date(currentTime), lastIndexRef.current[path.racerId] || 0);
            let speedKph = 0;
            if (posResult && posResult.foundIndex < path.points.length - 1) {
                speedKph = calculateSpeedAndHeading(
                    path.points[posResult.foundIndex],
                    path.points[posResult.foundIndex + 1]
                ).speedKph;
            }
            newLeaderboardData.push({
                id: racer.id, rank: place.rank, name: racer.racerName,
                avatarUrl: racer.trackAvatarUrl, 
                trackColor: path.trackColor, 
                speedKph: speedKph,
            });
        }
        // Deep comparison to prevent re-renders if data is the same
        if (JSON.stringify(newLeaderboardData) !== JSON.stringify(leaderboardData)) {
          setLeaderboardData(newLeaderboardData);
        }
    }
    
    // If an info popup is open, update its position and content
    if (selectedRacerId !== null && infoPopupRef.current) {
        const selectedRacer = eventData.racers.find(r => r.id === selectedRacerId);
        if (!selectedRacer) return;
        const selectedPath = eventData.paths.find(p => p.racerId === selectedRacerId);
        const racerProfile = eventData.users.find(u => u.id === selectedRacer.uploaderUserId);
        if (!selectedPath || !racerProfile) return;
        const lastIndex = lastIndexRef.current[selectedRacerId] || 0;
        const posResult = getPositionAtTime(selectedPath, new Date(currentTime), lastIndex);
        if (!posResult || posResult.foundIndex >= selectedPath.points.length - 1) {
            if (infoPopupRef.current) infoPopupRef.current.remove();
            infoPopupRef.current = null;
            setSelectedRacerId(null);
            return;
        }
        const { speedKph, heading } = calculateSpeedAndHeading(
            selectedPath.points[posResult.foundIndex],
            selectedPath.points[posResult.foundIndex + 1]
        );
        const rank = placings.find(p => p.racerId === selectedRacerId)?.rank;
        const totalRacers = eventData.paths.length;

        const popupHTML = `
          <div class="racer-popup">
            <div class="popup-header" style="background-color: ${selectedPath.trackColor};">${selectedRacer.racerName}</div>
            <div class="popup-content">
              <div><strong>Speed:</strong> ${speedKph.toFixed(1)} km/h</div>
              <div><strong>Heading:</strong> ${heading.toFixed(0)}° (${getCardinalDirection(heading)})</div>
              <div><strong>Position:</strong> ${rank || 'N/A'} / ${totalRacers}</div>
            </div>
          </div>`;
        
        infoPopupRef.current.setLngLat([posResult.lon, posResult.lat]);
        infoPopupRef.current.setHTML(popupHTML);
    }
  }, [currentTime, eventData, selectedRacerId, isLeaderboardOpen, isMapReady, leaderboardData]);

  // --- EFFECT 3: MANAGE INFO POPUP CREATION/DESTRUCTION ---
  // Note: Renumbered from 4 to 3
  useEffect(() => {
    const map = mapRef.current; // No need for isMapReady here, as it depends on selectedRacerId which is user-driven
    if (!map) return;
    
    if (selectedRacerId !== null) {
      if (!infoPopupRef.current) {
        infoPopupRef.current = new Popup({
            closeButton: true, closeOnClick: false, anchor: 'bottom', offset: 30,
        }).addTo(map);
        infoPopupRef.current.on('close', () => setSelectedRacerId(null));
      }
    } else {
      if (infoPopupRef.current) {
        infoPopupRef.current.remove();
        infoPopupRef.current = null;
      }
    }
  }, [selectedRacerId]);

  const handleResetView = () => {
    if (mapRef.current && trackBoundsRef.current) {
      mapRef.current.fitBounds(trackBoundsRef.current, { padding: 60, duration: 1000 });
    }
  };

  const handleCloseLeaderboard = useCallback(() => setIsLeaderboardOpen(false), []);

  return (
    <div className="event-map-wrapper">
      <div ref={mapContainerRef} className="map-container" />
      <button 
        className="leaderboard-toggle-btn" 
        onClick={() => setIsLeaderboardOpen(true)}
        title="Show Leaderboard"
      >
        🏆
      </button>
      <Leaderboard 
        data={leaderboardData}
        isOpen={isLeaderboardOpen}
        onClose={handleCloseLeaderboard}
      />
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
