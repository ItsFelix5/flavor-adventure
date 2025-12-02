/// <reference types="@workadventure/iframe-api-typings" />

console.log('[house-with-name.js] Script started');

function getFlavorMapsHost() {
    const host = window.location.host;
    
    // Dev
    if (host.includes('workadventure.localhost')) {
        return 'maps.workadventure.localhost';
    }
    
    // Prod
    if (host.includes('hackclub.com')) {
        return 'flavor-adventure.hackclub.com';
    }
    
    // Fallback
    return host;
}

// EXIT TO COURTYARD FUNCTIONALITY
WA.room.onEnterZone('exitToSquare', () => {
    console.log('[house-with-name.js] Exiting to courtyard');
    
    const mapsHost = getFlavorMapsHost();
    const courtyardUrl = `/_/global/${mapsHost}/flavor/courtyard.tmj`;
    console.log('[house-with-name.js] Redirecting to courtyard:', courtyardUrl);
    WA.nav.goToRoom(courtyardUrl);
});
function getSlackId() {
    console.log('[house-with-name.js] Getting Slack ID...');
    
    // Use WA.player.slackId which is populated from the JWT token
    const slackId = WA.player.slackId;
    
    
    return slackId || null;
}

async function init() {
    // Wait for WA to be initialized
    await WA.onInit();

    console.log('[house-with-name.js] Initializing...');
    
    const slackId = getSlackId();

    if (!slackId) {
        console.warn('[house-with-name.js] No slackId found. Checking current user tags...');

        if (WA.player.name) {
             try {
                WA.state.houseName = `${WA.player.name}'s House`;
            } catch (e) {
                console.warn('[house-with-name.js] Could not set houseName to player name:', e);
            }
            return;
        }

        // Fallback to blank
        try {
            WA.state.houseName = "";
        } catch (e) {
            console.warn('[house-with-name.js] Could not set houseName (variable might be missing):', e);
        }
        return;
    }

    console.log('[house-with-name.js] Found slackId:', slackId);

    try {

        const playHost = "play.workadventure.localhost"; // TODO: Make dynamic based on environment
        const apiUrl = `http://${playHost}/api/slack-user/${slackId}`;
        console.log('[house-with-name.js] Fetching user details from:', apiUrl);

        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        const data = await response.json();
        console.log('[house-with-name.js] User data:', data);

        const displayName = data.displayName || slackId;
        WA.state.houseName = `${displayName}'s House`;
        
    } catch (e) {
        console.error('[house-with-name.js] Error fetching user details:', e);
        WA.state.houseName = `House of ${slackId}`;
    }
}

init().catch(e => console.error('[house-with-name.js] Init error:', e));


