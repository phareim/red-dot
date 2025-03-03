<template>
  <div class="game-container" @keydown="handleKeyDown" @keyup="handleKeyUp" tabindex="0" ref="gameRef">
    <div class="red-dot" :style="{ left: position.x + 'px', top: position.y + 'px' }"></div>
    <div class="instructions" alt="Use the arrow keys to move the red dot around the screen."></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

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

// Constants for movement physics
const ACCEL_RATE = 0.5;
const DECEL_RATE = 0.85; // Higher value = slower deceleration
const MAX_SPEED = 8;

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

const updateGame = () => {
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
    const dotSize = 20;
    const maxX = gameRef.value.clientWidth - dotSize;
    const maxY = gameRef.value.clientHeight - dotSize;
    
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
  
  // Continue animation
  animationFrameId = requestAnimationFrame(updateGame);
};

let animationFrameId;

onMounted(() => {
  // Center the dot
  if (gameRef.value) {
    position.value = {
      x: (gameRef.value.clientWidth - 20) / 2,
      y: (gameRef.value.clientHeight - 20) / 2
    };
  }
  
  // Focus the game container so it can receive keyboard events
  gameRef.value?.focus();
  
  // Start the game loop
  animationFrameId = requestAnimationFrame(updateGame);
});

onUnmounted(() => {
  // Clean up animation frame when component unmounts
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
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
</style>
