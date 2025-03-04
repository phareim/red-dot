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

// Import our composables
import { useGamePhysics } from '~/composables/useGamePhysics';
import { useGameEntities } from '~/composables/useGameEntities';
import { useGameState } from '~/composables/useGameState';
import { useGameEffects } from '~/composables/useGameEffects';
import { useGameUI } from '~/composables/useGameUI';
import { useGameModes } from '~/composables/useGameModes';

// Setup game container ref
const gameRef = ref(null);

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
 * Handle game over - called when time runs out or endless mode is ended
 */
const handleGameOver = async () => {
  try {
    // Check if it's a new high score (only for standard mode)
    const isNewHighScore = await checkHighScore((name, score, id) => 
      saveHighScoreToFirebase(name, score, id)
    );
    
    // If no player name set, show name input dialog
    if (!playerName.value) {
      const name = await showNameInputDialog(isNewHighScore);
      savePlayerName(name);
      
      // Save score to Firebase with new name
      if (score.value > 0) {
        await saveHighScoreToFirebase(name, score.value, playerId.value);
      }
    }
    
    // Show game over screen
    const result = await showGameOverScreen(isNewHighScore, getTopHighScores);
    
    // If player changed their name, update it in Firebase
    if (result && result.nameChanged && playerName.value) {
      await updatePlayerName(playerName.value, playerId.value);
    }
    
    // Re-sync with Firebase in case player name was changed on game over screen
    if (playerName.value && score.value > 0 && currentModeConfig.value.saveHighScore) {
      await saveHighScoreToFirebase(playerName.value, score.value, playerId.value);
    }
    
    // Make sure game is not active so mode selection will be visible
    gameActive.value = false;
    
    // Force focus on the mode selector to ensure proper keyboard navigation
    setTimeout(() => {
      modeSelectorRef.value?.focus();
    }, 100);
  } catch (error) {
    console.error("Error handling game over:", error);
  }
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

<style>
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
}

.game-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  background-color: #222;
  overflow: hidden;
  user-select: none;
}

/* Only hide cursor when game is actively running */
.game-active {
  cursor: none;
}

.red-dot {
  position: absolute;
  width: 80px;
  height: 80px;
  background-color: red;
  border-radius: 50%;
  z-index: 100;
}

.tail-segment {
  position: absolute;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  z-index: 90;
}

.collectible-dot {
  position: absolute;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  animation: pulse 1.5s infinite alternate;
  z-index: 80;
}

@keyframes pulse {
  0% {
    transform: scale(0.8);
    opacity: 0.7;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.instructions {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  color: white;
  font-family: Arial, sans-serif;
  padding: 10px;
  background-color: rgba(0,0,0,0.5);
  border-radius: 5px;
}

/* Add the pulse-collect class and animation */
.pulse-collect {
  animation: collect-pulse 0.3s ease-out;
}

@keyframes collect-pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.7);
  }
  50% {
    transform: scale(1.5);
    box-shadow: 0 0 0 10px rgba(255, 0, 0, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 0, 0, 0);
  }
}

/* Mode Selection Styles */
.mode-selector {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: rgba(0, 0, 0, 0.8);
  border: 3px solid #2196F3;
  border-radius: 15px;
  padding: 30px 50px;
  text-align: center;
  color: white;
  font-family: 'Arial', sans-serif;
  z-index: 1000;
  box-shadow: 0 0 30px rgba(33, 150, 243, 0.5);
  min-width: 450px;
  max-width: 80%;
}

.mode-selector h2 {
  font-size: 36px;
  margin: 0 0 30px 0;
  color: #2196F3;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
}

.mode-buttons {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-bottom: 30px;
}

.mode-button {
  background-color: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  padding: 15px 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.mode-button:hover {
  background-color: rgba(255, 255, 255, 0.2);
  transform: scale(1.02);
}

.mode-button.selected {
  background-color: rgba(33, 150, 243, 0.3);
  border-color: #2196F3;
  box-shadow: 0 0 15px rgba(33, 150, 243, 0.5);
}

.mode-button.focused {
  border-color: #64B5F6;
  box-shadow: 0 0 15px rgba(100, 181, 246, 0.7);
}

.mode-name {
  font-size: 22px;
  font-weight: bold;
  margin-bottom: 5px;
  color: white;
}

.mode-description {
  font-size: 14px;
  color: #BBB;
}

/* Style for mode selector focus outline */
.mode-selector:focus {
  outline: none;
}

/* Score display styles */
.score-display {
  position: absolute;
  top: 20px;
  right: 20px;
  font-family: 'Arial', sans-serif;
  color: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.5);
  padding: 15px;
  border-radius: 10px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  z-index: 200;
}

