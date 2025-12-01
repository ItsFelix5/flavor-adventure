/// <reference path="../node_modules/@workadventure/iframe-api-typings/iframe_api.d.ts" />

console.log('[Flavor] Exit to courtyard script loaded');

function getFlavorMapsHost() {
    const host = window.location.host;
    
    // Dev environment
    if (host.includes('workadventure.localhost')) {
        return 'maps.workadventure.localhost';
    }
    
    // Production
    if (host.includes('hackclub.com')) {
        return 'flavor-adventure.hackclub.com';
    }
    
    // Fallback
    return host;
}

WA.room.onEnterZone('exitToSquare', () => {
    console.log('[Flavor] Exiting to courtyard');
    
    const mapsHost = getFlavorMapsHost();
    const courtyardUrl = `/_/global/${mapsHost}/flavor/courtyard.tmj`;
    console.log('[Flavor] Redirecting to courtyard:', courtyardUrl);
    WA.nav.goToRoom(courtyardUrl);
});
