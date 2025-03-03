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
      Collect the colorful dots to grow your tail!
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { 
  saveHighScore as saveHighScoreToFirebase, 
  getPlayerHighScore, 
  getTopHighScores, 
  initializeLeaderboardFromExistingData 
} from '@/services/firebase';
import { v4 as uuidv4 } from 'uuid';

// Physics variables
const position = ref({ x: 0, y: 0 });
const velocity = ref({ x: 0, y: 0 });
const acceleration = ref({ x: 0, y: 0 });
const gameRef = ref(null);
const keys = ref({
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false
});

// Mouse control variables
const cursorPosition = ref({ x: 0, y: 0 });
const isMouseControlActive = ref(false);
const MOUSE_INFLUENCE = 0.03; // How strongly the cursor pulls the dot

// Game variables
const tailSegments = ref([]);
const collectibleDots = ref([]);
const positionHistory = ref([]);
const MAX_HISTORY = 300; // Store more positions than we need for smooth following

// Constants for movement physics
const ACCEL_RATE = 0.5;
const DECEL_RATE = 0.85; // Higher value = slower deceleration
const MAX_SPEED = 8;
const DOT_SIZE = 60;
const SPAWN_INTERVAL = 2000; // New dot every 2 seconds
const MAX_COLLECTIBLE_DOTS = 10; // Maximum dots on screen

// Colors for the collectible dots
const COLORS = [
  //'#FF5252', // Red
  '#FF9800', // Orange
  '#FFEB3B', // Yellow
  '#4CAF50', // Green
  '#2196F3', // Blue
  //'#673AB7', // Purple
  '#E91E63', // Pink
  '#00BCD4', // Cyan
  //'#8BC34A', // Light Green
  '#9C27B0'  // Magenta
];

// Add a new ref to track collection state
const isCollecting = ref(false);

// Add score counter
const score = ref(0);

// Add new variables for dynamic spawn timing
let currentSpawnInterval = SPAWN_INTERVAL;
const FAST_SPAWN_INTERVAL = 500; // Spawn every 0.5 seconds when fewer dots

// Add timer variables
const timeRemaining = ref(20);
const gameActive = ref(true);
let countdownInterval = null;

// Add high score variable
const highScore = ref(0);

// Add player name variable
const playerName = ref('');

// Add player ID variable for Firebase
const playerId = ref('');

// Load high score from localStorage
const loadHighScore = () => {
  const savedHighScore = localStorage.getItem('snakeGameHighScore');
  if (savedHighScore !== null) {
    highScore.value = parseInt(savedHighScore);
  }
};

// Save high score to localStorage
const saveHighScore = () => {
  localStorage.setItem('snakeGameHighScore', highScore.value.toString());
};

// Load player name from localStorage
const loadPlayerName = () => {
  const savedName = localStorage.getItem('snakeGamePlayerName');
  if (savedName) {
    playerName.value = savedName;
  }
};

// Save player name to localStorage
const savePlayerName = (name) => {
  playerName.value = name;
  localStorage.setItem('snakeGamePlayerName', name);
};

// Load or generate player ID
const loadOrGeneratePlayerId = () => {
  const savedPlayerId = localStorage.getItem('snakeGamePlayerId');
  if (savedPlayerId) {
    playerId.value = savedPlayerId;
  } else {
    // Generate a new UUID for the player
    playerId.value = uuidv4();
    localStorage.setItem('snakeGamePlayerId', playerId.value);
  }
};

// Modify the spawn mechanism to adjust based on dot count
const adjustSpawnRate = () => {
  // Clear any existing spawn interval
  if (spawnIntervalId) {
    clearInterval(spawnIntervalId);
  }
  
  // Set spawn rate based on current dot count
  const currentDotCount = collectibleDots.value.length;
  
  if (currentDotCount < 5) {
    // Faster spawning when fewer dots
    currentSpawnInterval = FAST_SPAWN_INTERVAL;
  } else {
    // Normal spawn rate
    currentSpawnInterval = SPAWN_INTERVAL;
  }
  
  // Start new interval with adjusted rate
  spawnIntervalId = setInterval(spawnCollectibleDot, currentSpawnInterval);
};

const handleKeyDown = (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    keys.value[event.key] = true;
    event.preventDefault();
  }
};

