/// <reference path="../node_modules/@workadventure/iframe-api-typings/iframe_api.d.ts" />

console.log('loaded scripts');

WA.room.onEnterZone('redirectToOffice', () => {
    console.log('triggered redirectToOffice zone');
    
    const slackId = WA.player.slackId;
    console.log('Slack ID:', slackId);
    console.log('Current Host:', window.location.host);
    console.log('Current Hostname:', window.location.hostname);
    
    if (slackId) {
        // Default to the current host (safer for dev/staging/proxies)
        let targetHost = window.location.host;

        // Only force production if we are explicitly NOT on localhost/workadventure
        // AND we want to enforce a specific domain behavior.
        // But for now, trusting window.location.host is the safest default.
        
        // If on production, ensure we use the correct domain if needed
        // (e.g. if accessed via IP but want domain)
        if (window.location.hostname === 'flavor-adventure.hackclub.com') {
             targetHost = 'flavor-adventure.hackclub.com';
        }

        const targetUrl = `/_/global/${targetHost}/slack/${slackId}`;
        console.log('Sending to house', targetUrl);
        WA.nav.goToRoom(targetUrl);
    } else {
        console.error('No Slack ID available');
    }
});
