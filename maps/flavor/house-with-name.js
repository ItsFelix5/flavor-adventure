/// <reference types="@workadventure/iframe-api-typings" />

console.log('[house-with-name.js] Script started');

// EXIT TO COURTYARD FUNCTIONALITY
WA.room.onEnterZone('exitToSquare', () => {
    console.log('[house-with-name.js] Exiting to courtyard');
    
    // extract host from url
    const currentRoom = WA.room.id;
    console.log('[house-with-name.js] Current room:', currentRoom);
    
    // Format: /_/global/{host}/slack/{id} or /_/global/{host}/flavor/...
    const match = currentRoom.match(/_\/global\/([^\/]+)\//);
    
    if (match && match[1]) {
        let host = match[1];
        const mapsHost = host.replace(/^play\./, 'maps.');
        const courtyardUrl = `/_/global/${mapsHost}/flavor/courtyard.tmj`;
        console.log('[house-with-name.js] Redirecting to courtyard:', courtyardUrl);
        WA.nav.goToRoom(courtyardUrl);
    } else {
        console.error('[house-with-name.js] Could not extract host from current room URL');
    }
});

console.log('[house-with-name.js] Script loaded successfully');