const handleKeyUp = (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    keys.value[event.key] = false;
    event.preventDefault();
  }
};

// Get a random color from our color array
const getRandomColor = () => {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
};

// Get a random position within the game boundaries
const getRandomPosition = () => {
  if (!gameRef.value) return { x: 0, y: 0 };
  
  const maxX = gameRef.value.clientWidth - DOT_SIZE;
  const maxY = gameRef.value.clientHeight - DOT_SIZE;
  
  return {
    x: Math.floor(Math.random() * maxX),
    y: Math.floor(Math.random() * maxY)
  };
};

// Modify the spawnCollectibleDot function to call adjustSpawnRate after spawning
const spawnCollectibleDot = () => {
  if (collectibleDots.value.length < MAX_COLLECTIBLE_DOTS) {
    collectibleDots.value.push({
      ...getRandomPosition(),
      color: getRandomColor()
    });
    
    // Adjust spawn rate after adding a dot
    adjustSpawnRate();
  }
};

// Check for collisions between the player and collectible dots
const checkCollisions = () => {
  const playerRect = {
    x: position.value.x,
    y: position.value.y,
    width: DOT_SIZE,
    height: DOT_SIZE
  };
  
  // Check each collectible dot
  collectibleDots.value = collectibleDots.value.filter((dot, index) => {
    const dotRect = {
      x: dot.x,
      y: dot.y,
      width: DOT_SIZE,
      height: DOT_SIZE
    };
    
    // Simple collision detection
    const collision = !(
      playerRect.x > dotRect.x + dotRect.width ||
      playerRect.x + playerRect.width < dotRect.x ||
      playerRect.y > dotRect.y + dotRect.height ||
      playerRect.y + playerRect.height < dotRect.y
    );
    
    if (collision) {
      // Calculate score based on snake length (including the new segment we're about to add)
      const pointsEarned = tailSegments.value.length + 1;
      score.value += pointsEarned;
      
      // Show a temporary score popup at the collection point
      const scorePopup = document.createElement('div');
      scorePopup.className = 'score-popup';
      scorePopup.textContent = `+${pointsEarned}`;
      scorePopup.style.left = `${dot.x + DOT_SIZE/2}px`;
      scorePopup.style.top = `${dot.y}px`;
      gameRef.value.appendChild(scorePopup);
      
      // Remove popup after animation
      setTimeout(() => {
        if (scorePopup.parentNode) {
          scorePopup.parentNode.removeChild(scorePopup);
        }
      }, 1000);
      
      // Add new segment at the FRONT of the snake (right behind the player)
      tailSegments.value.unshift({
        x: position.value.x,
        y: position.value.y,
        color: dot.color,
        initialized: false // Will be positioned properly in next frame
      });
      
      // Check for matching colors after adding the new segment
      checkForColorMatches();
      
      // Trigger the pulse effect!
      isCollecting.value = true;
      setTimeout(() => {
        isCollecting.value = false;
      }, 300); // Reset after animation duration
      
      // We've collided, remove the dot
      const result = false;
      
      // Adjust spawn rate since we've collected a dot
      adjustSpawnRate();
      
      return result;
    }
    
    // Keep the dot if no collision
    return true;
  });
};

