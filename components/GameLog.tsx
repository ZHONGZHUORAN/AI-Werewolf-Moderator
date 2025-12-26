import React, { useEffect, useRef } from 'react';
import { GameLogEntry, Role } from '../types';

interface GameLogProps {
  logs: GameLogEntry[];
  myPlayerId?: number;
}

const GameLog: React.FC<GameLogProps> = ({ logs, myPlayerId }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-slate-900/50 rounded-lg p-4 overflow-y-auto scrollbar-hide border border-slate-700/50">
      {logs.map((log) => (
        <div key={log.id} className={`mb-3 flex ${log.type === 'system' ? 'justify-center' : 'justify-start'}`}>
          {log.type === 'system' ? (
            <div className="bg-slate-800 text-slate-300 text-xs px-3 py-1 rounded-full border border-slate-700">
              {log.content}
            </div>
          ) : (
            <div className={`max-w-[85%] flex flex-col ${log.author === `Player ${myPlayerId}` ? 'items-end ml-auto' : 'items-start'}`}>
               <span className="text-[10px] text-slate-500 mb-0.5 ml-1">{log.author}</span>
               <div className={`
                 px-3 py-2 rounded-2xl text-sm shadow-md
                 ${log.author === `Player ${myPlayerId}` 
                   ? 'bg-indigo-600 text-white rounded-br-none' 
                   : 'bg-slate-700 text-slate-200 rounded-bl-none'}
                 ${log.author === 'God' ? 'bg-yellow-900/40 text-yellow-200 border border-yellow-700/30' : ''}
               `}>
                 {log.content}
               </div>
            </div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default GameLog;
