<template>
  <div class="game-container" @keydown="moveRedDot" tabindex="0" ref="gameRef">
    <div class="red-dot" :style="{ left: position.x + 'px', top: position.y + 'px' }"></div>
    <div class="instructions">Use arrow keys to move the red dot</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const position = ref({ x: 50, y: 50 });
const gameRef = ref(null);

const moveRedDot = (event) => {
  const step = 10;
  
  switch(event.key) {
    case 'ArrowUp':
      position.value.y = Math.max(0, position.value.y - step);
      break;
    case 'ArrowDown':
      position.value.y = Math.min(gameRef.value.clientHeight - 20, position.value.y + step);
      break;
    case 'ArrowLeft':
      position.value.x = Math.max(0, position.value.x - step);
      break;
    case 'ArrowRight':
      position.value.x = Math.min(gameRef.value.clientWidth - 20, position.value.x + step);
      break;
  }
};

onMounted(() => {
  // Focus the game container so it can receive keyboard events
  gameRef.value?.focus();
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
  transition: all 0.1s ease;
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