// Update the position of tail segments to follow the player
const updateTailSegments = () => {
  if (positionHistory.value.length === 0) return;
  
  // Fixed spacing between segments in pixels
  const SEGMENT_SPACING = DOT_SIZE * 1.2;
  
  // Calculate positions using a simpler follow method
  let currentPathLength = 0;
  let lastPos = { ...position.value };
  
  // First segment follows directly behind the player at a fixed distance
  if (tailSegments.value.length > 0) {
    const firstSegment = tailSegments.value[0];
    
    // Initialize the segments with a proper position if they're new
    if (!firstSegment.initialized) {
      firstSegment.x = position.value.x;
      firstSegment.y = position.value.y;
      firstSegment.initialized = true;
    }
    
    // Distance from head to first segment
    const TARGET_DISTANCE = SEGMENT_SPACING;
    
    // Travel back through position history to find the right position
    let targetPos = null;
    let totalDistance = 0;
    
    for (let i = positionHistory.value.length - 1; i >= 1; i--) {
      const pos = positionHistory.value[i];
      const prevPos = positionHistory.value[i - 1];
      
      const segmentDistance = Math.sqrt(
        Math.pow(pos.x - prevPos.x, 2) + 
        Math.pow(pos.y - prevPos.y, 2)
      );
      
      totalDistance += segmentDistance;
      
      if (totalDistance >= TARGET_DISTANCE) {
        // Interpolate to get exact position
        const remainingDistance = totalDistance - TARGET_DISTANCE;
        const ratio = remainingDistance / segmentDistance;
        
        targetPos = {
          x: prevPos.x + (pos.x - prevPos.x) * ratio,
          y: prevPos.y + (pos.y - prevPos.y) * ratio
        };
        break;
      }
    }
    
    // If we found a position along the path
    if (targetPos) {
      // Move smoothly toward target position
      const FOLLOW_SPEED = 0.25;
      firstSegment.x += (targetPos.x - firstSegment.x) * FOLLOW_SPEED;
      firstSegment.y += (targetPos.y - firstSegment.y) * FOLLOW_SPEED;
    }
    
    lastPos = { x: firstSegment.x, y: firstSegment.y };
  }
  
  // Each subsequent segment follows the one in front of it
  for (let i = 1; i < tailSegments.value.length; i++) {
    const segment = tailSegments.value[i];
    const prevSegment = tailSegments.value[i - 1];
    
    // Initialize the segment if it's new
    if (!segment.initialized) {
      segment.x = prevSegment.x;
      segment.y = prevSegment.y;
      segment.initialized = true;
      continue;
    }
    
    // Calculate direction from this segment to the previous one
    const dx = prevSegment.x - segment.x;
    const dy = prevSegment.y - segment.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      // Move toward previous segment while maintaining distance
      const targetDistance = SEGMENT_SPACING;
      
      // If we're too far, move closer
      if (distance > targetDistance * 1.2) {
        const moveX = dx * 0.2;
        const moveY = dy * 0.2;
        segment.x += moveX;
        segment.y += moveY;
      } 
      // If we're at about the right distance, follow normally
      else if (distance > targetDistance * 0.8) {
        const moveX = dx * 0.1;
        const moveY = dy * 0.1;
        segment.x += moveX;
        segment.y += moveY;
      }
      // If we're too close, back away slightly
      else {
        const moveX = dx * 0.05;
        const moveY = dy * 0.05;
        segment.x += moveX;
        segment.y += moveY;
      }
    }
    
    lastPos = { x: segment.x, y: segment.y };
  }
};

// Handle mouse movement
const handleMouseMove = (event) => {
  // Get mouse position relative to the container
  const rect = gameRef.value.getBoundingClientRect();
  cursorPosition.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
  
  // Activate mouse control when mouse moves
  isMouseControlActive.value = true;
  
  // Automatically deactivate mouse control sooner
  clearTimeout(mouseControlTimeout);
  mouseControlTimeout = setTimeout(() => {
    // Only disable if no keys are being pressed
    if (!keys.value.ArrowUp && !keys.value.ArrowDown && 
        !keys.value.ArrowLeft && !keys.value.ArrowRight) {
      isMouseControlActive.value = false;
    }
  }, 2000); // 2 seconds of inactivity disables mouse control (reduced from 5)
};

// Timeout for mouse control deactivation
let mouseControlTimeout;