/* End Game button styling */
.end-game-button {
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.end-game-button:hover {
  transform: scale(1.05);
  background-color: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.3);
}

.end-game-button .score-value {
  color: rgba(255, 255, 255, 0.8);
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.4);
}

.score-value, .highscore-value, .timer-value {
  font-size: 36px;
  font-weight: bold;
  margin: 0;
}

.score-label, .highscore-label, .timer-label {
  font-size: 14px;
  letter-spacing: 2px;
  opacity: 0.8;
  margin-top: 2px;
}

.score-value {
  color: white;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.7);
}

.highscore-value {
  color: gold;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.7);
}

/* High score styles */
.highscore-container, .timer-container {
  width: 100%;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-top: 2px solid rgba(255, 255, 255, 0.3);
  padding-top: 10px;
}

.timer-value {
  color: #ffffff;
}

.timer-low {
  color: #FF5252;
  text-shadow: 0 0 10px rgba(255, 82, 82, 0.7);
}

@keyframes pulse-timer {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.pulse-timer {
  animation: pulse-timer 0.5s ease-in-out;
}

/* New high score animation in game over screen */
.new-highscore {
  color: gold;
  font-size: 32px;
  margin: 15px 0;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.7);
  animation: pulse-highscore 1.5s infinite alternate;
}

@keyframes pulse-highscore {
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(1.1); opacity: 1; }
}

.highscore-info {
  font-size: 20px;
  color: #aaa;
  margin: 10px 0;
}

/* Score popup animation */
.score-popup {
  position: absolute;
  color: #FFD700;
  font-size: 24px;
  font-weight: bold;
  font-family: 'Arial', sans-serif;
  text-shadow: 0 0 5px rgba(0, 0, 0, 0.7);
  pointer-events: none;
  animation: score-float 1s ease-out forwards;
  z-index: 150;
}

@keyframes score-float {
  0% {
    transform: translate(-50%, 0) scale(0.8);
    opacity: 0;
  }
  20% {
    transform: translate(-50%, -20px) scale(1.2);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -60px) scale(1);
    opacity: 0;
  }
}

/* Explosion particle effect */
.explosion-particle {
  position: absolute;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  pointer-events: none;
  transform: translate(-50%, -50%);
  animation: explode 1s ease-out forwards;
  z-index: 150;
}

@keyframes explode {
  0% {
    transform: translate(-50%, -50%) scale(0.3);
    opacity: 1;
  }
  100% {
    transform: 
      translate(
        calc(-50% + (cos(var(--angle)) * var(--distance))), 
        calc(-50% + (sin(var(--angle)) * var(--distance)))
      ) 
      scale(0);
    opacity: 0;
  }
}

/* Explosion flash effect */
.explosion-flash {
  position: absolute;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0.7;
  pointer-events: none;
  animation: flash 0.5s ease-out forwards;
  z-index: 140;
}

@keyframes flash {
  0% {
    transform: translate(-50%, -50%) scale(0.5);
    opacity: 0.7;
  }
  50% {
    transform: translate(-50%, -50%) scale(2);
    opacity: 0.5;
  }
  100% {
    transform: translate(-50%, -50%) scale(3);
    opacity: 0;
  }
}

/* Larger score popup for explosions */
.explosion-score {
  font-size: 36px !important;
  color: gold !important;
  animation: explosion-score-float 1.5s ease-out forwards !important;
}

@keyframes explosion-score-float {
  0% {
    transform: translate(-50%, 0) scale(0.8);
    opacity: 0;
  }
  20% {
    transform: translate(-50%, -30px) scale(1.5);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -90px) scale(1);
    opacity: 0;
  }
}

/* Color match message */
.color-match-message {
  position: absolute;
  color: white;
  font-size: 38px;
  font-weight: bold;
  font-family: 'Arial', sans-serif;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.9);
  padding: 15px 25px;
  border-radius: 8px;
  letter-spacing: 2px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 160;
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.7);
  animation: message-appear 1.5s ease-out forwards;
}

@keyframes message-appear {
  0% {
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
  }
  25% {
    transform: translate(-50%, -50%) scale(1.2);
    opacity: 1;
  }
  75% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.5);
    opacity: 0;
  }
}

