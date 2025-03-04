import { ref, computed } from 'vue';

/**
 * Manages game entities like tail segments and collectible dots
 */
export function useGameEntities(gameRef, position, positionHistory, DOT_SIZE) {
  // Game entities
  const tailSegments = ref([]);
  const collectibleDots = ref([]);

  // Constants for collectible dots
  const SPAWN_INTERVAL = 2000; // New dot every 2 seconds
  const MAX_COLLECTIBLE_DOTS = 10; // Maximum dots on screen
  const FAST_SPAWN_INTERVAL = 500; // Spawn every 0.5 seconds when fewer dots
  let currentSpawnInterval = SPAWN_INTERVAL;
  let spawnIntervalId = null;

  // Add a ref to track collection state
  const isCollecting = ref(false);

  // Colors for the collectible dots
  const COLORS = [
    //'#FF5252', // Red - disabled as it matches player color
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

  /**
   * Get a random color from our color array
   */
  const getRandomColor = () => {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  };

  /**
   * Get a random position within the game boundaries
   */
  const getRandomPosition = () => {
    if (!gameRef.value) return { x: 0, y: 0 };
    
    const maxX = gameRef.value.clientWidth - DOT_SIZE;
    const maxY = gameRef.value.clientHeight - DOT_SIZE;
    
    return {
      x: Math.floor(Math.random() * maxX),
      y: Math.floor(Math.random() * maxY)
    };
  };

  /**
   * Adjust the spawn rate based on the number of dots
   */
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

  /**
   * Spawn a collectible dot at a random position
   */
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

  /**
   * Update the position of tail segments to follow the player
   */
  const updateTailSegments = () => {
    if (positionHistory.value.length === 0) return;
    
    // Fixed spacing between segments in pixels
    const SEGMENT_SPACING = DOT_SIZE * 1.2;
    
    // Calculate positions using a simpler follow method
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

  /**
   * Check for collisions between the player and collectible dots
   * Returns true if a collision was detected
   */
  const checkCollisions = (addTailSegment, triggerCollection) => {
    const playerRect = {
      x: position.value.x,
      y: position.value.y,
      width: DOT_SIZE,
      height: DOT_SIZE
    };
    
    let collisionDetected = false;
    
    // Check each collectible dot
    collectibleDots.value = collectibleDots.value.filter((dot) => {
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
        collisionDetected = true;
        
        // Add new segment callback
        addTailSegment({
          x: position.value.x,
          y: position.value.y,
          color: dot.color,
          initialized: false // Will be positioned properly in next frame
        });
        
        // Trigger collection animation
        isCollecting.value = true;
        setTimeout(() => {
          isCollecting.value = false;
        }, 300);
        
        // Call the provided collection callback if given
        if (triggerCollection) {
          triggerCollection(dot);
        }
        
        // Adjust spawn rate since we've collected a dot
        adjustSpawnRate();
        
        // Remove the dot (return false to filter it out)
        return false;
      }
      
      // Keep the dot if no collision
      return true;
    });
    
    return collisionDetected;
  };

  /**
   * Start spawning collectible dots
   */
  const startSpawning = () => {
    // Stop any existing interval
    if (spawnIntervalId) {
      clearInterval(spawnIntervalId);
    }
    
    // Set initial spawn rate
    adjustSpawnRate();
    
    // Spawn a few dots immediately
    for (let i = 0; i < 5; i++) {
      spawnCollectibleDot();
    }
  };

  /**
   * Clean up timers when component unmounts
   */
  const cleanup = () => {
    if (spawnIntervalId) {
      clearInterval(spawnIntervalId);
    }
  };

  return {
    // State
    tailSegments,
    collectibleDots,
    isCollecting,
    COLORS,
    
    // Methods
    updateTailSegments,
    checkCollisions,
    spawnCollectibleDot,
    startSpawning,
    cleanup
  };
} 