const updateGame = () => {
  // Only update the game if it's active
  if (gameActive.value) {
    // Store current position in history
    positionHistory.value.push({...position.value});
    // Limit history size
    if (positionHistory.value.length > MAX_HISTORY) {
      positionHistory.value = positionHistory.value.slice(-MAX_HISTORY);
    }
    
    // Calculate acceleration based on input method
    acceleration.value.x = 0;
    acceleration.value.y = 0;
    
    // Handle keyboard input
    if (keys.value.ArrowUp) {
      acceleration.value.y -= ACCEL_RATE;
      isMouseControlActive.value = false; // Keyboard input overrides mouse
    }
    if (keys.value.ArrowDown) {
      acceleration.value.y += ACCEL_RATE;
      isMouseControlActive.value = false;
    }
    if (keys.value.ArrowLeft) {
      acceleration.value.x -= ACCEL_RATE;
      isMouseControlActive.value = false;
    }
    if (keys.value.ArrowRight) {
      acceleration.value.x += ACCEL_RATE;
      isMouseControlActive.value = false;
    }
    
    // Handle mouse input if active and no keyboard keys are pressed
    if (isMouseControlActive.value) {
      // Calculate vector from dot to cursor
      const dx = cursorPosition.value.x - position.value.x - DOT_SIZE/2;
      const dy = cursorPosition.value.y - position.value.y - DOT_SIZE/2;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Only apply force if the cursor is not too close to the dot
      if (distance > 5) {
        // Reduce acceleration strength for mouse control
        const MOUSE_ACCEL_RATE = 0.2; // Much gentler than keyboard control
        
        // Apply a gentler force that increases with distance, but caps out
        const force = Math.min(distance / 100, 1.0); // At most 100% strength
        
        // Normalize and apply force toward cursor, but more gently
        acceleration.value.x += (dx / distance) * MOUSE_ACCEL_RATE * force;
        acceleration.value.y += (dy / distance) * MOUSE_ACCEL_RATE * force;
      }
    }
    
    // Apply acceleration to velocity
    velocity.value.x += acceleration.value.x;
    velocity.value.y += acceleration.value.y;
    
    // Apply friction with stronger damping for mouse control
    if (!keys.value.ArrowLeft && !keys.value.ArrowRight) {
      // More damping when using mouse control for smoother stops
      const frictionFactor = isMouseControlActive.value ? 0.94 : DECEL_RATE;
      velocity.value.x *= frictionFactor;
    }
    if (!keys.value.ArrowUp && !keys.value.ArrowDown) {
      const frictionFactor = isMouseControlActive.value ? 0.94 : DECEL_RATE;
      velocity.value.y *= frictionFactor;
    }
    
    // Limit maximum speed (slower for mouse control)
    const currentMaxSpeed = isMouseControlActive.value ? MAX_SPEED * 0.7 : MAX_SPEED;
    velocity.value.x = Math.max(Math.min(velocity.value.x, currentMaxSpeed), -currentMaxSpeed);
    velocity.value.y = Math.max(Math.min(velocity.value.y, currentMaxSpeed), -currentMaxSpeed);
    
    // Apply velocity to position
    position.value.x += velocity.value.x;
    position.value.y += velocity.value.y;
    
    // Keep dot within boundaries
    if (gameRef.value) {
      const maxX = gameRef.value.clientWidth - DOT_SIZE;
      const maxY = gameRef.value.clientHeight - DOT_SIZE;
      
      // Bounce if hitting wall
      if (position.value.x < 0) {
        position.value.x = 0;
        velocity.value.x *= -0.5; // Bounce effect
      } else if (position.value.x > maxX) {
        position.value.x = maxX;
        velocity.value.x *= -0.5; // Bounce effect
      }
      
      if (position.value.y < 0) {
        position.value.y = 0;
        velocity.value.y *= -0.5; // Bounce effect
      } else if (position.value.y > maxY) {
        position.value.y = maxY;
        velocity.value.y *= -0.5; // Bounce effect
      }
    }
    
    // Check for collisions with collectible dots
    checkCollisions();
    
    // Update tail segment positions
    updateTailSegments();
    
    // Check for color matches (may happen during movement too)
    checkForColorMatches();
    
    // Continue animation if game is active
    animationFrameId = requestAnimationFrame(updateGame);
  }
};

let animationFrameId;
let spawnIntervalId;

