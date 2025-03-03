<template>
  <div 
    class="game-container" 
    @keydown="handleKeyDown" 
    @keyup="handleKeyUp" 
    @mousemove="handleMouseMove"
    @mousedown="isMouseControlActive = true"
    tabindex="0" 
    ref="gameRef"
  >
    <!-- Score counter -->
    <div class="score-display">
      <span class="score-value">{{ score }}</span>
      <span class="score-label">POINTS</span>
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
const DOT_SIZE = 80;
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
  //'#E91E63', // Pink
  //'#00BCD4', // Cyan
  //'#8BC34A', // Light Green
  '#9C27B0'  // Magenta
];

// Add a new ref to track collection state
const isCollecting = ref(false);

// Add score counter
const score = ref(0);

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

// Spawn a new collectible dot if we have fewer than the max
const spawnCollectibleDot = () => {
  if (collectibleDots.value.length < MAX_COLLECTIBLE_DOTS) {
    collectibleDots.value.push({
      ...getRandomPosition(),
      color: getRandomColor()
    });
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
      // Increment score!
      score.value += 10;
      
      // Show a temporary score popup at the collection point
      const scorePopup = document.createElement('div');
      scorePopup.className = 'score-popup';
      scorePopup.textContent = '+10';
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
      return false;
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
  
  // Continue animation
  animationFrameId = requestAnimationFrame(updateGame);
};

let animationFrameId;
let spawnIntervalId;

// Update the color-matching function to require three matching dots
const checkForColorMatches = () => {
  // Need at least 3 segments to have a match
  if (tailSegments.value.length < 3) return;
  
  // Check for three consecutive segments with the same color
  for (let i = 0; i < tailSegments.value.length - 2; i++) {
    const firstSegment = tailSegments.value[i];
    const secondSegment = tailSegments.value[i + 1];
    const thirdSegment = tailSegments.value[i + 2];
    
    // If all three colors match, create a bigger explosion!
    if (firstSegment.color === secondSegment.color && secondSegment.color === thirdSegment.color) {
      // Calculate middle position for the explosion (center of the three segments)
      const explosionX = (firstSegment.x + secondSegment.x + thirdSegment.x) / 3;
      const explosionY = (firstSegment.y + secondSegment.y + thirdSegment.y) / 3;
      
      // Create a bigger explosion effect
      createExplosionEffect(explosionX, explosionY, firstSegment.color, 30); // More particles!
      
      // Add bonus points - more points for 3 matches!
      score.value += 100;
      
      // Create score popup
      const scorePopup = document.createElement('div');
      scorePopup.className = 'score-popup explosion-score';
      scorePopup.textContent = '+100';
      scorePopup.style.left = `${explosionX}px`;
      scorePopup.style.top = `${explosionY}px`;
      gameRef.value.appendChild(scorePopup);
      
      // Remove after animation
      setTimeout(() => {
        if (scorePopup.parentNode) {
          scorePopup.parentNode.removeChild(scorePopup);
        }
      }, 1500);
      
      // Remove all three segments
      tailSegments.value.splice(i, 3);
      
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
  
  // Start spawning collectible dots
  spawnIntervalId = setInterval(spawnCollectibleDot, SPAWN_INTERVAL);
  
  // Spawn a few dots immediately
  for (let i = 0; i < 3; i++) {
    spawnCollectibleDot();
  }
  
  // Initialize cursor position
  if (gameRef.value) {
    cursorPosition.value = {
      x: (gameRef.value.clientWidth) / 2,
      y: (gameRef.value.clientHeight) / 2
    };
  }
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
});
</script>

<style>
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
}

.game-container {
  background-color: black;
  width: 100vw;
  height: 100vh;
  position: relative;
  outline: none;
  cursor: none; /* Hide the cursor for a cleaner experience */
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
</style>
