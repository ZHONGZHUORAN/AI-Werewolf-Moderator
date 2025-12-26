import React, { useState, useEffect, useCallback, useRef } from 'react';
import { STANDARD_ROLES, ROLE_DESCRIPTIONS, TEAM_MAP, PERSONALITIES } from './constants';
import { Player, Phase, GameState, GameLogEntry, Role, Team, AiActionType } from './types';
import PlayerCard from './components/PlayerCard';
import GameLog from './components/GameLog';
import { getAiAction, getAiSpeech } from './services/geminiService';

const App: React.FC = () => {
  // --- Setup State ---
  const [humanCount, setHumanCount] = useState<number>(1);
  const [setupComplete, setSetupComplete] = useState(false);

  // --- Game State ---
  const [gameState, setGameState] = useState<GameState>({
    players: [],
    phase: Phase.SETUP,
    dayCount: 1,
    logs: [{ id: 'init', type: 'system', content: 'Welcome to AI Werewolf. Configure the game to start.' }],
    witchPotions: { save: true, poison: true },
    nightActionData: { wolvesTarget: null, seerCheck: null, seerResult: null, witchSaveUsed: false, witchPoisonTarget: null },
    humanVotes: {},
  });

  // --- UI State ---
  const [currentRevealIndex, setCurrentRevealIndex] = useState(0);
  const [isCardRevealed, setIsCardRevealed] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  
  // Witch UI Step State (0: waiting, 1: save?, 2: poison?)
  const [witchUiStep, setWitchUiStep] = useState(0);

  // --- Speech Synthesis Helper ---
  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // Cancel previous
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  // Helper to add logs
  const addLog = (content: string, type: 'system' | 'chat' | 'action' = 'system', author?: string) => {
    setGameState(prev => ({
      ...prev,
      logs: [...prev.logs, { id: Date.now().toString() + Math.random(), type, content, author }]
    }));
  };

  // --- Initialization ---
  const startGame = () => {
    // Shuffle Roles
    const shuffledRoles = [...STANDARD_ROLES].sort(() => Math.random() - 0.5);
    
    // Create Players
    const newPlayers: Player[] = shuffledRoles.map((role, index) => ({
      id: index + 1,
      role,
      personality: PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)],
      isHuman: index < humanCount,
      isAlive: true,
    }));

    setGameState(prev => ({
      ...prev,
      players: newPlayers,
      phase: Phase.REVEAL,
      logs: [...prev.logs, { id: 'start', type: 'system', content: 'Game Started! Pass the device to Player 1.' }]
    }));
    setSetupComplete(true);
  };

  // --- Reveal Phase Logic ---
  const handleRevealClick = () => {
    if (isCardRevealed) {
      setIsCardRevealed(false);
      const nextIndex = currentRevealIndex + 1;
      if (nextIndex < humanCount) {
        setCurrentRevealIndex(nextIndex);
      } else {
        addLog("Everyone has seen their role. Night falls...", 'system');
        speak("Everyone has seen their role. Night falls. Everyone close your eyes.");
        setTimeout(() => {
             setGameState(prev => ({ ...prev, phase: Phase.NIGHT_WEREWOLF }));
        }, 4000);
      }
    } else {
      setIsCardRevealed(true);
    }
  };

  // --- Core Game Logic Helpers ---

  const checkWinCondition = useCallback((currentPlayers: Player[]) => {
    const wolves = currentPlayers.filter(p => p.isAlive && p.role === Role.WEREWOLF).length;
    const good = currentPlayers.filter(p => p.isAlive && TEAM_MAP[p.role] === 'Good').length;
    const gods = currentPlayers.filter(p => p.isAlive && (p.role === Role.WITCH || p.role === Role.SEER || p.role === Role.HUNTER)).length;
    const villagers = currentPlayers.filter(p => p.isAlive && p.role === Role.VILLAGER).length;

    if (wolves === 0) return Team.GOOD;
    if (wolves >= good) return Team.BAD;
    if (gods === 0 || villagers === 0) return Team.BAD;
    return null;
  }, []);

  const getNextSpeaker = (players: Player[], currentId: number): number | undefined => {
    const alive = players.filter(p => p.isAlive).sort((a, b) => a.id - b.id);
    const currIdx = alive.findIndex(p => p.id === currentId);
    if (currIdx === -1) return alive[0]?.id; 
    if (currIdx === alive.length - 1) return undefined; 
    return alive[currIdx + 1].id;
  };

  const processDeathsAndContinue = (prevState: GameState, deadIds: number[], nextPhase: Phase): GameState => {
      let currentPlayers = [...prevState.players];
      let hunterTriggered = false;
      let hunterId = -1;
      let newLogs = [...prevState.logs];

      // Mark dead
      currentPlayers = currentPlayers.map(p => {
        if (deadIds.includes(p.id) && p.isAlive) {
          if (p.role === Role.HUNTER) {
             if (prevState.nightActionData.witchPoisonTarget === p.id) {
               // Poisoned, cannot shoot
             } else {
               hunterTriggered = true;
               hunterId = p.id;
             }
          }
          return { ...p, isAlive: false };
        }
        return p;
      });

      // Check win immediately
      const winner = checkWinCondition(currentPlayers);
      if (winner) {
        return { ...prevState, players: currentPlayers, phase: Phase.GAME_OVER, winner };
      }

      // If Hunter triggered
      if (hunterTriggered) {
         const msg = `Player ${hunterId} (Hunter) died! They can take someone with them.`;
         newLogs.push({ id: Date.now().toString() + Math.random(), type: 'system', content: msg });
         speak(msg);
         return { 
             ...prevState, 
             players: currentPlayers, 
             phase: Phase.HUNTER_ACTION, 
             currentTurnPlayerId: hunterId,
             logs: newLogs
         };
      }

      // Setup for Day Discussion if next phase is discuss
      let nextTurnPlayerId = undefined;
      if (nextPhase === Phase.DAY_DISCUSS) {
          nextTurnPlayerId = getNextSpeaker(currentPlayers, 0);
          if (!nextTurnPlayerId) {
             return { ...prevState, players: currentPlayers, phase: Phase.DAY_VOTE };
          }
      }

      return { 
          ...prevState, 
          players: currentPlayers, 
          phase: nextPhase,
          currentTurnPlayerId: nextTurnPlayerId,
          // Reset turn vars if going to Night (new cycle)
          nightActionData: nextPhase === Phase.NIGHT_WEREWOLF ? 
            { wolvesTarget: null, seerCheck: null, seerResult: null, witchSaveUsed: false, witchPoisonTarget: null } : 
            prevState.nightActionData,
          humanVotes: {}, 
          logs: newLogs,
          witchPotions: nextPhase === Phase.NIGHT_WEREWOLF ? prevState.witchPotions : prevState.witchPotions
      };
  };

  // --- Audio & Phase Manager Effect ---
  // This ensures audio cues play exactly ONCE when the phase changes.
  useEffect(() => {
      if (gameState.phase === Phase.NIGHT_WEREWOLF) {
          addLog("Werewolves, wake up...", 'system');
          speak("Werewolves, wake up. Choose your target.");
      } else if (gameState.phase === Phase.NIGHT_WITCH) {
          setWitchUiStep(1);
          addLog("Witch, wake up...", 'system');
          speak("Witch, wake up. I will show you who died. You may use your potions.");
      } else if (gameState.phase === Phase.NIGHT_SEER) {
          addLog("Seer, wake up...", 'system');
          speak("Seer, wake up. Choose a player to inspect.");
      } else if (gameState.phase === Phase.DAY_ANNOUNCE) {
          // Logic for announcing deaths
          const { wolvesTarget, witchSaveUsed, witchPoisonTarget } = gameState.nightActionData;
          let deadIds: number[] = [];
          if (wolvesTarget && !witchSaveUsed) deadIds.push(wolvesTarget);
          if (witchPoisonTarget) deadIds.push(witchPoisonTarget);
          
          const msg = deadIds.length > 0 
              ? `The sun rises. Player ${deadIds.join(', ')} died last night.`
              : "The sun rises. Everyone survived the night!";
              
          addLog(msg, 'system');
          speak(msg);
          
          // Transition to Discussion after announcement
          setTimeout(() => {
              setGameState(curr => {
                  if (curr.phase !== Phase.DAY_ANNOUNCE) return curr; // Safety check
                  const next = processDeathsAndContinue(curr, deadIds, Phase.DAY_DISCUSS);
                  if (next.phase === Phase.DAY_DISCUSS) {
                      return { ...next, dayCount: curr.dayCount + 1 };
                  }
                  return next; 
              });
          }, 6000);
      }
  }, [gameState.phase]);


  // --- Transition Helpers (Outbound) ---
  
  const finishWerewolfPhase = (targetId: number | null) => {
      setGameState(prev => ({
          ...prev,
          nightActionData: { ...prev.nightActionData, wolvesTarget: targetId }
      }));
      speak("Werewolves, close your eyes.");
      setTimeout(() => {
          setGameState(prev => ({ ...prev, phase: Phase.NIGHT_WITCH }));
      }, 4000); 
  };

  const finishWitchPhase = () => {
      speak("Witch, close your eyes.");
      setTimeout(() => {
          setGameState(prev => ({ ...prev, phase: Phase.NIGHT_SEER }));
      }, 4000);
  };

  const finishSeerPhase = () => {
      speak("Seer, close your eyes.");
      setTimeout(() => {
          setGameState(prev => ({ ...prev, phase: Phase.DAY_ANNOUNCE }));
      }, 4000);
  };


  // --- AI Logic Effect ---
  // Triggers actions based on Phase + Roles
  useEffect(() => {
    if (gameState.phase === Phase.GAME_OVER) return;
    if (isProcessingAi) return;

    const runAiOrWait = async () => {
      const humanWolves = gameState.players.filter(p => p.role === Role.WEREWOLF && p.isHuman && p.isAlive);
      const humanWitch = gameState.players.find(p => p.role === Role.WITCH && p.isHuman && p.isAlive);
      const humanSeer = gameState.players.find(p => p.role === Role.SEER && p.isHuman && p.isAlive);

      // --- NIGHT: WEREWOLF ---
      if (gameState.phase === Phase.NIGHT_WEREWOLF) {
        if (humanWolves.length > 0) {
            // Wait for human input
        } else {
            // AI Only or No Wolves
            setIsProcessingAi(true);
            const aiWolves = gameState.players.filter(p => p.role === Role.WEREWOLF && !p.isHuman && p.isAlive);
            let target: number | null = null;
            
            if (aiWolves.length > 0) {
                await new Promise(r => setTimeout(r, 4000)); 
                const leader = aiWolves[0];
                const decision = await getAiAction({
                    me: leader,
                    players: gameState.players,
                    phase: Phase.NIGHT_WEREWOLF,
                    history: gameState.logs.map(l => l.content)
                }, 'KILL');
                target = decision.targetId;
            } else {
                await new Promise(r => setTimeout(r, 4000));
            }
            
            setIsProcessingAi(false);
            finishWerewolfPhase(target);
        }
      }

      // --- NIGHT: WITCH ---
      else if (gameState.phase === Phase.NIGHT_WITCH) {
          if (humanWitch) {
              // Wait for human
          } else {
              setIsProcessingAi(true);
              await new Promise(r => setTimeout(r, 4000));
              
              const aiWitch = gameState.players.find(p => p.role === Role.WITCH && !p.isHuman && p.isAlive);
              let saveUsed = false;
              let poisonTarget = null;

              if (aiWitch) {
                  // Logic
                  if (gameState.witchPotions.save && gameState.nightActionData.wolvesTarget) {
                      if (Math.random() > 0.5) saveUsed = true;
                  }
                  if (!saveUsed && gameState.witchPotions.poison && Math.random() > 0.8) {
                      const decision = await getAiAction({
                          me: aiWitch,
                          players: gameState.players,
                          phase: Phase.NIGHT_WITCH,
                          history: gameState.logs.map(l => l.content)
                      }, 'POISON');
                      poisonTarget = decision.targetId;
                  }
              }

              // Update State silently before finishing phase
              setGameState(prev => ({
                  ...prev,
                  witchPotions: { 
                      save: saveUsed ? false : prev.witchPotions.save,
                      poison: poisonTarget ? false : prev.witchPotions.poison
                  },
                  nightActionData: { 
                      ...prev.nightActionData, 
                      witchSaveUsed: saveUsed,
                      witchPoisonTarget: poisonTarget
                  }
              }));
              
              setIsProcessingAi(false);
              finishWitchPhase();
          }
      }

      // --- NIGHT: SEER ---
      else if (gameState.phase === Phase.NIGHT_SEER) {
          if (humanSeer) {
              // Wait human
          } else {
              setIsProcessingAi(true);
              await new Promise(r => setTimeout(r, 4000)); // Simulate checking
              setIsProcessingAi(false);
              finishSeerPhase();
          }
      }

      // --- DAY: DISCUSSION ---
      else if (gameState.phase === Phase.DAY_DISCUSS) {
          const speakerId = gameState.currentTurnPlayerId;
          if (!speakerId) {
             setGameState(p => ({...p, phase: Phase.DAY_VOTE}));
             return;
          }

          const speaker = gameState.players.find(p => p.id === speakerId);
          if (!speaker || !speaker.isAlive) {
              const next = getNextSpeaker(gameState.players, speakerId);
              if (next) setGameState(p => ({...p, currentTurnPlayerId: next}));
              else {
                  setGameState(p => ({...p, phase: Phase.DAY_VOTE, currentTurnPlayerId: undefined, humanVotes: {} }));
                  addLog("Discussion ended. Time to vote!", 'system');
                  speak("Discussion ended. Time to vote.");
              }
              return;
          }

          if (!speaker.isHuman) {
              setIsProcessingAi(true);
              const speech = await getAiSpeech({
                  me: speaker,
                  players: gameState.players,
                  phase: Phase.DAY_DISCUSS,
                  history: gameState.logs.map(l => l.content)
              });
              addLog(speech, 'chat', `Player ${speaker.id}`);
              
              await new Promise(r => setTimeout(r, 1500 + speech.length * 50)); // Read time

              const next = getNextSpeaker(gameState.players, speakerId);
              setIsProcessingAi(false);

              if (next) {
                  setGameState(p => ({...p, currentTurnPlayerId: next}));
              } else {
                  setGameState(p => ({...p, phase: Phase.DAY_VOTE, currentTurnPlayerId: undefined, humanVotes: {} }));
                  addLog("Discussion ended. Time to vote!", 'system');
                  speak("Discussion ended. Time to vote.");
              }
          }
      }
      
      // --- HUNTER ACTION (AI) ---
      else if (gameState.phase === Phase.HUNTER_ACTION) {
           const hunterId = gameState.currentTurnPlayerId;
           const hunter = gameState.players.find(p => p.id === hunterId);
           if (hunter && !hunter.isHuman) {
               setIsProcessingAi(true);
               await new Promise(r => setTimeout(r, 2000));
               const decision = await getAiAction({
                   me: hunter,
                   players: gameState.players,
                   phase: Phase.HUNTER_ACTION,
                   history: gameState.logs.map(l => l.content)
               }, 'KILL');
               
               const targetId = decision.targetId;
               addLog(`Player ${hunterId} shoots Player ${targetId || 'nobody'}!`, 'action');
               speak(`Hunter shoots player ${targetId}`);
               setIsProcessingAi(false);
               
               setTimeout(() => {
                   if (targetId) {
                       setGameState(curr => {
                           const next = processDeathsAndContinue(curr, [targetId], Phase.NIGHT_WEREWOLF);
                           return next;
                       });
                   } else {
                       setGameState(prev => ({ ...prev, phase: Phase.NIGHT_WEREWOLF }));
                   }
               }, 2000);
           }
      }

    };

    runAiOrWait();
  }, [gameState.phase, gameState.currentTurnPlayerId, isProcessingAi]);


  // --- Human Interactions ---

  const handleHumanWolfAction = (targetId: number | null) => {
      finishWerewolfPhase(targetId);
  };

  const handleHumanSeerAction = (targetId: number) => {
      // Show result
      const target = gameState.players.find(p => p.id === targetId);
      const team = target ? TEAM_MAP[target.role] : 'Unknown';
      setGameState(prev => ({
          ...prev,
          nightActionData: { ...prev.nightActionData, seerResult: team, seerCheck: targetId }
      }));
  };

  const confirmSeerResult = () => {
      setGameState(prev => ({
          ...prev,
          nightActionData: { ...prev.nightActionData, seerResult: null }
      }));
      finishSeerPhase();
  };

  const handleWitchDecision = (action: 'SAVE' | 'POISON' | 'SKIP', targetId?: number) => {
      if (action === 'SAVE') {
          setGameState(prev => ({
              ...prev,
              nightActionData: { ...prev.nightActionData, witchSaveUsed: true },
              witchPotions: { ...prev.witchPotions, save: false }
          }));
          finishWitchPhase();
      } else if (action === 'POISON') {
          if (targetId) {
            setGameState(prev => ({
                ...prev,
                nightActionData: { ...prev.nightActionData, witchPoisonTarget: targetId },
                witchPotions: { ...prev.witchPotions, poison: false }
            }));
            finishWitchPhase();
          }
      } else if (action === 'SKIP') {
          if (witchUiStep === 1) {
              setWitchUiStep(2);
          } else {
              finishWitchPhase();
          }
      }
  };

  const handleHumanChat = () => {
      if (!userInput.trim()) return;
      const speakerId = gameState.currentTurnPlayerId;
      addLog(userInput, 'chat', `Player ${speakerId}`);
      setUserInput('');
      
      const next = getNextSpeaker(gameState.players, speakerId!);
      if (next) {
          setGameState(p => ({...p, currentTurnPlayerId: next}));
      } else {
          setGameState(p => ({...p, phase: Phase.DAY_VOTE, currentTurnPlayerId: undefined, humanVotes: {} }));
          addLog("Discussion ended. Time to vote!", 'system');
          speak("Discussion ended. Time to vote.");
      }
  };
  
  const handleHumanVote = (targetId: number) => {
     const humans = gameState.players.filter(p => p.isHuman && p.isAlive);
     const alreadyVotedIds = Object.keys(gameState.humanVotes).map(Number);
     const voter = humans.find(p => !alreadyVotedIds.includes(p.id));
     
     if (!voter) return; 
     
     const newVotes = { ...gameState.humanVotes, [voter.id]: targetId };
     setGameState(prev => ({ ...prev, humanVotes: newVotes }));
     addLog(`Player ${voter.id} voted for Player ${targetId}`, 'action');
     
     if (Object.keys(newVotes).length === humans.length) {
         processAiVotesAndResolve(newVotes);
     }
  };
  
  const processAiVotesAndResolve = async (currentHumanVotes: Record<number, number>) => {
      setIsProcessingAi(true);
      const allVotes = { ...currentHumanVotes };
      const aiPlayers = gameState.players.filter(p => p.isAlive && !p.isHuman);
      
      for (const p of aiPlayers) {
          const aiChoice = await getAiAction({
              me: p,
              players: gameState.players,
              phase: Phase.DAY_VOTE,
              history: gameState.logs.map(l => l.content)
          }, 'VOTE');
          
          if (aiChoice.targetId) {
              allVotes[p.id] = aiChoice.targetId;
              addLog(`Player ${p.id} voted for Player ${aiChoice.targetId}`, 'action');
          } else {
               addLog(`Player ${p.id} abstained`, 'action');
          }
      }
      
      const voteCounts: Record<number, number> = {};
      Object.values(allVotes).forEach(target => {
          voteCounts[target] = (voteCounts[target] || 0) + 1;
      });
      
      let maxVotes = 0;
      let candidates: number[] = [];
      Object.entries(voteCounts).forEach(([pid, count]) => {
          if (count > maxVotes) {
              maxVotes = count;
              candidates = [parseInt(pid)];
          } else if (count === maxVotes) {
              candidates.push(parseInt(pid));
          }
      });
      
      setIsProcessingAi(false);

      if (candidates.length === 1) {
          const eliminatedId = candidates[0];
          addLog(`Player ${eliminatedId} was voted out!`, 'system');
          speak(`Player ${eliminatedId} was voted out.`);
          
          setTimeout(() => {
             setGameState(curr => processDeathsAndContinue(curr, [eliminatedId], Phase.NIGHT_WEREWOLF));
             // processDeathsAndContinue updates phase to NIGHT_WEREWOLF, triggering the Effect to speak intro.
          }, 3000);
      } else {
          addLog(`Vote tied. No one executed.`, 'system');
          speak("Vote tied. No one executed. Night falls.");
           setTimeout(() => {
                setGameState(prev => ({ 
                    ...prev, 
                    phase: Phase.NIGHT_WEREWOLF,
                    nightActionData: { wolvesTarget: null, seerCheck: null, seerResult: null, witchSaveUsed: false, witchPoisonTarget: null },
                    humanVotes: {} 
                }));
           }, 3000);
      }
  };

  const handleHunterShoot = (targetId: number) => {
      addLog(`You (Hunter) shoot Player ${targetId}!`, 'action', 'You');
      setGameState(curr => {
           const next = processDeathsAndContinue(curr, [targetId], Phase.NIGHT_WEREWOLF);
           return next;
      });
  };


  // --- Render Sections ---

  const renderNightControls = () => {
    // Only show controls if HUMAN is active in this phase
    const humanSeer = gameState.players.find(p => p.isHuman && p.isAlive && p.role === Role.SEER);
    const humanWitch = gameState.players.find(p => p.isHuman && p.isAlive && p.role === Role.WITCH);
    const humanWolves = gameState.players.filter(p => p.isHuman && p.isAlive && p.role === Role.WEREWOLF);
    
    // --- Werewolf ---
    if (gameState.phase === Phase.NIGHT_WEREWOLF) {
        if (humanWolves.length > 0) {
            return (
                <div className="p-4 bg-red-900/20 border border-red-500 rounded-lg">
                    <h3 className="text-xl text-red-400 mb-2">Werewolf Action</h3>
                    <p className="mb-4">Choose a victim to kill:</p>
                    <div className="grid grid-cols-3 gap-2">
                        {gameState.players.filter(p => p.isAlive && p.role !== Role.WEREWOLF).map(p => (
                            <button key={p.id} onClick={() => handleHumanWolfAction(p.id)} className="p-2 bg-slate-700 hover:bg-red-700 rounded">Player {p.id}</button>
                        ))}
                    </div>
                </div>
            );
        }
    }
    
    // --- Seer ---
    if (gameState.phase === Phase.NIGHT_SEER) {
        if (humanSeer) {
            if (gameState.nightActionData.seerResult) {
                return (
                    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
                        <div className="bg-indigo-900 p-8 rounded-lg text-center border-2 border-indigo-400">
                             <h3 className="text-3xl font-bold text-indigo-300 mb-4">Identity Revealed</h3>
                             <p className="text-xl mb-6">
                                Player {gameState.nightActionData.seerCheck} is <br/>
                                <span className={`text-4xl font-bold ${gameState.nightActionData.seerResult === 'Bad' ? 'text-red-500' : 'text-green-500'}`}>
                                    {gameState.nightActionData.seerResult.toUpperCase()}
                                </span>
                             </p>
                             <button onClick={confirmSeerResult} className="bg-indigo-600 px-8 py-3 rounded-lg text-xl font-bold hover:bg-indigo-500">
                                 OK, Close Eyes
                             </button>
                        </div>
                    </div>
                );
            }
            return (
                <div className="p-4 bg-indigo-900/20 border border-indigo-500 rounded-lg">
                    <h3 className="text-xl text-indigo-400 mb-2">Seer Action</h3>
                    <p className="mb-4">Select a player to reveal their true identity:</p>
                    <div className="grid grid-cols-3 gap-2">
                        {gameState.players.filter(p => p.isAlive && p.id !== humanSeer.id).map(p => (
                            <button key={p.id} onClick={() => handleHumanSeerAction(p.id)} className="p-2 bg-slate-700 hover:bg-indigo-700 rounded">Player {p.id}</button>
                        ))}
                    </div>
                </div>
            );
        }
    }
    
    // --- Witch ---
    if (gameState.phase === Phase.NIGHT_WITCH) {
        if (humanWitch) {
             const victimId = gameState.nightActionData.wolvesTarget;
             if (witchUiStep === 1) {
                if (victimId && gameState.witchPotions.save) {
                    return (
                        <div className="p-4 bg-purple-900/20 border border-purple-500 rounded-lg">
                            <h3 className="text-xl text-purple-400 mb-2">Witch Action</h3>
                            <p className="text-red-300 mb-4 font-bold">Player {victimId} was attacked!</p>
                            <p className="mb-4">Use Healing Potion?</p>
                            <div className="flex gap-4">
                                <button onClick={() => handleWitchDecision('SAVE')} className="flex-1 py-3 bg-green-600 rounded font-bold">Yes (Save)</button>
                                <button onClick={() => handleWitchDecision('SKIP')} className="flex-1 py-3 bg-slate-600 rounded">No (Skip)</button>
                            </div>
                        </div>
                    );
                } else {
                     return (
                         <div className="p-4 bg-purple-900/20 border border-purple-500 rounded-lg text-center">
                             <h3 className="text-xl text-purple-400 mb-2">Witch Action</h3>
                             <p className="mb-4 text-slate-400">{victimId ? "You have no save potion." : "No one died tonight."}</p>
                             <button onClick={() => handleWitchDecision('SKIP')} className="px-6 py-2 bg-purple-700 rounded">Continue</button>
                         </div>
                     );
                }
             }
             if (witchUiStep === 2) {
                 if (gameState.witchPotions.poison) {
                    return (
                        <div className="p-4 bg-purple-900/20 border border-purple-500 rounded-lg">
                            <h3 className="text-xl text-purple-400 mb-2">Witch Action</h3>
                            <p className="mb-4">Use Poison Potion?</p>
                            <div className="grid grid-cols-4 gap-2 mb-4">
                                 {gameState.players.filter(p => p.isAlive && p.id !== humanWitch.id).map(p => (
                                    <button key={p.id} onClick={() => handleWitchDecision('POISON', p.id)} className="p-2 bg-slate-700 hover:bg-purple-700 rounded">P{p.id}</button>
                                ))}
                            </div>
                            <button onClick={() => handleWitchDecision('SKIP')} className="w-full py-2 bg-slate-600 rounded">Don't Poison</button>
                        </div>
                    );
                 } else {
                     return (
                         <div className="p-4 bg-purple-900/20 border border-purple-500 rounded-lg text-center">
                             <h3 className="text-xl text-purple-400 mb-2">Witch Action</h3>
                             <p className="mb-4 text-slate-400">No poison potion left.</p>
                             <button onClick={() => handleWitchDecision('SKIP')} className="px-6 py-2 bg-purple-700 rounded">Close Eyes</button>
                         </div>
                     );
                 }
             }
        }
    }
    
    // Default "Waiting" Screen for Humans who aren't the active role
    return (
        <div className="flex flex-col items-center justify-center py-12 text-center animate-pulse">
            <div className="text-6xl mb-4">🌙</div>
            <h2 className="text-2xl font-bold text-slate-500">Night Phase</h2>
            <p className="text-slate-600">The Moderator is speaking... Please follow instructions.</p>
        </div>
    );
  };

  const renderVoteControls = () => {
     const humansToVote = gameState.players.filter(p => p.isHuman && p.isAlive);
     const alreadyVotedIds = Object.keys(gameState.humanVotes).map(Number);
     const currentVoter = humansToVote.find(p => !alreadyVotedIds.includes(p.id));
     
     if (!currentVoter) return <div className="text-center animate-pulse">Waiting for AI votes...</div>;
     
     return (
        <div className="flex flex-col items-center p-4 bg-slate-800 rounded-lg border border-slate-700">
            <h3 className="text-xl font-bold text-red-400 mb-2">Voting Phase</h3>
            <p className="mb-4 text-lg">Player {currentVoter.id} (You), who do you want to eliminate?</p>
            <div className="flex flex-wrap justify-center gap-3">
                {gameState.players.filter(p => p.isAlive).map(p => (
                    <button 
                      key={p.id} 
                      onClick={() => handleHumanVote(p.id)}
                      className="px-6 py-3 bg-slate-700 hover:bg-red-600 rounded-lg transition-colors font-bold text-lg"
                    >
                        Player {p.id}
                    </button>
                ))}
            </div>
        </div>
     );
  };

  const renderHunterControls = () => {
      const hunterId = gameState.currentTurnPlayerId;
      const me = gameState.players.find(p => p.id === hunterId);
      
      if (!me?.isHuman) return <div className="text-center text-red-500 animate-pulse">Hunter (AI) is aiming...</div>;
      
      return (
        <div className="flex flex-col items-center p-4 bg-red-900/30 border-2 border-red-600 rounded-lg">
            <h3 className="text-2xl font-bold text-red-500 mb-2">HUNTER REVENGE</h3>
            <p className="mb-4 text-xl">You died! Choose someone to take with you.</p>
            <div className="flex flex-wrap justify-center gap-3">
                {gameState.players.filter(p => p.isAlive).map(p => (
                    <button 
                      key={p.id} 
                      onClick={() => handleHunterShoot(p.id)}
                      className="px-6 py-3 bg-red-800 hover:bg-red-600 rounded-lg transition-colors font-bold text-lg border border-red-400"
                    >
                        Shoot Player {p.id}
                    </button>
                ))}
            </div>
        </div>
      );
  };

  // --- Main Render ---

  if (!setupComplete) {
     return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100 font-sans">
        <div className="max-w-md w-full p-8 bg-slate-800 rounded-2xl shadow-2xl border border-slate-700">
          <h1 className="text-4xl font-bold text-center mb-2 text-indigo-400">AI Werewolf</h1>
          <p className="text-center text-slate-400 mb-8">Standard 9-Player Setup</p>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Number of Human Players</label>
            <input 
              type="number" min="1" max="9" 
              value={humanCount} 
              onChange={(e) => setHumanCount(Math.min(9, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <button onClick={startGame} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-colors shadow-lg shadow-indigo-500/20">
            Start Game
          </button>
        </div>
      </div>
    );
  }

  if (gameState.phase === Phase.REVEAL) {
    const player = gameState.players[currentRevealIndex];
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 p-4">
        <h2 className="text-2xl font-bold mb-8 text-indigo-300">Identity Check</h2>
        <div className="mb-8">
            <PlayerCard role={player.role} isRevealed={isCardRevealed} onClick={handleRevealClick} playerNumber={player.id} />
        </div>
        <p className="text-slate-400 max-w-xs text-center">
          {isCardRevealed ? ROLE_DESCRIPTIONS[player.role] : `Pass device to Player ${player.id}, then tap card.`}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col md:flex-row">
      <div className="w-full md:w-64 bg-slate-950 p-4 border-r border-slate-800 flex-shrink-0">
        <h2 className="text-lg font-bold text-indigo-400 mb-4">Players</h2>
        <div className="grid grid-cols-3 md:grid-cols-1 gap-2">
          {gameState.players.map(p => (
            <div key={p.id} className={`p-2 rounded flex flex-col ${p.isAlive ? 'bg-slate-800' : 'bg-slate-900 opacity-50'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className={`w-2 h-2 rounded-full mr-2 ${p.isAlive ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span className="text-sm font-medium">P{p.id} {p.isHuman ? '(You)' : ''}</span>
                </div>
                {!p.isHuman && <span className="text-[10px] text-indigo-300 ml-1">{p.personality}</span>}
              </div>
              <span className="text-[10px] text-slate-500 ml-4">{p.isAlive ? 'Alive' : 'Dead'}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 text-xs text-slate-500">Phase: {gameState.phase}<br/>Day: {gameState.dayCount}</div>
      </div>

      <div className="flex-1 flex flex-col h-screen max-h-screen">
        <div className="flex-1 overflow-hidden p-4">
           <GameLog logs={gameState.logs} myPlayerId={gameState.players.find(p => p.isHuman)?.id} />
        </div>
        <div className="p-4 bg-slate-800 border-t border-slate-700">
            {isProcessingAi && <div className="text-center text-xs text-indigo-400 animate-pulse mb-2">Wait... AI is thinking...</div>}
            
            {(gameState.phase.includes('NIGHT')) && renderNightControls()}
            {gameState.phase === Phase.HUNTER_ACTION && renderHunterControls()}
            
            {gameState.phase === Phase.DAY_DISCUSS && gameState.currentTurnPlayerId && (
                <div className="flex flex-col">
                     {gameState.players.find(p => p.id === gameState.currentTurnPlayerId)?.isHuman ? (
                         <div className="flex gap-2">
                             <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)}
                               placeholder="It's your turn to speak..."
                               className="flex-1 bg-slate-700 rounded px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                               onKeyDown={(e) => e.key === 'Enter' && handleHumanChat()}
                             />
                             <button onClick={handleHumanChat} className="bg-indigo-600 px-4 py-2 rounded font-bold">Send</button>
                         </div>
                     ) : (
                         <div className="text-center text-slate-500 italic">Player {gameState.currentTurnPlayerId} is speaking...</div>
                     )}
                </div>
            )}

            {gameState.phase === Phase.DAY_VOTE && renderVoteControls()}
            
            {gameState.phase === Phase.GAME_OVER && (
                 <div className="text-center">
                     <h2 className={`text-3xl font-bold mb-4 ${gameState.winner === Team.GOOD ? 'text-green-400' : 'text-red-500'}`}>
                         {gameState.winner} Team Wins!
                     </h2>
                     <button onClick={() => window.location.reload()} className="px-6 py-2 bg-slate-600 hover:bg-slate-500 rounded text-white">Play Again</button>
                 </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default App;