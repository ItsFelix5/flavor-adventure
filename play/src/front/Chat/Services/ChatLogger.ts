import { PUSHER_URL, CHAT_LOG_SECRET } from "../../Enum/EnvironmentVariable";

interface ChatLogPayload {
    type: "matrix" | "proximity" | "say" | "think";
    message: string;
    author?: string;
    playerName?: string;
    playerUuid?: string;
    roomId?: string;
    raw?: Record<string, unknown>;
    headers?: Record<string, unknown>;
}

export class ChatLogger {
    public static async logMessage(payload: ChatLogPayload): Promise<void> {
        // Only log if signed
        if (!CHAT_LOG_SECRET) {
            console.debug("[ChatLogger] CHAT_LOG_SECRET not configured - chat logging disabled");
            return;
        }

        console.debug("[ChatLogger] Logging chat message:", {
            type: payload.type,
            author: payload.author,
            roomId: payload.roomId,
        });

        try {
            const response = await fetch(`${PUSHER_URL}/chat-log`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${CHAT_LOG_SECRET}`,
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const text = await response.text();
                console.error("[ChatLogger] Failed to log chat message:", response.status, text);
            } else {
                console.debug("[ChatLogger] Chat message logged successfully");
            }
        } catch (e) {
            console.warn("[ChatLogger] Failed to log chat message:", e);
            // Don't throw
        }
    }
}
