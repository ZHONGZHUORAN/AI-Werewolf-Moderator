import React from 'react';
import { Role } from '../types';

interface PlayerCardProps {
  role?: Role;
  isRevealed: boolean;
  onClick: () => void;
  playerNumber: number;
}

const PlayerCard: React.FC<PlayerCardProps> = ({ role, isRevealed, onClick, playerNumber }) => {
  return (
    <div 
      onClick={onClick}
      className={`
        relative w-48 h-72 rounded-xl cursor-pointer transition-all duration-500 transform hover:scale-105 shadow-2xl
        ${isRevealed ? 'rotate-y-180' : ''}
      `}
      style={{ perspective: '1000px' }}
    >
      {/* Card Back */}
      <div className={`
        absolute w-full h-full backface-hidden rounded-xl flex flex-col items-center justify-center
        bg-gradient-to-br from-indigo-900 to-slate-900 border-2 border-indigo-500/30
        ${isRevealed ? 'hidden' : 'block'}
      `}>
        <span className="text-4xl font-bold text-indigo-200 opacity-50">#{playerNumber}</span>
        <div className="mt-4 text-indigo-400 text-sm uppercase tracking-widest font-semibold">Tap to Reveal</div>
      </div>

      {/* Card Front */}
      <div className={`
        absolute w-full h-full backface-hidden rounded-xl flex flex-col items-center justify-center p-4 text-center
        bg-gradient-to-b from-gray-800 to-gray-900 border-2 border-white/10
        ${!isRevealed ? 'hidden' : 'block'}
      `}>
        <div className="text-5xl mb-4">
          {role === Role.WEREWOLF && '🐺'}
          {role === Role.VILLAGER && '🧑‍🌾'}
          {role === Role.SEER && '🔮'}
          {role === Role.WITCH && '🧪'}
          {role === Role.HUNTER && '🔫'}
        </div>
        <h3 className={`text-2xl font-bold mb-2 ${role === Role.WEREWOLF ? 'text-red-500' : 'text-green-400'}`}>
          {role}
        </h3>
        <p className="text-xs text-gray-400">Tap to Hide</p>
      </div>
    </div>
  );
};

export default PlayerCard;
