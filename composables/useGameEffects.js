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
   * Check for consecutive segments with the same color and trigger chain reactions
   */
  const checkForColorMatches = () => {
    // Need at least 3 segments to have a match
    if (tailSegments.value.length < 3) return false;
    
    // Look for sequences of same-colored dots (minimum 3 in a row)
    let colorSequences = findColorSequences();
    
    // If we found any valid sequences, process them
    if (colorSequences.length > 0) {
      // Sort sequences by length (longest first for bigger explosions)
      colorSequences.sort((a, b) => b.indices.length - a.indices.length);
      
      // Process each sequence
      colorSequences.forEach(sequence => {
        processColorSequence(sequence);
      });
      
      // After processing sequences, check if new ones have formed
      setTimeout(() => {
        checkForColorMatches();
      }, 200);
      
      return true;
    }
    
    // No matches found
    return false;
  };
  
  /**
   * Find all sequences of 3+ same-colored dots
   */
  const findColorSequences = () => {
    const sequences = [];
    let currentColor = null;
    let currentIndices = [];
    
    // Scan through all tail segments looking for sequences
    for (let i = 0; i < tailSegments.value.length; i++) {
      const segment = tailSegments.value[i];
      
      if (currentColor === segment.color) {
        // Continue the current sequence
        currentIndices.push(i);
      } else {
        // If we have a sequence of 3 or more, save it
        if (currentIndices.length >= 3) {
          sequences.push({
            color: currentColor,
            indices: [...currentIndices]
          });
        }
        
        // Start a new sequence
        currentColor = segment.color;
        currentIndices = [i];
      }
    }
    
    // Check if the last sequence is valid
    if (currentIndices.length >= 3) {
      sequences.push({
        color: currentColor,
        indices: [...currentIndices]
      });
    }
    
    return sequences;
  };
  
  /**
   * Process a color sequence chain reaction
   */
  const processColorSequence = (sequence) => {
    const { color, indices } = sequence;
    
    // Find all segments of the same color (including ones not in the sequence)
    const allMatchingIndices = [];
    tailSegments.value.forEach((segment, index) => {
      if (segment.color === color) {
        allMatchingIndices.push(index);
      }
    });
    
    // Calculate the multiplier based on sequence length
    const multiplier = Math.min(indices.length, 6); // Cap at 6x for balance
    
    // Gather explosion positions and calculate points
    let explosionPositions = [];
    let totalBonusPoints = 0;
    
    // Calculate center position of the sequence for the main explosion
    let centerX = 0;
    let centerY = 0;
    
    indices.forEach(index => {
      const segment = tailSegments.value[index];
      centerX += segment.x;
      centerY += segment.y;
    });
    
    centerX /= indices.length;
    centerY /= indices.length;
    
    // Sort all matching indices in reverse order so we process from tail end first
    allMatchingIndices.sort((a, b) => b - a);
    
    // For each matching segment, calculate points and create explosion
    let currentTailLength = tailSegments.value.length;
    allMatchingIndices.forEach(index => {
      const segment = tailSegments.value[index];
      
      // Each dot pays points based on current tail length times the multiplier
      const pointsForThisDot = currentTailLength * multiplier;
      totalBonusPoints += pointsForThisDot;
      
      // Record explosion position
      explosionPositions.push({ 
        x: segment.x, 
        y: segment.y,
        points: pointsForThisDot 
      });
      
      // Decrease the current tail length for next calculation
      currentTailLength--;
    });
    
    // Create the main explosion at the center of the sequence
    createExplosionEffect(centerX, centerY, color, multiplier * 10);
    
    // Create individual explosions and score popups for each segment
    explosionPositions.forEach(pos => {
      createExplosionEffect(pos.x, pos.y, color, 15);
      createScorePopup(pos.x, pos.y, pos.points, false);
    });
    
    // Create a big score popup for the total
    createScorePopup(centerX, centerY, totalBonusPoints, true);
    
    // Create a text message explaining what happened
    let message = "";
    if (multiplier >= 6) {
      message = `MEGA ${color.toUpperCase()} CHAIN REACTION! (${multiplier}×)`;
    } else if (multiplier >= 5) {
      message = `SUPER ${color.toUpperCase()} CHAIN REACTION! (${multiplier}×)`;
    } else if (multiplier >= 4) {
      message = `AWESOME ${color.toUpperCase()} CHAIN REACTION! (${multiplier}×)`;
    } else {
      message = `${color.toUpperCase()} CHAIN REACTION! (${multiplier}×)`;
    }
    createMessage(message, color);
    
    // Add the total bonus points
    addPoints(totalBonusPoints);
    
    // Remove ALL segments with the matching color (in reverse order)
    for (let i = allMatchingIndices.length - 1; i >= 0; i--) {
      tailSegments.value.splice(allMatchingIndices[i], 1);
    }
  };

  return {
    createExplosionEffect,
    createScorePopup,
    createMessage,
    checkForColorMatches
  };
} 