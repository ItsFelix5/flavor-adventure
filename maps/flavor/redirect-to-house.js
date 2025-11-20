/// <reference path="../node_modules/@workadventure/iframe-api-typings/iframe_api.d.ts" />

console.log('loaded scripts');

WA.room.onEnterZone('redirectToOffice', () => {
    console.log('triggered redirectToOffice zone');
    
    const slackId = WA.player.slackId;
    console.log('Slack ID:', slackId);
    console.log('Room ID:', WA.room.id);
    
    if (slackId) {
        let targetHost = 'flavor-adventure.hackclub.com';
        
        try {
            // Parse the host from the current room ID (Map URL)
            // WA.room.id is typically the URL of the map file
            const roomUrl = new URL(WA.room.id);
            let host = roomUrl.host;
            
            // In dev, we need to switch from maps. to play.
            if (host.startsWith('maps.')) {
                host = host.replace('maps.', 'play.');
            }
            
            targetHost = host;
            console.log('Detected target host from room ID:', targetHost);
        } catch (e) {
            console.error('Error parsing room ID, defaulting to prod:', e);
        }

        const targetUrl = `/_/global/${targetHost}/slack/${slackId}`;
        console.log('Sending to house', targetUrl);
        WA.nav.goToRoom(targetUrl);
    } else {
        console.error('No Slack ID available');
    }
});
