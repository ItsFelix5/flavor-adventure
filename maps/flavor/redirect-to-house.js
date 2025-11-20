/// <reference path="../node_modules/@workadventure/iframe-api-typings/iframe_api.d.ts" />

console.log('loaded scripts');

WA.room.onEnterZone('redirectToOffice', () => {
    console.log('triggered redirectToOffice zone');
    
    const slackId = WA.player.slackId;
    console.log('Slack ID:', slackId);
    
    if (slackId) {
        const targetUrl = `/_/global/${window.location.host}/slack/${slackId}`;
        console.log('Sending to house', targetUrl);
        WA.nav.goToRoom(targetUrl);
    } else {
        console.error('No Slack ID available');
    }
});
