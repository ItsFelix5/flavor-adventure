/// <reference path="../node_modules/@workadventure/iframe-api-typings/iframe_api.d.ts" />

console.log('loaded scripts');

WA.room.onEnterZone('redirectToOffice', () => {
    console.log('triggered redirectToOffice zone');
    
    const slackId = WA.player.slackId;
    console.log('Slack ID:', slackId);
    console.log('Room ID:', WA.room.id);
    
    if (slackId) {
        try {
            // Parse the host from the current room ID (Map URL)
            // WA.room.id is typically the URL of the map file
            const roomUrl = new URL(WA.room.id);
            let host = roomUrl.host;
            
            // In dev, we need to switch from maps. to play.
            if (host.startsWith('maps.')) {
                host = host.replace('maps.', 'play.');
            }
            
            const targetUrl = `/_/global/${host}/slack/${slackId}`;
            console.log('Detected host from room ID:', host);
            console.log('Sending to house', targetUrl);
            WA.nav.goToRoom(targetUrl);
        } catch (e) {
            console.error('Error parsing room ID, cannot redirect:', e);
        }
    } else {
        console.error('No Slack ID available');
    }
});
