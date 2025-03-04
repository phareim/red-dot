<template>
  <div 
    class="game-container" 
    :class="{ 'game-active': gameActive }"
    @keydown="handleGameKeyDown" 
    @keyup="handleKeyUp" 
    @mousemove="handleMouseMove"
    @mousedown="isMouseControlActive = true"
    tabindex="0" 
    ref="gameRef"
  >
    <!-- Mode selection (shown when game is not active) -->
    <div v-if="!gameActive" class="mode-selector" @keydown="handleModeKeyDown" tabindex="0" ref="modeSelectorRef">
      <h2>Choose Game Mode</h2>
      <div class="mode-buttons">
        <button 
          v-for="(mode, index) in availableModes" 
          :key="mode.id"
          class="mode-button"
          :class="{ 
            'selected': currentMode === mode.id,
            'focused': selectedModeIndex === index 
          }"
          @click="selectAndStartMode(mode.id)"
          ref="modeButtonsRef"
        >
          <div class="mode-name">{{ mode.name }}</div>
          <div class="mode-description">{{ mode.description }}</div>
        </button>
      </div>
    </div>
    
    <!-- Score display for Standard Mode -->
    <div v-if="!isEndlessMode && gameActive" class="score-display">
      <span v-if="currentModeConfig.displayScore" class="score-value">{{ score }}</span>
      <span v-if="currentModeConfig.displayScore" class="score-label">POINTS</span>
      
      <div v-if="currentModeConfig.displayHighScore" class="highscore-container">
        <span class="highscore-value">{{ highScore }}</span>
        <span class="highscore-label">HIGH SCORE</span>
        <span v-if="playerName" class="player-name">{{ playerName }}</span>
      </div>
      
      <div v-if="currentModeConfig.displayTimer" class="timer-container">
        <span class="timer-value" :class="{ 'timer-low': timeRemaining <= 5 }">{{ timeRemaining }}</span>
        <span class="timer-label">SECONDS</span>
      </div>
    </div>
    
    <!-- End Game button for Endless Mode (styled like score display) -->
    <button 
      v-if="gameActive && isEndlessMode" 
      class="score-display end-game-button"
      @click="endEndlessMode"
    >
      <span class="score-value">END</span>
      <span class="score-label">GAME</span>
    </button>
    
    <div 
      class="red-dot player" 
      :class="{ 'pulse-collect': isCollecting }"
      :style="{ left: position.x + 'px', top: position.y + 'px' }"
    ></div>
    
    <!-- Render tail segments -->
    <div 
      v-for="(segment, index) in tailSegments" 
      :key="index" 
      class="tail-segment" 
      :style="{ 
        left: segment.x + 'px', 
        top: segment.y + 'px',
        backgroundColor: segment.color,
        zIndex: 90 - index
      }"
    ></div>
    
    <!-- Render collectible dots -->
    <div 
      v-for="(dot, index) in collectibleDots" 
      :key="`dot-${index}`" 
      class="collectible-dot"
      :style="{ 
        left: dot.x + 'px', 
        top: dot.y + 'px', 
        backgroundColor: dot.color
      }"
    ></div>
    
    <div class="instructions" alt="Use the arrow keys to move the red dot around the screen.">
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import { 
  saveHighScore as saveHighScoreToFirebase, 
  getPlayerHighScore, 
  getTopHighScores, 
  initializeLeaderboardFromExistingData,
  updatePlayerName 
} from '@/services/firebase';

// Import our CSS
import '@/assets/css/game.css';

// Import our composables
import { useGamePhysics } from '~/composables/useGamePhysics';
import { useGameEntities } from '~/composables/useGameEntities';
import { useGameState } from '~/composables/useGameState';
import { useGameEffects } from '~/composables/useGameEffects';
import { useGameUI } from '~/composables/useGameUI';
import { useGameModes } from '~/composables/useGameModes';

// Setup game container ref
const gameRef = ref(null);

// Function to fetch top scores
const fetchTopScores = async (limit) => {
  return await getTopHighScores(limit);
};

// Use our game physics composable
const { 
  position, velocity, positionHistory, keys, isMouseControlActive,
  DOT_SIZE, handleKeyDown, handleKeyUp, handleMouseMove,
  calculateMovement, initializePosition, cleanup: cleanupPhysics 
} = useGamePhysics(gameRef);

