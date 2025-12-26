export enum Role {
  WEREWOLF = 'Werewolf',
  VILLAGER = 'Villager',
  SEER = 'Seer',
  WITCH = 'Witch',
  HUNTER = 'Hunter',
}

export enum Team {
  GOOD = 'Good',
  BAD = 'Bad',
}

export enum Phase {
  SETUP = 'SETUP',
  REVEAL = 'REVEAL',
  NIGHT_WEREWOLF = 'NIGHT_WEREWOLF',
  NIGHT_WITCH = 'NIGHT_WITCH',
  NIGHT_SEER = 'NIGHT_SEER',
  DAY_ANNOUNCE = 'DAY_ANNOUNCE',
  DAY_DISCUSS = 'DAY_DISCUSS',
  DAY_VOTE = 'DAY_VOTE',
  HUNTER_ACTION = 'HUNTER_ACTION',
  GAME_OVER = 'GAME_OVER',
}

export interface Player {
  id: number;
  role: Role;
  personality: string;
  isHuman: boolean;
  isAlive: boolean;
  isWolfTarget?: boolean; // For night calculation
  isProtected?: boolean; // Witch save
  isPoisoned?: boolean; // Witch poison
  voteTarget?: number | null; // Who they voted for
}

export interface GameState {
  players: Player[];
  phase: Phase;
  dayCount: number;
  logs: GameLogEntry[];
  witchPotions: {
    save: boolean; // true if available
    poison: boolean; // true if available
  };
  currentTurnPlayerId?: number; // For reveal or discussion loops
  nightActionData: {
    wolvesTarget: number | null;
    seerCheck: number | null;
    seerResult: string | null; // "Good" or "Bad" for UI display
    witchSaveUsed: boolean;
    witchPoisonTarget: number | null;
  };
  // Tracking votes during the day
  humanVotes: Record<number, number>; // playerId -> targetId
  winner?: Team | null;
}

export interface GameLogEntry {
  id: string;
  type: 'system' | 'chat' | 'action';
  author?: string; // Player ID or "God"
  content: string;
}

export type AiActionType = 'VOTE' | 'KILL' | 'SAVE' | 'POISON' | 'CHECK' | 'SPEAK';
