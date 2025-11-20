/// <reference types="@workadventure/iframe-api-typings" />

// ui scroll script

const SPLIT_RATIO = 0.5; // TODO: set dynamically to width of screen map does not use
const PROXY_URL = `${window.location.protocol}//${window.location.host.replace('play.', 'maps.')}/flavor/scroll-proxy.html`;

let website;
let lastPlayerY = 0;
let iframeElement = null;

// Map dims 
const MAP_HEIGHT = 60 * 32; // this can be modified to slow the scroll effect, but it 1:1 for now


// Wait for the API to be ready
// TODO: not using api calls probably faster and more sensible
WA.onInit().then(async () => {
    console.log('WA API initialized');
    
    // serve on /unique to avoid player overlap
    const currentRoom = WA.room.id;
    const isUniqueRoom = currentRoom.includes('/unique'); // Matches /unique/ and /unique-ui/
    
    if (!isUniqueRoom) {
        const uniqueId = crypto.randomUUID();
        // Force use of play service for dynamic unique maps
        // Replace both the path and ensure the host in /_/global/ uses play service
        let targetRoom = currentRoom
            .replace('/flavor/UI.tmj', `/unique-ui/${uniqueId}/UI.tmj`);
            
        // In dev, we need to switch from maps. to play.
        targetRoom = targetRoom.replace('maps.workadventure.localhost', 'play.workadventure.localhost');
        
        console.log('Original room:', currentRoom);
        console.log('Redirecting to unique room:', targetRoom);
        WA.nav.goToRoom(targetRoom);
        return; // Stop execution here
    }

    console.log('Creating iframe with URL:', PROXY_URL);


    website = await WA.ui.website.open({
        url: PROXY_URL,
        position: {
            vertical: 'top',
            horizontal: 'right',
        },
        size: {
            height: '100vh',
            width: `${SPLIT_RATIO * 100}vw`,
        },
        margin: {
            top: '0px',
            right: '0px',
            bottom: '0px',
            left: '0px',
        },
        allowApi: true,
    });

    console.log('Iframe website created:', website);
    console.log('Website object keys:', Object.keys(website));
    
    // no interaction on tut
    WA.controls.disablePlayerProximityMeeting();
    
    setTimeout(() => {
        
        function findAllIframes() {
            const iframes = [];
            
            
            document.querySelectorAll('iframe').forEach(i => iframes.push(i));
            
            // Check in shadow DOMs
            document.querySelectorAll('*').forEach(el => {
                if (el.shadowRoot) {
                    el.shadowRoot.querySelectorAll('iframe').forEach(i => iframes.push(i));
                }
            });
            
            return iframes;
        }
        
        const iframes = findAllIframes();
        console.log(`Found ${iframes.length} total iframes (including shadow DOM)`);
        
        for (const iframe of iframes) {
            console.log('Checking iframe:', iframe.src);
            if (iframe.src && iframe.src.includes('scroll-proxy.html')) {
                iframeElement = iframe;
                console.log('Found scroll-proxy iframe');
                break;
            }
        }
        
        // fallback to broadcast if not found
        if (!iframeElement) {
            console.log('Using broadcast method - will send to all iframes');
            iframeElement = {
                contentWindow: {
                    postMessage: (data, origin) => {
                        const allIframes = findAllIframes();
                        console.log(`Broadcasting to ${allIframes.length} iframes`);
                        for (const iframe of allIframes) {
                            if (iframe.contentWindow) {
                                try {
                                    iframe.contentWindow.postMessage(data, origin);
                                } catch (e) {
                                    // fail, log
                                    console.log(e);
                                }
                            }
                        }
                    }
                }
            };
        }
    }, 2000);

    
    WA.player.onPlayerMove((event) => {
        const currentY = event.y;
        
    
        lastPlayerY = currentY;
        updateIframeScroll(currentY);
    
    });

    console.log('Player move tracking initialized');

    
    WA.player.getPosition().then(pos => {
        lastPlayerY = pos.y;
    });
});



function updateIframeScroll(playerY) {
    // Normalize Y position to 0-1 range + invert for scrolling
    // Higher Y (bottom of map) = 100% scroll (bottom of page)
    // Lower Y (top of map) = 0% scroll (top of page)
    const normalizedY = Math.max(0, Math.min(1, 1 - ((playerY*0.5) / MAP_HEIGHT)));
    
    console.log(`Player Y: ${Math.round(playerY)}, Scroll: ${Math.round(normalizedY * 100)}%`);
    
    
    if (iframeElement && iframeElement.contentWindow) {
        console.log('Sending postMessage to iframe with scroll:', normalizedY);
        iframeElement.contentWindow.postMessage({
            scrollPercent: normalizedY
        }, '*');
    } else {
        console.log('iframe not ready yet');
    }
}

// UI Exit Debug Script 

console.log('UI Exit Debug script started');

const EXIT_TARGET = '../../courtyard.tmj';
const EXIT_AREA_Y = 192; // Top of exit area
const EXIT_AREA_HEIGHT = 96; // Height of exit area (192-288 to catch player at Y 256)

WA.onInit().then(async () => {
    console.log('Exit debug initialized');
    
    // Debug: Log all areas on the map
    console.log('Checking for areas on the map...');
    
    // detect on event and check current pos
    WA.player.onPlayerMove((event) => {
        const playerY = event.y;
        
        
        if (playerY >= EXIT_AREA_Y && playerY <= (EXIT_AREA_Y + EXIT_AREA_HEIGHT)) {
            console.log(`redir`);
            WA.nav.goToRoom(EXIT_TARGET);
        }
    });
    
    console.log('Exit zone monitoring active - watching for Y position between', EXIT_AREA_Y, 'and', EXIT_AREA_Y + EXIT_AREA_HEIGHT);
    
    
    const currentPos = await WA.player.getPosition();
    console.log('Current player position:', currentPos);
    if (currentPos.y >= EXIT_AREA_Y && currentPos.y <= (EXIT_AREA_Y + EXIT_AREA_HEIGHT)) {
        console.log('player in zone');
        WA.nav.goToRoom(EXIT_TARGET);
    }
});
