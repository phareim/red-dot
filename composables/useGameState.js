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
  const loadOrGeneratePlayerId = (generateUUID) => {
    const savedPlayerId = localStorage.getItem('snakeGamePlayerId');
    if (savedPlayerId) {
      playerId.value = savedPlayerId;
    } else {
      // Generate a new UUID for the player using the provided function
      playerId.value = generateUUID();
      localStorage.setItem('snakeGamePlayerId', playerId.value);
    }
  };

  /**
   * Check if the current score is a new high score
   * Returns a Promise resolving to boolean
   */
  const checkHighScore = async (saveToFirebase) => {
    const isNewHighScore = score.value > highScore.value;
    
    if (isNewHighScore) {
      highScore.value = score.value;
      saveHighScore();
      
      // Also save to Firebase if we have a player name and the function is provided
      if (playerName.value && saveToFirebase) {
        try {
          await saveToFirebase(playerName.value, score.value, playerId.value);
        } catch (error) {
          console.error("Error saving high score to Firebase:", error);
        }
      }
    }
    
    return isNewHighScore;
  };

  /**
   * Start the game countdown timer
   */
  const startCountdown = (onTimeUp) => {
    // Clear any existing interval
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }
    
    // Reset the time
    timeRemaining.value = 20;
    gameActive.value = true;
    
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
  };

  /**
   * Add points to the score
   */
  const addPoints = (points) => {
    score.value += points;
  };

  /**
   * Reset the game state for a new game
   */
  const resetGame = () => {
    score.value = 0;
    gameActive.value = true;
    timeRemaining.value = 20;
  };

  /**
   * Clean up timers and intervals
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
    
    // Methods
    loadHighScore,
    saveHighScore,
    loadPlayerName,
    savePlayerName,
    loadOrGeneratePlayerId,
    checkHighScore,
    startCountdown,
    addPoints,
    resetGame,
    cleanup
  };
} 