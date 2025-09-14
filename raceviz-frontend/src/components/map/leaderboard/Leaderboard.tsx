import React from 'react';
import type { LeaderboardItem } from '../../../types/index.ts';
import { UserAvatar } from '../../ui/UserAvatar.tsx';
import './Leaderboard.css';

interface LeaderboardProps {
  data: LeaderboardItem[];
  isOpen: boolean;
  onClose: () => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ data, isOpen, onClose }) => {
  const itemHeight = 48; // Corresponds to padding + avatar height. Adjust if styling changes.

  return (
    // The `data-is-open` attribute allows us to control the visibility with CSS transitions.
    <div className="leaderboard-container" data-is-open={isOpen}>
      <header className="leaderboard-header">
        <h3>Leaderboard</h3>
        <button className="leaderboard-close-btn" onClick={onClose} title="Close leaderboard">
          &times;
        </button>
      </header>
      <ul 
        className="leaderboard-list"
        style={{ height: `${data.length * itemHeight}px` }}
      >
        {data.map((racer) => (
          <li
            key={racer.id}
            className="leaderboard-item"
            // Assign rank for styling and position for animation
            data-rank={racer.rank}
            style={{ transform: `translateY(${(racer.rank - 1) * itemHeight}px)` }}
          >
            <div className="racer-rank-identity">
              <span className="racer-rank">{racer.rank}</span>
              <div className="racer-color-swatch" style={{ backgroundColor: racer.trackColor }} />
              <UserAvatar
                avatarUrl={racer.avatarUrl}
                name={racer.name}
                className="racer-avatar"
              />
              <span className="racer-name">{racer.name}</span>
            </div>
            <div className="racer-speed">
              {racer.speedKph.toFixed(1)} km/h
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};