import { ref, computed } from 'vue';

/**
 * Manages game state, scoring, and lifecycle
 */
export function useGameState() {
  // Game state variables
  const score = ref(0);
  const timeRemaining = ref(20);
  const gameActive = ref(true);
  let countdownInterval = null;
  
  // High score tracking
  const highScore = ref(0);
  const playerName = ref('');
  const playerId = ref('');
  
  // Game mode related properties
  const isEndlessMode = ref(false);
  
  /**
   * Load high score from localStorage
   */
  const loadHighScore = () => {
    const savedHighScore = localStorage.getItem('snakeGameHighScore');
    if (savedHighScore !== null) {
      highScore.value = parseInt(savedHighScore);
    }
  };

  /**
   * Save high score to localStorage
   */
  const saveHighScore = () => {
    localStorage.setItem('snakeGameHighScore', highScore.value.toString());
  };

  /**
   * Load player name from localStorage
   */
  const loadPlayerName = () => {
    const savedName = localStorage.getItem('snakeGamePlayerName');
    if (savedName) {
      playerName.value = savedName;
    }
  };

  /**
   * Save player name to localStorage
   */
  const savePlayerName = (name) => {
    playerName.value = name;
    localStorage.setItem('snakeGamePlayerName', name);
  };

  /**
   * Load or generate player ID
   */
  const loadOrGeneratePlayerId = (uuidGenerator) => {
    const savedId = localStorage.getItem('snakeGamePlayerId');
    if (savedId) {
      playerId.value = savedId;
    } else {
      // Generate new ID
      playerId.value = uuidGenerator();
      localStorage.setItem('snakeGamePlayerId', playerId.value);
    }
  };

  /**
   * Add points to the score
   */
  const addPoints = (points) => {
    score.value += points;
    console.log('Adding points:', points, 'Score:', score.value);
  };

  /**
   * Check if current score is a new high score
   */
  const checkHighScore = async (saveToCloud) => {
    // If new high score, save it
    if (score.value > highScore.value) {
      highScore.value = score.value;
      saveHighScore();
      
      // Save to cloud if callback provided
      if (saveToCloud && playerName.value) {
        await saveToCloud(playerName.value, highScore.value, playerId.value);
      }
      return true;
    }
    return false;
  };

  /**
   * Start the countdown timer based on game mode configuration
   */
  const startCountdown = (onTimeUp, modeConfig = null) => {
    // Clear any existing interval
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }
    
    // Apply game mode settings
    if (modeConfig) {
      isEndlessMode.value = modeConfig.endless;
      
      // Set time based on mode config
      if (modeConfig.timeLimit > 0) {
        timeRemaining.value = modeConfig.timeLimit;
      } else {
        // For endless mode, just set a very high number
        timeRemaining.value = 999999;
      }
    } else {
      // Default to standard mode
      timeRemaining.value = 20;
      isEndlessMode.value = false;
    }
    
    gameActive.value = true;
    
    // If not endless mode, start the countdown
    if (!isEndlessMode.value) {
      countdownInterval = setInterval(() => {
        if (timeRemaining.value > 0) {
          timeRemaining.value--;
          
          // Add pulse animation when time is getting low
          if (timeRemaining.value <= 5) {
            const timerDisplay = document.querySelector('.timer-value');
            if (timerDisplay) {
              timerDisplay.classList.add('pulse-timer');
              setTimeout(() => {
                timerDisplay.classList.remove('pulse-timer');
              }, 500);
            }
          }
        } else {
          // Game over - stop countdown
          clearInterval(countdownInterval);
          gameActive.value = false;
          
          // Call the provided callback if present
          if (onTimeUp) {
            onTimeUp();
          }
        }
      }, 1000);
    }
  };

  /**
   * Force game over (for endless mode)
   */
  const forceGameOver = (onGameOver) => {
    clearInterval(countdownInterval);
    gameActive.value = false;
    
    if (onGameOver) {
      onGameOver();
    }
  };
  
  /**
   * Reset the game state
   */
  const resetGame = () => {
    score.value = 0;
    // Time will be set by startCountdown based on mode
    gameActive.value = true;
  };
  
  /**
   * Clean up resources when component unmounts
   */
  const cleanup = () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }
  };
  
  return {
    // State
    score,
    timeRemaining,
    gameActive,
    highScore,
    playerName,
    playerId,
    isEndlessMode,
    
    // Methods
    loadHighScore,
    saveHighScore,
    loadPlayerName,
    savePlayerName,
    loadOrGeneratePlayerId,
    addPoints,
    checkHighScore,
    startCountdown,
    forceGameOver,
    resetGame,
    cleanup
  };
} 