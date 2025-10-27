import axios from "axios";
import { PUSHER_URL } from "../../Enum/EnvironmentVariable";

export interface ChatLogPayload {
    type: "matrix" | "proximity";
    message: string;
    author?: string; // sender ID
    playerName?: string; // display name
    playerUuid?: string; // WA user UUID if available
    roomId?: string; // room identifier
    matrixRoomId?: string; // explicit Matrix room ID
    raw?: Record<string, unknown>; // arbitrary JSON data
    headers?: Record<string, unknown>; // arbitrary headers/metadata
}

export async function logChatMessage(payload: ChatLogPayload): Promise<void> {
    if (!PUSHER_URL) {
        console.warn("PUSHER_URL not configured; chat logs will not be persisted.");
        return;
    }
    try {
        await axios.post(`${PUSHER_URL}/chat-log`, payload, { timeout: 3000 });
    } catch (e) {
        console.error("Failed to log chat message:", e);
    }
}