// Use our game state composable
const {
  score, timeRemaining, gameActive, highScore, playerName, playerId, isEndlessMode,
  loadHighScore, saveHighScore, loadPlayerName, savePlayerName,
  loadOrGeneratePlayerId, checkHighScore, startCountdown, addPoints,
  resetGame, forceGameOver, cleanup: cleanupGameState
} = useGameState();

// Use our game entities composable
const {
  tailSegments, collectibleDots, isCollecting,
  updateTailSegments, checkCollisions, startSpawning,
  cleanup: cleanupEntities
} = useGameEntities(gameRef, position, positionHistory, DOT_SIZE);

// Use our game effects composable
const {
  createExplosionEffect, createScorePopup, createMessage,
  checkForColorMatches
} = useGameEffects(gameRef, tailSegments, addPoints);

// Use our game UI composable
const {
  showNameInputDialog, showGameOverScreen
} = useGameUI(gameRef, score, highScore, playerName, savePlayerName);

// Use our game modes composable
const {
  currentMode,
  modes,
  getCurrentModeConfig,
  setMode,
  getAvailableModes
} = useGameModes();

// Computed properties
const currentModeConfig = computed(() => getCurrentModeConfig());
const availableModes = computed(() => getAvailableModes());

// Animation frame ID for game loop
let animationFrameId;

// Timeout ID for game loop
const gameLoopTimeout = ref(null);

// Track game over state
const isGameOver = ref(false);

// Mode selection keyboard navigation
const modeSelectorRef = ref(null);
const modeButtonsRef = ref([]);
const selectedModeIndex = ref(0);

/**
 * Main game update function - called every animation frame
 */
const updateGame = () => {
  // Only update the game if it's active
  if (gameActive.value) {
    // Calculate new position based on physics
    calculateMovement();
    
    // Handle dot collection and collision detection
    checkCollisions(
      // Callback for adding a tail segment
      (newSegment) => {
        // Add new segment at the front of the snake (right behind the player)
        tailSegments.value.unshift(newSegment);
        
        // Calculate score based on snake length
        const pointsEarned = tailSegments.value.length;
        addPoints(pointsEarned);
        
        // Show a temporary score popup at the collection point
        if (currentModeConfig.value.displayScore) {
          createScorePopup(newSegment.x + DOT_SIZE/2, newSegment.y, pointsEarned);
        }
      }
    );
    
    // Update tail segment positions
    updateTailSegments();
    
    // Check for color matches only in non-endless mode
    if (!isEndlessMode.value) {
      checkForColorMatches();
    }
    
    // Continue animation if game is active
    animationFrameId = requestAnimationFrame(updateGame);
  }
};

/**
 * Sync high score with Firebase
 */
const syncHighScore = async () => {
  try {
    // Try to get high score from Firebase
    const cloudData = await getPlayerHighScore(playerId.value);
    
    if (cloudData) {
      // If cloud score is higher than local, update local
      if (cloudData.score > highScore.value) {
        highScore.value = cloudData.score;
        saveHighScore();
      } 
      // If local score is higher than cloud, update cloud
      else if (highScore.value > cloudData.score) {
        await saveHighScoreToFirebase(playerName.value || 'Player', highScore.value, playerId.value);
      }
    } else if (highScore.value > 0) {
      // If no cloud data but we have a local high score, upload it
      await saveHighScoreToFirebase(playerName.value || 'Player', highScore.value, playerId.value);
    }
  } catch (error) {
    console.error("Error syncing high score:", error);
  }
};

/**
 * Handle game over and score checking
 */
