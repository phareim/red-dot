<template>
  <div class="game-container" @keydown="handleKeyDown" @keyup="handleKeyUp" tabindex="0" ref="gameRef">
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

// Game variables
const tailSegments = ref([]);
const collectibleDots = ref([]);
const positionHistory = ref([]);
const MAX_HISTORY = 300; // Store more positions than we need for smooth following

// Constants for movement physics
const ACCEL_RATE = 0.5;
const DECEL_RATE = 0.85; // Higher value = slower deceleration
const MAX_SPEED = 8;
const DOT_SIZE = 20;
const SPAWN_INTERVAL = 2000; // New dot every 2 seconds
const MAX_COLLECTIBLE_DOTS = 10; // Maximum dots on screen

// Colors for the collectible dots
const COLORS = [
  '#FF5252', // Red
  '#FF9800', // Orange
  '#FFEB3B', // Yellow
  '#4CAF50', // Green
  '#2196F3', // Blue
  '#673AB7', // Purple
  '#E91E63', // Pink
  '#00BCD4', // Cyan
  '#8BC34A', // Light Green
  '#9C27B0'  // Magenta
];

// Add a new ref to track collection state
const isCollecting = ref(false);

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
      // Add to tail
      tailSegments.value.push({
        x: dot.x,
        y: dot.y,
        color: dot.color,
        followIndex: Math.max(20 * tailSegments.value.length, 3) // Spacing between segments
      });
      
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
  
  tailSegments.value.forEach((segment, index) => {
    // Get the position from history based on the follow index
    const historyIndex = Math.max(0, positionHistory.value.length - segment.followIndex);
    if (historyIndex >= 0 && historyIndex < positionHistory.value.length) {
      segment.x = positionHistory.value[historyIndex].x;
      segment.y = positionHistory.value[historyIndex].y;
    }
  });
};

const updateGame = () => {
  // Store current position in history
  positionHistory.value.push({...position.value});
  // Limit history size
  if (positionHistory.value.length > MAX_HISTORY) {
    positionHistory.value = positionHistory.value.slice(-MAX_HISTORY);
  }
  
  // Calculate acceleration based on keys pressed
  acceleration.value.x = 0;
  acceleration.value.y = 0;
  
  if (keys.value.ArrowUp) acceleration.value.y -= ACCEL_RATE;
  if (keys.value.ArrowDown) acceleration.value.y += ACCEL_RATE;
  if (keys.value.ArrowLeft) acceleration.value.x -= ACCEL_RATE;
  if (keys.value.ArrowRight) acceleration.value.x += ACCEL_RATE;
  
  // Apply acceleration to velocity
  velocity.value.x += acceleration.value.x;
  velocity.value.y += acceleration.value.y;
  
  // Apply friction (deceleration) if no keys pressed in that direction
  if (!keys.value.ArrowLeft && !keys.value.ArrowRight) {
    velocity.value.x *= DECEL_RATE;
  }
  if (!keys.value.ArrowUp && !keys.value.ArrowDown) {
    velocity.value.y *= DECEL_RATE;
  }
  
  // Limit maximum speed
  velocity.value.x = Math.max(Math.min(velocity.value.x, MAX_SPEED), -MAX_SPEED);
  velocity.value.y = Math.max(Math.min(velocity.value.y, MAX_SPEED), -MAX_SPEED);
  
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
  
  // Continue animation
  animationFrameId = requestAnimationFrame(updateGame);
};

let animationFrameId;
let spawnIntervalId;

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
}

.red-dot {
  position: absolute;
  width: 20px;
  height: 20px;
  background-color: red;
  border-radius: 50%;
  z-index: 100;
}

.tail-segment {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  /* Each segment will have its own color via inline style */
}

.collectible-dot {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  /* Each dot will have its own color via inline style */
  animation: pulse 1.5s infinite alternate;
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
</style>
