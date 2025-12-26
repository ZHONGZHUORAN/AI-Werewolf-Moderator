import { GoogleGenAI, Type } from "@google/genai";
import { Player, Role, AiActionType, Phase } from "../types";
import { TEAM_MAP, ROLE_DESCRIPTIONS } from "../constants";

// Ensure API key is present; in a real app, handle this more gracefully.
const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const MODEL_NAME = 'gemini-3-flash-preview';

interface AiDecisionContext {
  me: Player;
  players: Player[];
  phase: Phase;
  history: string[]; // Recent chat/logs
  nightInfo?: string; // Info specific to role (e.g. "Player 3 was killed")
}

export const getAiSpeech = async (context: AiDecisionContext): Promise<string> => {
  const { me, players, phase, history } = context;
  
  const livingPlayers = players.filter(p => p.isAlive).map(p => `Player ${p.id}`).join(', ');
  const recentLogs = history.slice(-10).join('\n');

  const systemPrompt = `
    You are playing a game of Werewolf (Mafia). 
    You are Player ${me.id}.
    Role: ${me.role}
    Personality: ${me.personality}
    
    Your Goal: ${TEAM_MAP[me.role] === 'Bad' ? 'Deceive the villagers, pretend to be good, kill them all.' : 'Find the wolves and vote them out.'}
    
    Current Phase: ${phase}
    Alive Players: ${livingPlayers}
    
    Recent Events:
    ${recentLogs}
    
    Instruction: Write a short, single sentence statement to the group. 
    Act according to your personality (${me.personality}).
    If you are a Werewolf, lie if necessary to blend in. 
    If you are Good, share your suspicions or defend yourself.
    Keep it conversational and under 20 words.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: systemPrompt,
    });
    return response.text?.trim() || "I am thinking...";
  } catch (error) {
    console.error("AI Speech Gen Error", error);
    return "I have nothing to say right now.";
  }
};

export const getAiAction = async (
  context: AiDecisionContext, 
  actionType: AiActionType
): Promise<{ targetId: number | null; reason: string }> => {
  const { me, players, history, nightInfo } = context;
  
  // Construct a concise view of the board
  const boardState = players.map(p => ({
    id: p.id,
    status: p.isAlive ? "ALIVE" : "DEAD",
    // Only show role if it's me or if I'm a wolf and they are a wolf
    knownRole: (p.id === me.id) || (me.role === Role.WEREWOLF && p.role === Role.WEREWOLF) ? p.role : "UNKNOWN"
  }));

  const systemPrompt = `
    You are Player ${me.id} (${me.role}). Personality: ${me.personality}.
    Action Required: ${actionType}
    
    Board State: ${JSON.stringify(boardState)}
    Recent History: ${history.slice(-5).join(' | ')}
    Special Info: ${nightInfo || "None"}
    
    Rules:
    - If KILL/VOTE/CHECK/POISON: Choose a target ID from ALIVE players.
    - If SAVE: Choose the target ID to save (if you want), or null.
    - If action is POISON and you don't want to use it yet, return null.
    - If HUNTER_SHOOT: You are dead. Pick someone to take with you.
    - Wolves know each other. Don't kill teammates unless necessary.
    - Seers check unknown people.
    
    Act according to your personality.
    Return purely JSON with no markdown:
    { "targetId": number | null, "reason": "string" }
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            targetId: { type: Type.INTEGER, nullable: true },
            reason: { type: Type.STRING }
          }
        }
      }
    });

    const jsonText = response.text || "{}";
    const result = JSON.parse(jsonText);
    return { targetId: result.targetId ?? null, reason: result.reason || "Strategic decision." };

  } catch (error) {
    console.error("AI Action Error", error);
    // Fallback: Pick random alive player different from self
    const aliveOthers = players.filter(p => p.isAlive && p.id !== me.id);
    const randomTarget = aliveOthers.length > 0 ? aliveOthers[Math.floor(Math.random() * aliveOthers.length)].id : null;
    return { targetId: randomTarget, reason: "Fallback random choice due to error." };
  }
};
