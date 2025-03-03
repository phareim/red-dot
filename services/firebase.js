// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  enableNetwork
} from "firebase/firestore";

// Your Firebase configuration - replace with your actual values
const firebaseConfig = {
  apiKey: "YOUR_API_KEY", 
  authDomain: "a-red-dot.firebaseapp.com",
  projectId: "a-red-dot",
  storageBucket: "a-red-dot.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable network connectivity
export async function forceEnableNetwork() {
  try {
    await enableNetwork(db);
    return true;
  } catch (error) {
    console.error("Error connecting to Firebase:", error);
    return false;
  }
}

// Test connectivity (simplified)
export async function testFirestoreConnection() {
  try {
    await getDoc(doc(db, "test", "connectivity-test"));
    return true;
  } catch (error) {
    return false;
  }
}

// Function to save high score to Firestore
export async function saveHighScore(playerName, score, playerId) {
  try {
    const playerDocRef = doc(db, "highscores", playerId);
    const playerDoc = await getDoc(playerDocRef);
    
    if (playerDoc.exists()) {
      const currentData = playerDoc.data();
      
      // Only update if the new score is higher
      if (score > (currentData.score || 0)) {
        await updateDoc(playerDocRef, {
          name: playerName,
          score: score,
          updatedAt: new Date()
        });
        
        // Also update the leaderboard
        await updateLeaderboard(playerName, score, playerId);
        return true;
      }
      return false;
    } else {
      // Create a new player record
      await setDoc(playerDocRef, {
        name: playerName,
        score: score,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Also update the leaderboard
      await updateLeaderboard(playerName, score, playerId);
      return true;
    }
  } catch (error) {
    console.error("Error saving high score:", error);
    return false;
  }
}

// Function to get a player's high score
export async function getPlayerHighScore(playerId) {
  try {
    const playerDocRef = doc(db, "highscores", playerId);
    const playerDoc = await getDoc(playerDocRef);
    
    if (playerDoc.exists()) {
      return playerDoc.data();
    }
    return null;
  } catch (error) {
    console.error("Error getting player high score:", error);
    return null;
  }
}

// Update the global leaderboard
export async function updateLeaderboard(playerName, score, playerId) {
  try {
    const leaderboardRef = doc(db, "leaderboards", "global");
    const leaderboardSnapshot = await getDoc(leaderboardRef);
    
    if (leaderboardSnapshot.exists()) {
      // Get current leaderboard
      const leaderboard = leaderboardSnapshot.data().top_players || [];
      
      // Find if player is already in leaderboard
      const playerIndex = leaderboard.findIndex(p => p.id === playerId);
      
      if (playerIndex >= 0) {
        // Player exists in leaderboard
        if (score > leaderboard[playerIndex].score) {
          // Update player's score
          leaderboard[playerIndex].score = score;
          leaderboard[playerIndex].name = playerName;
          leaderboard[playerIndex].updatedAt = new Date();
          
          // Re-sort the leaderboard
          leaderboard.sort((a, b) => b.score - a.score);
          
          // Update the leaderboard document
          await updateDoc(leaderboardRef, {
            top_players: leaderboard,
            last_updated: new Date()
          });
        }
      } else {
        // Check if score is high enough to enter leaderboard
        const MAX_LEADERBOARD_SIZE = 100;
        
        if (leaderboard.length < MAX_LEADERBOARD_SIZE || 
            (leaderboard.length > 0 && score > leaderboard[leaderboard.length - 1].score)) {
          // Add player to leaderboard
          leaderboard.push({
            id: playerId,
            name: playerName,
            score: score,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          // Sort and trim the leaderboard
          leaderboard.sort((a, b) => b.score - a.score);
          if (leaderboard.length > MAX_LEADERBOARD_SIZE) {
            leaderboard.length = MAX_LEADERBOARD_SIZE;
          }
          
          // Update the leaderboard document
          await updateDoc(leaderboardRef, {
            top_players: leaderboard,
            last_updated: new Date()
          });
        }
      }
    } else {
      // Create the leaderboard document if it doesn't exist
      await setDoc(leaderboardRef, {
        top_players: [{
          id: playerId,
          name: playerName,
          score: score,
          createdAt: new Date(),
          updatedAt: new Date()
        }],
        last_updated: new Date()
      });
    }
    return true;
  } catch (error) {
    console.error("Error updating leaderboard:", error);
    return false;
  }
}

// Get top high scores efficiently
export async function getTopHighScores(limit = 10) {
  try {
    const leaderboardRef = doc(db, "leaderboards", "global");
    const leaderboardSnapshot = await getDoc(leaderboardRef);
    
    if (leaderboardSnapshot.exists()) {
      const leaderboard = leaderboardSnapshot.data().top_players || [];
      // Get just the amount we need
      return leaderboard.slice(0, limit).map(player => ({
        ...player,
        id: player.id
      }));
    }
    
    // Fallback to the old method if no leaderboard exists yet
    return getTopHighScoresLegacy(limit);
  } catch (error) {
    console.error("Error getting leaderboard:", error);
    return [];
  }
}

// Legacy method (as fallback)
async function getTopHighScoresLegacy(limitCount = 10) {
  try {
    const highscoresRef = collection(db, "highscores");
    const q = query(highscoresRef, orderBy("score", "desc"), limit(limitCount));
    
    const querySnapshot = await getDocs(q);
    const highscores = [];
    
    querySnapshot.forEach((doc) => {
      highscores.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return highscores;
  } catch (error) {
    console.error("Error getting top high scores:", error);
    return [];
  }
}

// Initialize leaderboard from existing data (run once)
export async function initializeLeaderboardFromExistingData() {
  try {
    const leaderboardRef = doc(db, "leaderboards", "global");
    const leaderboardSnapshot = await getDoc(leaderboardRef);
    
    if (!leaderboardSnapshot.exists()) {
      // Get all existing high scores
      const highscoresRef = collection(db, "highscores");
      const q = query(highscoresRef, orderBy("score", "desc"), limit(100));
      const querySnapshot = await getDocs(q);
      
      const topPlayers = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        topPlayers.push({
          id: doc.id,
          name: data.name,
          score: data.score,
          createdAt: data.createdAt || new Date(),
          updatedAt: data.updatedAt || new Date()
        });
      });
      
      // Create the leaderboard document
      if (topPlayers.length > 0) {
        await setDoc(leaderboardRef, {
          top_players: topPlayers,
          last_updated: new Date()
        });
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("Error initializing leaderboard:", error);
    return false;
  }
} 