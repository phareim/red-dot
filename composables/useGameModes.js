import { ref, reactive } from 'vue';

/**
 * Manages different game modes with their respective configurations
 */
export function useGameModes() {
  // Current selected mode
  const currentMode = ref('standard');
  
  // Mode configurations
  const modes = reactive({
    // Standard mode: 20 seconds, score and timer visible
    standard: {
      name: 'Standard Mode',
      description: '20 seconds of rapid gameplay!',
      timeLimit: 20,
      displayScore: true,
      displayTimer: true,
      displayHighScore: true,
      endless: false,
      saveHighScore: true,
    },
    
    // Endless mode: no time limit, score and timer hidden
    endless: {
      name: 'Endless Mode',
      description: 'Play with no time pressure. Zen mode.',
      timeLimit: -1, // -1 indicates no time limit
      displayScore: false,
      displayTimer: false,
      displayHighScore: false,
      endless: true,
      saveHighScore: false, // Never save endless mode scores to high score list
    }
  });
  
  /**
   * Get the current mode configuration
   */
  const getCurrentModeConfig = () => {
    return modes[currentMode.value];
  };
  
  /**
   * Set the current game mode
   * @param {string} mode - The mode to set
   */
  const setMode = (mode) => {
    if (modes[mode]) {
      currentMode.value = mode;
    } else {
      console.error(`Game mode "${mode}" does not exist`);
    }
  };
  
  /**
   * Get a list of available modes
   */
  const getAvailableModes = () => {
    return Object.keys(modes).map(key => ({
      id: key,
      ...modes[key]
    }));
  };
  
  /**
   * Add a new game mode
   * @param {string} id - The unique identifier for the mode
   * @param {object} config - The mode configuration
   */
  const addMode = (id, config) => {
    if (!modes[id]) {
      modes[id] = config;
    } else {
      console.error(`Game mode "${id}" already exists`);
    }
  };
  
  return {
    currentMode,
    modes,
    getCurrentModeConfig,
    setMode,
    getAvailableModes,
    addMode
  };
} 