const handleGameOver = async () => {
  // Clear any active animation frame
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  // Game is officially over
  isGameOver.value = true;
  
  // Log the score
  console.log(`Final score: ${score.value}`);
  
  let isNewHighScore = false;
  
  // Only check for high scores if this mode saves high scores
  if (currentModeConfig.value.saveHighScore) {
    // Check if this is a high score
    isNewHighScore = await checkHighScore((name, score, id) => 
      saveHighScoreToFirebase(name, score, id)
    );
  }
  
  // Show game over screen
  const result = await showGameOverScreen({
    score: score.value,
    isNewHighScore,
    getTopScores: currentModeConfig.value.saveHighScore ? fetchTopScores : null
  });
  
  // If player changed their name on game over screen
  if (result?.nameChanged) {
    // Update local storage directly since the name is already stored in the playerName ref
    localStorage.setItem('snakeGamePlayerName', playerName.value);
  }
  
  // Re-sync with Firebase in case player name was changed on game over screen
  if (playerName.value && score.value > 0 && currentModeConfig.value.saveHighScore) {
    await saveHighScoreToFirebase(playerName.value, score.value, playerId.value);
  }
  
  // Add a small delay to ensure the game over modal is fully removed
  // before showing the mode selector
  setTimeout(() => {
    // Set gameActive to false to return to mode selection
    gameActive.value = false;
    
    // Focus the mode selector for keyboard navigation
    setTimeout(() => {
      const modeSelector = document.querySelector('.mode-selector');
      if (modeSelector) modeSelector.focus();
    }, 50);
  }, 150);
};

/**
 * End the endless mode game manually
 */
const endEndlessMode = () => {
  if (isEndlessMode.value && gameActive.value) {
    forceGameOver(handleGameOver);
  }
};

/**
 * Handle keyboard navigation in mode selection screen
 */
const handleModeKeyDown = (event) => {
  if (!gameActive.value) {
    switch(event.key) {
      case 'ArrowUp':
        event.preventDefault();
        selectedModeIndex.value = Math.max(0, selectedModeIndex.value - 1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        selectedModeIndex.value = Math.min(availableModes.value.length - 1, selectedModeIndex.value + 1);
        break;
      case 'Enter':
        event.preventDefault();
        if (availableModes.value.length > 0) {
          selectAndStartMode(availableModes.value[selectedModeIndex.value].id);
        }
        break;
    }
  }
};

/**
 * Handle game keydown events including Escape to return to menu
 */
const handleGameKeyDown = (event) => {
  // Original physics key handling
  handleKeyDown(event);
  
  // Add escape key to quit game - go directly back to mode selection
  if (event.key === 'Escape' && gameActive.value) {
    event.preventDefault();
    // Cancel any active countdowns and reset game state
    resetGame();
    // Skip game over screen, go directly back to mode selection
    gameActive.value = false;
    // Focus the mode selector for keyboard navigation
    setTimeout(() => {
      modeSelectorRef.value?.focus();
    }, 100);
  }
};

/**
 * Select a game mode and start it immediately
 */
const selectAndStartMode = (modeId) => {
  // Set the mode
  setMode(modeId);
  
  // Start the game with this mode
  startSelectedMode();
};

/**
 * Start the selected game mode
 */
const startSelectedMode = () => {
  // Reset game state
  resetGame();
  
  // Clear tail segments and collectible dots
  tailSegments.value = [];
  collectibleDots.value = [];
  
  // Reset player position
  position.value = { x: gameRef.value.clientWidth / 2, y: gameRef.value.clientHeight / 2 };
  velocity.value = { x: 0, y: 0 };
  
  // Start the countdown based on the selected mode
  startCountdown(handleGameOver, currentModeConfig.value);
  
  // Start spawning collectible dots
  startSpawning();
  
  // IMPORTANT: Restart the animation frame loop!
  animationFrameId = requestAnimationFrame(updateGame);
  
  // Reset history and reset focus on game container
  positionHistory.value = [];
  gameRef.value.focus();
};

onMounted(() => {
  // Initialize player position
  initializePosition();
  
  // Focus the game container so it can receive keyboard events
  gameRef.value?.focus();
  
  // Don't automatically start the game - show mode selection instead
  gameActive.value = false;
  
  // Focus the mode selector for keyboard navigation
  setTimeout(() => {
    modeSelectorRef.value?.focus();
  }, 100);
  
  // Load high score, player name and ID from localStorage
  loadHighScore();
  loadPlayerName();
  loadOrGeneratePlayerId(uuidv4);
  
  // Sync with Firebase after a short delay to ensure we have loaded local data
  setTimeout(async () => {
    await syncHighScore();
    
    // Initialize the leaderboard from existing data (if needed)
    await initializeLeaderboardFromExistingData();
  }, 1000);
});

onUnmounted(() => {
  // Clean up animation frame when component unmounts
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  
  // Clean up all composables
  cleanupPhysics();
  cleanupEntities();
  cleanupGameState();
});
</script> 