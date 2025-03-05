import { ref, computed } from 'vue';

/**
 * Handles game physics including movement, controls, and boundaries
 */
export function useGamePhysics(gameRef) {
  // Physics variables
  const position = ref({ x: 0, y: 0 });
  const velocity = ref({ x: 0, y: 0 });
  const acceleration = ref({ x: 0, y: 0 });
  const keys = ref({
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
  });

  // Mouse control variables
  const cursorPosition = ref({ x: 0, y: 0 });
  const isMouseControlActive = ref(false);
  const MOUSE_INFLUENCE = 0.05; // Increased from 0.03 for stronger mouse pull
  let mouseControlTimeout;

  // Constants for movement physics
  const ACCEL_RATE = 0.7;
  const DECEL_RATE = 0.9;
  const MAX_SPEED = 12;
  const DOT_SIZE = 60;

  // Position history for tail segments
  const positionHistory = ref([]);
  const MAX_HISTORY = 300; // Store more positions than we need for smooth following

  /**
   * Handle keyboard key down events
   */
  const handleKeyDown = (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      keys.value[event.key] = true;
      event.preventDefault();
    }
  };

  /**
   * Handle keyboard key up events
   */
  const handleKeyUp = (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      keys.value[event.key] = false;
      event.preventDefault();
    }
  };

  /**
   * Handle mouse movement for alternative control scheme
   */
  const handleMouseMove = (event) => {
    if (!gameRef.value) return;
    
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
    }, 2000); // 2 seconds of inactivity disables mouse control
  };

  /**
   * Calculate physics for player movement based on keyboard/mouse input
   * Returns updated position and velocity
   */
  const calculateMovement = () => {
    // Store current position in history
    positionHistory.value.push({...position.value});
    // Limit history size
    if (positionHistory.value.length > MAX_HISTORY) {
      positionHistory.value = positionHistory.value.slice(-MAX_HISTORY);
    }
    
    // Reset acceleration
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
        const MOUSE_ACCEL_RATE = 0.3; // Increased from 0.2 for faster mouse response
        
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
  };

  /**
   * Initialize player position to center of game area
   */
  const initializePosition = () => {
    if (!gameRef.value) return;
    
    position.value = {
      x: (gameRef.value.clientWidth - DOT_SIZE) / 2,
      y: (gameRef.value.clientHeight - DOT_SIZE) / 2
    };
    
    // Initialize cursor position too
    cursorPosition.value = {
      x: (gameRef.value.clientWidth) / 2,
      y: (gameRef.value.clientHeight) / 2
    };
  };

  /**
   * Clean up any timers or listeners
   */
  const cleanup = () => {
    if (mouseControlTimeout) {
      clearTimeout(mouseControlTimeout);
    }
  };

  return {
    // State
    position,
    velocity,
    acceleration,
    cursorPosition,
    isMouseControlActive,
    positionHistory,
    keys,
    DOT_SIZE,
    
    // Methods
    handleKeyDown,
    handleKeyUp,
    handleMouseMove,
    calculateMovement,
    initializePosition,
    cleanup
  };
} 