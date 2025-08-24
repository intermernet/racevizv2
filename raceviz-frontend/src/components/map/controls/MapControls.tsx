import React from 'react';
import './MapControls.css';

interface MapControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  speed: number;
  onSpeedChange: (newSpeed: number) => void;
  onResetView: () => void;
  onStyleChange: (styleUrl: string) => void;
  maptilerApiKey: string;
}

export const MapControls: React.FC<MapControlsProps> = ({
  isPlaying,
  onPlayPause,
  speed,
  onSpeedChange,
  onResetView,
  onStyleChange,
  maptilerApiKey
}) => {
  const mapStyles = {
    Streets: `https://api.maptiler.com/maps/streets/style.json?key=${maptilerApiKey}`,
    Satellite: `https://api.maptiler.com/maps/satellite/style.json?key=${maptilerApiKey}`,
    Topographic: `https://api.maptiler.com/maps/topo/style.json?key=${maptilerApiKey}`,
  };

  return (
    <div className="map-controls-container">
      {/* Playback Controls */}
      <div className="control-group playback-controls">
        <button onClick={onPlayPause} className="play-pause-btn">
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <div className="speed-control">
          <label htmlFor="speed-slider">{speed.toFixed(1)}x</label>
          <input
            id="speed-slider"
            type="range"
            min="0.5"
            max="20"
            step="0.5"
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          />
        </div>
      </div>

      {/* View & Style Controls */}
      <div className="control-group view-controls">
         <button onClick={onResetView}>Reset View</button>
         <select onChange={(e) => onStyleChange(e.target.value)} defaultValue={mapStyles.Streets}>
             <option value={mapStyles.Streets}>Streets</option>
             <option value={mapStyles.Satellite}>Satellite</option>
             <option value={mapStyles.Topographic}>Topographic</option>
         </select>
      </div>
    </div>
  );
};