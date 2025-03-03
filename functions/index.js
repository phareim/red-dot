const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineString } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");

// Set global options for all functions
setGlobalOptions({
    region: "europe-west3"
});

const admin = require("firebase-admin");
admin.initializeApp();

// Function to update the leaderboard securely - with region specified
exports.updateLeaderboard = onDocumentWritten("highscores/{playerId}", async (event) => {
    const playerId = event.params.playerId;
    
    // Get the document after the write
    const snapshot = event.data.after;
    
    // If the document was deleted, don't do anything
    if (!snapshot.exists()) return null;
    
    const newData = snapshot.data();
    const score = newData.score;
    const playerName = newData.name;
    
    // Update the leaderboard
    const leaderboardRef = admin.firestore().doc("leaderboards/global");
    
    try {
        return await admin.firestore().runTransaction(async (transaction) => {
            const leaderboardDoc = await transaction.get(leaderboardRef);
            
            if (leaderboardDoc.exists) {
                const leaderboard = leaderboardDoc.data().top_players || [];
                
                // Find if player is already in leaderboard
                const playerIndex = leaderboard.findIndex((p) => p.id === playerId);
                
                if (playerIndex >= 0) {
                    // Only update if score is higher
                    if (score > leaderboard[playerIndex].score) {
                        leaderboard[playerIndex].score = score;
                        leaderboard[playerIndex].name = playerName;
                        leaderboard[playerIndex].updatedAt = 
                            admin.firestore.FieldValue.serverTimestamp();
                        
                        // Re-sort the leaderboard
                        leaderboard.sort((a, b) => b.score - a.score);
                    }
                } else {
                    // Check if score is high enough to enter leaderboard
                    const MAX_LEADERBOARD_SIZE = 100;
                    
                    if (
                        leaderboard.length < MAX_LEADERBOARD_SIZE || 
                        (leaderboard.length > 0 && 
                         score > leaderboard[leaderboard.length - 1].score)
                    ) {
                        // Add player to leaderboard
                        leaderboard.push({
                            id: playerId,
                            name: playerName,
                            score: score,
                            createdAt: admin.firestore.FieldValue.serverTimestamp(),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        
                        // Sort and trim
                        leaderboard.sort((a, b) => b.score - a.score);
                        if (leaderboard.length > MAX_LEADERBOARD_SIZE) {
                            leaderboard.length = MAX_LEADERBOARD_SIZE;
                        }
                    }
                }
                
                transaction.update(leaderboardRef, {
                    top_players: leaderboard,
                    last_updated: admin.firestore.FieldValue.serverTimestamp(),
                });
            } else {
                // Create new leaderboard
                transaction.set(leaderboardRef, {
                    top_players: [{
                        id: playerId,
                        name: playerName,
                        score: score,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    }],
                    last_updated: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
            
            return true;
        });
    } catch (error) {
        console.error("Error updating leaderboard:", error);
        return false;
    }
});
   