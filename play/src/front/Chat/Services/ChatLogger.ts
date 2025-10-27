import { PUSHER_URL, CHAT_LOG_SECRET } from "../../Enum/EnvironmentVariable";

interface ChatLogPayload {
    type: "matrix" | "proximity";
    message: string;
    author?: string;
    playerName?: string;
    playerUuid?: string;
    roomId?: string;
    matrixRoomId?: string;
    raw?: Record<string, unknown>;
    headers?: Record<string, unknown>;
}

export class ChatLogger {
    public static async logMessage(payload: ChatLogPayload): Promise<void> {
        // Only log if secret is configured
        if (!CHAT_LOG_SECRET) {
            return;
        }

        try {
            await fetch(`${PUSHER_URL}/chat-log`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${CHAT_LOG_SECRET}`,
                },
                body: JSON.stringify(payload),
            });
            // Fire and forget
        } catch (e) {
            console.warn("Failed to log chat message:", e);
            // Don't throw
        }
    }
}