// Update the color-matching function to require just TWO matching dots
const checkForColorMatches = () => {
  // Need at least 2 segments to have a match
  if (tailSegments.value.length < 2) return;
  
  // Check for two consecutive segments with the same color
  for (let i = 0; i < tailSegments.value.length - 1; i++) {
    const firstSegment = tailSegments.value[i];
    const secondSegment = tailSegments.value[i + 1];
    
    // If both colors match, create a color explosion!
    if (firstSegment.color === secondSegment.color) {
      const matchedColor = firstSegment.color;
      
      // Calculate the bonus points: 3 * snake length + 50 (keeping same formula)
      const snakeLength = tailSegments.value.length;
      const bonusPoints = (3 * snakeLength) + 50;
      
      // Add the bonus points
      score.value += bonusPoints;
      
      // Create multiple explosions, one for each removed segment
      let explosionPositions = [];
      
      // Find ALL segments with the matching color
      const indicesToRemove = [];
      tailSegments.value.forEach((segment, index) => {
        if (segment.color === matchedColor) {
          // Record the explosion positions
          explosionPositions.push({ x: segment.x, y: segment.y });
          indicesToRemove.push(index);
        }
      });
      
      // Create a master explosion at the center of the two matched segments
      const centerX = (firstSegment.x + secondSegment.x) / 2;
      const centerY = (firstSegment.y + secondSegment.y) / 2;
      
      // Create a larger explosion at the center
      createExplosionEffect(centerX, centerY, matchedColor, 40);
      
      // Create smaller explosions at each removed segment position
      explosionPositions.forEach(pos => {
        createExplosionEffect(pos.x, pos.y, matchedColor, 15);
      });
      
      // Create score popup for the big bonus
      const scorePopup = document.createElement('div');
      scorePopup.className = 'score-popup explosion-score';
      scorePopup.textContent = `+${bonusPoints}`;
      scorePopup.style.left = `${centerX}px`;
      scorePopup.style.top = `${centerY}px`;
      gameRef.value.appendChild(scorePopup);
      
      // Remove popup after animation
      setTimeout(() => {
        if (scorePopup.parentNode) {
          scorePopup.parentNode.removeChild(scorePopup);
        }
      }, 1500);
      
      // Create a text message explaining what happened
      const messagePopup = document.createElement('div');
      messagePopup.className = 'color-match-message';
      messagePopup.textContent = `${matchedColor.toUpperCase()} CHAIN REACTION!`;
      messagePopup.style.left = '50%';
      messagePopup.style.top = '50%';
      messagePopup.style.backgroundColor = matchedColor;
      gameRef.value.appendChild(messagePopup);
      
      // Remove the message after animation
      setTimeout(() => {
        if (messagePopup.parentNode) {
          messagePopup.parentNode.removeChild(messagePopup);
        }
      }, 1500);
      
      // Remove ALL segments with the matching color (in reverse order to avoid index issues)
      for (let j = indicesToRemove.length - 1; j >= 0; j--) {
        tailSegments.value.splice(indicesToRemove[j], 1);
      }
      
      // We modified the array, so return early to avoid index issues
      return;
    }
  }
};

// Update the explosion effect to allow for bigger explosions
const createExplosionEffect = (x, y, color, particleCount = 20) => {
  // Number of particles in explosion - allow for variable amounts
  const PARTICLE_COUNT = particleCount;
  
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Create a particle element
    const particle = document.createElement('div');
    particle.className = 'explosion-particle';
    
    // Set particle position and color
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.backgroundColor = color;
    
    // Calculate random direction and speed
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    const distance = 20 + Math.random() * 100; // Bigger explosion radius
    
    // Set particle animation properties
    particle.style.setProperty('--angle', angle + 'rad');
    particle.style.setProperty('--speed', speed);
    particle.style.setProperty('--distance', distance + 'px');
    
    // Add particle to the DOM
    gameRef.value.appendChild(particle);
    
    // Remove particle after animation completes
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, 1000);
  }
  
  // Create a bigger flash for triple matches
  const flash = document.createElement('div');
  flash.className = 'explosion-flash';
  flash.style.left = `${x}px`;
  flash.style.top = `${y}px`;
  flash.style.backgroundColor = color;
  
  // Adjust flash size based on particle count
  if (particleCount > 20) {
    flash.style.width = '150px';
    flash.style.height = '150px';
  }
  
  gameRef.value.appendChild(flash);
  
  // Remove flash after animation
  setTimeout(() => {
    if (flash.parentNode) {
      flash.parentNode.removeChild(flash);
    }
  }, 500);
};

// Update the startCountdown function to ask for player name when game ends
const startCountdown = () => {
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
      // Game over - stop countdown and animations
      clearInterval(countdownInterval);
      gameActive.value = false;
      
      // Check if we got a new high score
      const isNewHighScore = checkHighScore();
      
      // Show name input if no name is set
      if (!playerName.value) {
        showNameInputDialog(isNewHighScore);
      } else {
        // Show regular game over screen
        showGameOverScreen(isNewHighScore);
      }
    }
  }, 1000);
};

