import { SayMessageType } from "@workadventure/messages";
import { RoomConnection } from "../../../Connection/RoomConnection";
import { hasMovedEventName, Player } from "../../Player/Player";
import type { HasPlayerMovedInterface } from "../../../Api/Events/HasPlayerMovedInterface";
import { ChatLogger } from "../../../Chat/Services/ChatLogger";
import { gameManager } from "../GameManager";
import { localUserStore } from "../../../Connection/LocalUserStore";

let lastSayPopupCloseDate: number | undefined = undefined;

export function popupJustClosed(): void {
    lastSayPopupCloseDate = Date.now();
}

export function isPopupJustClosed(): boolean {
    if (lastSayPopupCloseDate) {
        const timeSinceLastClose = Date.now() - lastSayPopupCloseDate;
        return timeSinceLastClose < 500;
    }
    return false;
}

export class SayManager {
    private bubbleDestroyTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

    public constructor(private roomConnection: RoomConnection, private currentPlayer: Player) {}

    public say(text: string, type: SayMessageType, duration: number | undefined): void {
        if (!localUserStore.isLogged()) {
            console.warn("Cannot send say message: User is not logged in");
            return;
        }

        if (this.bubbleDestroyTimeout) {
            clearTimeout(this.bubbleDestroyTimeout);
            this.bubbleDestroyTimeout = undefined;
        }

        const player = this.currentPlayer;
        player.say(text, type);
        this.roomConnection.emitPlayerSayMessage({ message: text, type });

        // Log the say message if it's not empty
        if (text.trim().length > 0) {
        const gameScene = gameManager.getCurrentGameScene();
        const roomUrl = gameScene.roomUrl;
        const localUser = localUserStore.getLocalUser();
        const playerName = localUserStore.getName() || player.name;

        ChatLogger.logMessage({
            type: type === SayMessageType.SpeechBubble ? "say" : "think",
            message: text,
            author: localUser?.uuid, // Slack user ID from OpenID sub claim
            playerName: playerName,
            playerUuid: localUser?.uuid, // Use consistent UUID source
            roomId: roomUrl,
            raw: {
                duration: duration,
            },
        }).catch((e) => console.debug("Chat log failed:", e));
        }

        if (type === SayMessageType.ThinkingCloud) {
            const cancelThink = (event: HasPlayerMovedInterface) => {
                if (!event.moving) {
                    return;
                }
                if (this.bubbleDestroyTimeout) {
                    clearTimeout(this.bubbleDestroyTimeout);
                    this.bubbleDestroyTimeout = undefined;
                }
                player.say("", type);
                this.roomConnection.emitPlayerSayMessage({ message: "", type });
                this.currentPlayer.off(hasMovedEventName, cancelThink);
            };

            this.currentPlayer.on(hasMovedEventName, cancelThink);
        }

        if (duration) {
            this.bubbleDestroyTimeout = setTimeout(() => {
                player.say("", type);
                this.roomConnection.emitPlayerSayMessage({ message: "", type });
            }, duration);
        }
    }

    public close(): void {
        if (this.bubbleDestroyTimeout) {
            clearTimeout(this.bubbleDestroyTimeout);
            this.bubbleDestroyTimeout = undefined;
        }
    }
}
