<template>
  <div 
    class="game-container" 
    :class="{ 'game-active': gameActive }"
    @keydown="handleKeyDown" 
    @keyup="handleKeyUp" 
    @mousemove="handleMouseMove"
    @mousedown="isMouseControlActive = true"
    tabindex="0" 
    ref="gameRef"
  >
    <!-- Score counter, high score and timer -->
    <div class="score-display">
      <span class="score-value">{{ score }}</span>
      <span class="score-label">POINTS</span>
      
      <div class="highscore-container">
        <span class="highscore-value">{{ highScore }}</span>
        <span class="highscore-label">HIGH SCORE</span>
        <span v-if="playerName" class="player-name">{{ playerName }}</span>
      </div>
      
      <div class="timer-container">
        <span class="timer-value" :class="{ 'timer-low': timeRemaining <= 5 }">{{ timeRemaining }}</span>
        <span class="timer-label">SECONDS</span>
      </div>
    </div>
    
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
import { ref, onMounted, onUnmounted } from 'vue';
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
  score, timeRemaining, gameActive, highScore, playerName, playerId,
  loadHighScore, saveHighScore, loadPlayerName, savePlayerName,
  loadOrGeneratePlayerId, checkHighScore, startCountdown, addPoints,
  resetGame, cleanup: cleanupGameState
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

// Animation frame ID for game loop
let animationFrameId;

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
        createScorePopup(newSegment.x + DOT_SIZE/2, newSegment.y, pointsEarned);
      }
    );
    
    // Update tail segment positions
    updateTailSegments();
    
    // Check for color matches
    checkForColorMatches();
    
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
 * Handle game over - called when time runs out
 */
const handleGameOver = async () => {
  try {
    // Check if it's a new high score
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
    if (playerName.value && score.value > 0) {
      await saveHighScoreToFirebase(playerName.value, score.value, playerId.value);
    }
    
    // Restart the game
    restartGame();
  } catch (error) {
    console.error("Error handling game over:", error);
  }
};

/**
 * Restart the game
 */
const restartGame = () => {
  // Reset game state
  resetGame();
  
  // Clear tail segments and collectible dots
  tailSegments.value = [];
  collectibleDots.value = [];
  
  // Reset player position
  position.value = { x: gameRef.value.clientWidth / 2, y: gameRef.value.clientHeight / 2 };
  velocity.value = { x: 0, y: 0 };
  
  // Restart the game
  gameActive.value = true;
  startCountdown(handleGameOver);
  
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
  
  // Start the game loop
  animationFrameId = requestAnimationFrame(updateGame);
  
  // Start spawning collectible dots
  startSpawning();
  
  // Start the countdown
  startCountdown(handleGameOver);
  
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

/* Add a subtle squish effect when segments collide */
@keyframes squish {
  0% { transform: scale(1, 1); }
  50% { transform: scale(1.1, 0.9); }
  100% { transform: scale(1, 1); }
}

/* Add a cursor indicator */
.cursor-indicator {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 200;
}

/* Score counter styles */
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

.score-value {
  font-size: 42px;
  font-weight: bold;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.7);
}

.score-label {
  font-size: 14px;
  letter-spacing: 2px;
  opacity: 0.8;
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

/* Timer styles */
.timer-container {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-top: 2px solid rgba(255, 255, 255, 0.3);
  padding-top: 8px;
}

.timer-value {
  font-size: 36px;
  font-weight: bold;
  color: #ffffff;
}

.timer-label {
  font-size: 12px;
  letter-spacing: 2px;
  opacity: 0.8;
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

/* Game over screen */
.game-over-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: rgba(0, 0, 0, 0.8);
  border: 3px solid #FF5252;
  border-radius: 15px;
  padding: 30px 50px;
  text-align: center;
  color: white;
  font-family: 'Arial', sans-serif;
  z-index: 1000;
  box-shadow: 0 0 30px rgba(255, 82, 82, 0.5);
  min-width: 450px;
  max-width: 80%;
}

.game-over-message h1 {
  font-size: 48px;
  margin: 0 0 20px 0;
  color: #FF5252;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
}

.game-over-message p {
  font-size: 24px;
  margin: 20px 0;
}

.restart-button {
  background-color: #FF5252;
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
  background-color: #FF7070;
  transform: scale(1.05);
  box-shadow: 0 0 15px rgba(255, 82, 82, 0.7);
}

/* High score styles */
.highscore-container {
  margin-top: 8px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-top: 2px solid rgba(255, 255, 255, 0.3);
  border-bottom: 2px solid rgba(255, 255, 255, 0.3);
  padding: 8px 0;
}

.highscore-value {
  font-size: 28px;
  font-weight: bold;
  color: gold;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.7);
}

.highscore-label {
  font-size: 12px;
  letter-spacing: 2px;
  opacity: 0.8;
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

/* Player name styles */
.player-name {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  margin-top: 5px;
  font-style: italic;
  display: inline-block;
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 8px;
  border-radius: 12px;
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