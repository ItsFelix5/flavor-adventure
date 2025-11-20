/// <reference types="@workadventure/iframe-api-typings" />



const EXIT_TARGET = '../courtyard.tmj';
const EXIT_AREA_Y = 192; // Top of area
const EXIT_AREA_HEIGHT = 32; // Height of area

WA.onInit().then(async () => {
    console.log('Exit debug initialized');
    
    
    console.log('loaded script, checking areas');
    
    
    WA.player.onPlayerMove((event) => {
        const playerY = event.y;
        
        
        if (playerY >= EXIT_AREA_Y && playerY <= (EXIT_AREA_Y + EXIT_AREA_HEIGHT)) {
            ;
            WA.nav.goToRoom(EXIT_TARGET);
        }
    });
    
    
    
    
    const currentPos = await WA.player.getPosition();
    ;
    if (currentPos.y >= EXIT_AREA_Y && currentPos.y <= (EXIT_AREA_Y + EXIT_AREA_HEIGHT)) {
        console.log('entered redir');
        WA.nav.goToRoom(EXIT_TARGET);
    }
});