/* Game over screen */
.game-over-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: rgba(0, 0, 0, 0.8);
  border: 3px solid #2196F3;
  border-radius: 15px;
  padding: 30px 50px;
  text-align: center;
  color: white;
  font-family: 'Arial', sans-serif;
  z-index: 1000;
  box-shadow: 0 0 30px rgba(33, 150, 243, 0.5);
  min-width: 450px;
  max-width: 80%;
}

.game-over-message h1 {
  font-size: 48px;
  margin: 0 0 20px 0;
  color: #2196F3;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
}

.game-over-message p {
  font-size: 24px;
  margin: 20px 0;
}

.restart-button {
  background-color: #2196F3;
  color: white;
  border: none;
  padding: 12px 30px;
  font-size: 18px;
  border-radius: 30px;
  cursor: pointer;
  margin-top: 20px;
  transition: all 0.2s ease;
  font-weight: bold;
}

.restart-button:hover {
  background-color: #64B5F6;
  transform: scale(1.05);
  box-shadow: 0 0 15px rgba(33, 150, 243, 0.7);
}

/* Player name styles */
.player-name {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  margin-top: 5px;
  font-style: italic;
  display: inline-block;
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 10px;
  border-radius: 12px;
  text-align: center;
}

/* Player info section in game over screen */
.player-info {
  margin: 10px 0;
  padding: 8px;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.player-name-display {
  font-weight: bold;
  color: #4CAF50;
}

.change-name-button {
  margin-left: 10px;
  background-color: #2196F3;
  color: white;
  border: none;
  padding: 4px 10px;
  border-radius: 15px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.change-name-button:hover {
  background-color: #0b7dda;
  transform: scale(1.05);
}

/* Name input dialog */
.name-input-dialog {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: rgba(0, 0, 0, 0.85);
  border: 3px solid #4CAF50;
  border-radius: 15px;
  padding: 30px 50px;
  text-align: center;
  color: white;
  font-family: 'Arial', sans-serif;
  z-index: 1000;
  box-shadow: 0 0 30px rgba(76, 175, 80, 0.5);
  min-width: 400px;
}

.name-input-dialog h1 {
  font-size: 36px;
  margin: 0 0 15px 0;
  color: white;
}

.name-prompt {
  font-size: 18px;
  margin: 20px 0 15px 0;
  color: #ccc;
}

.name-input {
  font-size: 20px;
  padding: 12px 15px;
  border: none;
  border-radius: 8px;
  width: 100%;
  background: rgba(255, 255, 255, 0.9);
  margin-bottom: 25px;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
  text-align: center;
}

.button-container {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.submit-name, .cancel-button {
  border: none;
  padding: 12px 30px;
  font-size: 18px;
  border-radius: 30px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: bold;
}

.submit-name {
  background-color: #4CAF50;
  color: white;
}

.submit-name:hover {
  background-color: #66BB6A;
  transform: scale(1.05);
  box-shadow: 0 0 15px rgba(76, 175, 80, 0.7);
}

.cancel-button {
  background-color: #9e9e9e;
  color: white;
}

.cancel-button:hover {
  background-color: #bdbdbd;
  transform: scale(1.05);
  box-shadow: 0 0 15px rgba(158, 158, 158, 0.7);
}

/* Global high scores styles */
.global-highscores {
  margin-top: 15px;
  width: 100%;
  max-height: 300px;
  overflow-y: auto;
  background-color: rgba(0, 0, 0, 0.4);
  border-radius: 8px;
  padding: 10px;
}

.global-highscores h3 {
  color: #F5F5F5;
  font-size: 22px;
  margin-top: 0;
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding-bottom: 8px;
}

.highscores-table {
  width: 100%;
  border-collapse: collapse;
  color: white;
}

.highscores-table th {
  text-align: left;
  padding: 8px;
  color: #BBB;
  font-size: 14px;
  font-weight: normal;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.highscores-table td {
  padding: 8px;
  font-size: 16px;
}

.highscores-table tr:nth-child(odd) {
  background-color: rgba(255, 255, 255, 0.05);
}

.highscores-table tr.current-player {
  background-color: rgba(76, 175, 80, 0.3);
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.5);
  animation: highlight-player 2s infinite alternate;
}

@keyframes highlight-player {
  0% { background-color: rgba(76, 175, 80, 0.3); }
  100% { background-color: rgba(76, 175, 80, 0.5); }
}

.loading-scores {
  color: #BBB;
  font-style: italic;
  text-align: center;
  padding: 20px;
}

.no-scores, .scores-error {
  color: #BBB;
  text-align: center;
  padding: 15px;
}

.scores-error {
  color: #FF9800;
}
</style> 