// Function to show the name input dialog
const showNameInputDialog = (isNewHighScore) => {
  const nameDialog = document.createElement('div');
  nameDialog.className = 'name-input-dialog';
  
  nameDialog.innerHTML = `
    <h1>Game Over!</h1>
    <p>Final Score: ${score.value}</p>
    ${isNewHighScore ? '<h2 class="new-highscore">NEW HIGH SCORE!</h2>' : ''}
    <p class="name-prompt">What's your name?</p>
    <input type="text" class="name-input" maxlength="15" placeholder="Enter your name" autofocus>
    <div class="button-container">
      <button class="submit-name">Save & Continue</button>
    </div>
  `;
  
  gameRef.value.appendChild(nameDialog);
  
  // Focus the input field after dialog is visible
  setTimeout(() => {
    const nameInput = nameDialog.querySelector('.name-input');
    if (nameInput) {
      nameInput.focus();
    }
  }, 100);
  
  // Add event listeners for the form
  const nameInput = nameDialog.querySelector('.name-input');
  const submitButton = nameDialog.querySelector('.submit-name');
  
  // Submit on button click
  submitButton.addEventListener('click', () => {
    handleNameSubmit(nameInput.value, nameDialog);
  });
  
  // Also submit on Enter key
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleNameSubmit(nameInput.value, nameDialog);
    }
  });
};

// Sync high score with Firebase
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

// Update the checkHighScore function to also update Firebase
const checkHighScore = async () => {
  const isNewHighScore = score.value > highScore.value;
  
  if (isNewHighScore) {
    highScore.value = score.value;
    saveHighScore();
    
    // Also save to Firebase if we have a player name
    if (playerName.value) {
      try {
        await saveHighScoreToFirebase(playerName.value, score.value, playerId.value);
      } catch (error) {
        console.error("Error saving high score to Firebase:", error);
      }
    }
  }
  
  return isNewHighScore;
};

// Update handleNameSubmit to also save to Firebase
const handleNameSubmit = async (name, dialog) => {
  const trimmedName = name.trim();
  const finalName = trimmedName || 'Player'; // Default to "Player" if empty
  
  // Save the player name
  savePlayerName(finalName);
  
  // Save high score to Firebase
  if (score.value > 0) {
    try {
      await saveHighScoreToFirebase(finalName, score.value, playerId.value);
    } catch (error) {
      console.error("Error saving to Firebase after name submission:", error);
    }
  }
  
  // Remove the dialog
  gameRef.value.removeChild(dialog);
  
  // Show the game over screen
  showGameOverScreen(score.value >= highScore.value);
};

