import { ref } from 'vue';

/**
 * Handles game visual effects and special gameplay mechanics like color matching
 */
export function useGameEffects(gameRef, tailSegments, addPoints) {
  /**
   * Create explosion particle effect
   */
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

  /**
   * Display score popup at a specific location
   */
  const createScorePopup = (x, y, points, isExplosion = false) => {
    // Create score popup
    const scorePopup = document.createElement('div');
    scorePopup.className = isExplosion ? 'score-popup explosion-score' : 'score-popup';
    scorePopup.textContent = `+${points}`;
    scorePopup.style.left = `${x}px`;
    scorePopup.style.top = `${y}px`;
    
    gameRef.value.appendChild(scorePopup);
    
    // Remove popup after animation
    setTimeout(() => {
      if (scorePopup.parentNode) {
        scorePopup.parentNode.removeChild(scorePopup);
      }
    }, isExplosion ? 1500 : 1000);
  };

  /**
   * Display a text message in the game area
   */
  const createMessage = (text, color, duration = 1500) => {
    const messagePopup = document.createElement('div');
    messagePopup.className = 'color-match-message';
    messagePopup.textContent = text;
    messagePopup.style.left = '50%';
    messagePopup.style.top = '50%';
    messagePopup.style.backgroundColor = color;
    
    gameRef.value.appendChild(messagePopup);
    
    // Remove the message after animation
    setTimeout(() => {
      if (messagePopup.parentNode) {
        messagePopup.parentNode.removeChild(messagePopup);
      }
    }, duration);
  };

  /**
   * Check for color matches in tail segments
   * Returns true if a match was found and processed
   */
  const checkForColorMatches = () => {
    // Need at least 2 segments to have a match
    if (tailSegments.value.length < 2) return false;
    
    // Check for two consecutive segments with the same color
    for (let i = 0; i < tailSegments.value.length - 1; i++) {
      const firstSegment = tailSegments.value[i];
      const secondSegment = tailSegments.value[i + 1];
      
      // If both colors match, create a color explosion!
      if (firstSegment.color === secondSegment.color) {
        const matchedColor = firstSegment.color;
        
        // Calculate the bonus points: 3 * snake length + 50
        const snakeLength = tailSegments.value.length;
        const bonusPoints = (3 * snakeLength) + 50;
        
        // Add the bonus points
        addPoints(bonusPoints);
        
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
        createScorePopup(centerX, centerY, bonusPoints, true);
        
        // Create a text message explaining what happened
        createMessage(`${matchedColor.toUpperCase()} CHAIN REACTION!`, matchedColor);
        
        // Remove ALL segments with the matching color (in reverse order to avoid index issues)
        for (let j = indicesToRemove.length - 1; j >= 0; j--) {
          tailSegments.value.splice(indicesToRemove[j], 1);
        }
        
        // We found and processed a match
        return true;
      }
    }
    
    // No matches found
    return false;
  };

  return {
    createExplosionEffect,
    createScorePopup,
    createMessage,
    checkForColorMatches
  };
} 