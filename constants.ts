import { Role } from './types';

// Standard 9-player setup
export const STANDARD_ROLES = [
  Role.WEREWOLF, Role.WEREWOLF, Role.WEREWOLF,
  Role.VILLAGER, Role.VILLAGER, Role.VILLAGER,
  Role.SEER, Role.WITCH, Role.HUNTER
];

export const PERSONALITIES = [
  "Aggressive", "Cautious", "Deceptive", "Logical", 
  "Emotional", "Chaotic", "Quiet", "Analytical", "Paranoid", "Noble"
];

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  [Role.WEREWOLF]: "You are a Werewolf. Each night, wake up and choose a victim to kill. Win when the good guys are outnumbered.",
  [Role.VILLAGER]: "You are a Villager. You have no special abilities. Find the wolves during the day and vote them out.",
  [Role.SEER]: "You are the Seer. Each night, you can check the identity of one player to see if they are Good or Bad.",
  [Role.WITCH]: "You are the Witch. You have two potions: one to save a victim, one to poison a player. You can use each once.",
  [Role.HUNTER]: "You are the Hunter. If you die (except by poison), you can take one person with you.",
};

export const TEAM_MAP: Record<Role, 'Good' | 'Bad'> = {
  [Role.WEREWOLF]: 'Bad',
  [Role.VILLAGER]: 'Good',
  [Role.SEER]: 'Good',
  [Role.WITCH]: 'Good',
  [Role.HUNTER]: 'Good',
};