// Function to show the game over screen (moved from countdown)
const showGameOverScreen = async (isNewHighScore) => {
  // Show game over message
  const gameOverMsg = document.createElement('div');
  gameOverMsg.className = 'game-over-message';
  
  // Customize message based on whether it's a new high score
  let highScoreMessage = isNewHighScore 
    ? `<h2 class="new-highscore">NEW HIGH SCORE!</h2>` 
    : `<p class="highscore-info">High Score: ${highScore.value} ${playerName.value ? `(${playerName.value})` : ""}</p>`;
  
  // Initially create the layout with a loading indicator for high scores
  gameOverMsg.innerHTML = `
    <h1>TIME'S UP!</h1>
    <p>Final Score: ${score.value} ${playerName.value ? `(${playerName.value})` : ""}</p>
    ${highScoreMessage}
    <div class="global-highscores">
      <h3>Global Top Scores</h3>
      <div class="loading-scores">Loading scores...</div>
    </div>
    <button class="restart-button">Play Again</button>
  `;
  
  gameRef.value.appendChild(gameOverMsg);
  
  // Add event listener to restart button
  const restartButton = gameOverMsg.querySelector('.restart-button');
  if (restartButton) {
    restartButton.addEventListener('click', restartGame);
  }
  
  // Now fetch the top scores and update the display
  try {
    const topScores = await getTopHighScores(10); // Get top 10 scores
    
    if (topScores && topScores.length > 0) {
      const highscoresContainer = gameOverMsg.querySelector('.global-highscores');
      let highscoresHTML = `
        <h3>Global Top Scores</h3>
        <table class="highscores-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      topScores.forEach((scoreData, index) => {
        // Check if this is the current player's score
        const isCurrentPlayer = scoreData.id === playerId.value;
        const rowClass = isCurrentPlayer ? 'current-player' : '';
        
        highscoresHTML += `
          <tr class="${rowClass}">
            <td>${index + 1}</td>
            <td>${scoreData.name}</td>
            <td>${scoreData.score}</td>
          </tr>
        `;
      });
      
      highscoresHTML += `
          </tbody>
        </table>
      `;
      
      // Replace the loading indicator with the actual scores
      highscoresContainer.innerHTML = highscoresHTML;
    } else {
      // Handle case where there are no scores yet
      const highscoresContainer = gameOverMsg.querySelector('.global-highscores');
      highscoresContainer.innerHTML = `
        <h3>Global Top Scores</h3>
        <p class="no-scores">No scores recorded yet. You could be the first!</p>
      `;
    }
  } catch (error) {
    console.error("Error fetching top scores:", error);
    // Show error message
    const highscoresContainer = gameOverMsg.querySelector('.global-highscores');
    highscoresContainer.innerHTML = `
      <h3>Global Top Scores</h3>
      <p class="scores-error">Could not load scores. Please check your connection.</p>
    `;
  }
};

// Function to restart the game
const restartGame = () => {
  // Reset game state
  timeRemaining.value = 20;
  score.value = 0;
  tailSegments.value = [];
  collectibleDots.value = [];
  position.value = { x: gameRef.value.clientWidth / 2, y: gameRef.value.clientHeight / 2 };
  velocity.value = { x: 0, y: 0 };
  
  // Remove game over message
  const gameOverMsg = document.querySelector('.game-over-message');
  if (gameOverMsg && gameOverMsg.parentNode) {
    gameOverMsg.parentNode.removeChild(gameOverMsg);
  }
  
  // Restart the game
  gameActive.value = true;
  startCountdown();
  
  // Spawn initial dots
  for (let i = 0; i < 5; i++) {
    spawnCollectibleDot();
  }
  
  // IMPORTANT: Restart the animation frame loop!
  animationFrameId = requestAnimationFrame(updateGame);
  
  // Reset history and reset focus on game container
  positionHistory.value = [];
  gameRef.value.focus();
};

onMounted(() => {
  // Center the dot
  if (gameRef.value) {
    position.value = {
      x: (gameRef.value.clientWidth - DOT_SIZE) / 2,
      y: (gameRef.value.clientHeight - DOT_SIZE) / 2
    };
  }
  
  // Focus the game container so it can receive keyboard events
  gameRef.value?.focus();
  
  // Start the game loop
  animationFrameId = requestAnimationFrame(updateGame);
  
  // Start spawning collectible dots with dynamic rate
  adjustSpawnRate();
  
  // Spawn a few dots immediately
  for (let i = 0; i < 5; i++) {
    spawnCollectibleDot();
  }
  
  // Initialize cursor position
  if (gameRef.value) {
    cursorPosition.value = {
      x: (gameRef.value.clientWidth) / 2,
      y: (gameRef.value.clientHeight) / 2
    };
  }
  
  // Start the countdown
  startCountdown();
  
  // Load high score, player name and ID from localStorage
  loadHighScore();
  loadPlayerName();
  loadOrGeneratePlayerId();
  
  // Sync with Firebase after a short delay to ensure we have loaded local data
  setTimeout(async () => {
    await syncHighScore();
    
    // Initialize the leaderboard if needed (only runs once)
    await initializeLeaderboardFromExistingData();
  }, 1000);
});

onUnmounted(() => {
  // Clean up animation frame when component unmounts
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  
  // Clear the spawn interval
  if (spawnIntervalId) {
    clearInterval(spawnIntervalId);
  }
  
  // Clear mouse control timeout
  if (mouseControlTimeout) {
    clearTimeout(mouseControlTimeout);
  }
  
  // Clear countdown interval
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
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
}

.submit-name {
  background-color: #4CAF50;
  color: white;
  border: none;
  padding: 12px 30px;
  font-size: 18px;
  border-radius: 30px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: bold;
}

.submit-name:hover {
  background-color: #66BB6A;
  transform: scale(1.05);
  box-shadow: 0 0 15px rgba(76, 175, 80, 0.7);
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
