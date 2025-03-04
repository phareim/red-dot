import { ref } from 'vue';

/**
 * Manages game UI components like game over screens, name input dialogs, etc.
 */
export function useGameUI(gameRef, score, highScore, playerName) {
  /**
   * Show name input dialog
   * Returns a Promise that resolves with the entered name
   */
  const showNameInputDialog = (isNewHighScore) => {
    return new Promise((resolve) => {
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
      
      const handleSubmit = () => {
        const name = nameInput.value.trim() || 'Player';
        
        // Remove the dialog
        if (gameRef.value.contains(nameDialog)) {
          gameRef.value.removeChild(nameDialog);
        }
        
        // Resolve the promise with the name
        resolve(name);
      };
      
      // Submit on button click
      submitButton.addEventListener('click', handleSubmit);
      
      // Also submit on Enter key
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          handleSubmit();
        }
      });
    });
  };

  /**
   * Show game over screen with high scores
   * Returns a Promise that resolves when the user clicks "Play Again"
   */
  const showGameOverScreen = async (isNewHighScore, getTopScores) => {
    return new Promise((resolve) => {
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
        restartButton.addEventListener('click', () => {
          // Remove the game over screen
          if (gameRef.value.contains(gameOverMsg)) {
            gameRef.value.removeChild(gameOverMsg);
          }
          
          // Resolve the promise to continue
          resolve();
        });
      }
      
      // Fetch and display top scores if function is provided
      if (getTopScores) {
        getTopScores(10).then((topScores) => {
          const highscoresContainer = gameOverMsg.querySelector('.global-highscores');
          
          if (topScores && topScores.length > 0) {
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
              const isCurrentPlayer = scoreData.id === localStorage.getItem('snakeGamePlayerId');
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
            highscoresContainer.innerHTML = `
              <h3>Global Top Scores</h3>
              <p class="no-scores">No scores recorded yet. You could be the first!</p>
            `;
          }
        }).catch(error => {
          console.error("Error fetching top scores:", error);
          // Show error message
          const highscoresContainer = gameOverMsg.querySelector('.global-highscores');
          highscoresContainer.innerHTML = `
            <h3>Global Top Scores</h3>
            <p class="scores-error">Could not load scores. Please check your connection.</p>
          `;
        });
      } else {
        // If no function to get scores, just show a message
        const highscoresContainer = gameOverMsg.querySelector('.global-highscores');
        highscoresContainer.innerHTML = `
          <h3>Global Top Scores</h3>
          <p class="no-scores">Online leaderboards not available.</p>
        `;
      }
    });
  };

  return {
    showNameInputDialog,
    showGameOverScreen
  };
} 