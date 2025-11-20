/// <reference path="../node_modules/@workadventure/iframe-api-typings/iframe_api.d.ts" />

console.log('loaded scripts');

WA.room.onEnterZone('redirectToOffice', () => {
    console.log('triggered redirectToOffice zone');
    
    const slackId = WA.player.slackId;
    console.log('Slack ID:', slackId);
    console.log('Current Host:', window.location.host);
    
    if (slackId) {
        let targetHost = 'flavor-adventure.hackclub.com';
        
        // Check if we are in dev environment
        if (window.location.host.includes('workadventure.localhost') || window.location.host.includes('localhost')) {
            targetHost = window.location.host;
        }

        const targetUrl = `/_/global/${targetHost}/slack/${slackId}`;
        console.log('Sending to house', targetUrl);
        WA.nav.goToRoom(targetUrl);
    } else {
        console.error('No Slack ID available');
    }
});
