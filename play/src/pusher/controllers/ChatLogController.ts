import type { Application, Request, Response } from "express";
import { z } from "zod";
import { postgresClient } from "../services/PostgresClient";
import { CHAT_LOG_SECRET } from "../enums/EnvironmentVariable";

const ChatLogSchema = z.object({
    type: z.enum(["matrix", "proximity", "say"]),
    message: z.string().min(1),
    author: z.string().optional(), // sender ID
    playerName: z.string().optional(),
    playerUuid: z.string().optional(),
    roomId: z.string().optional(),
    raw: z.record(z.unknown()).optional(), // JSONB for raw data
    headers: z.record(z.unknown()).optional(), // JSONB for headers
});

export class ChatLogController {
    constructor(app: Application) {
        console.info("[ChatLogController] Initializing...");
        //console.info("[ChatLogController] CHAT_LOG_SECRET configured:", !!CHAT_LOG_SECRET);

        postgresClient.init().catch((e: unknown) => console.error("[ChatLogController] Postgres init error:", e));

        app.post("/chat-log", this.handleChatLog.bind(this));
    }

    private async handleChatLog(req: Request, res: Response) {
        console.debug("[ChatLogController] Received chat log request");

        // Validate authorization if CHAT_LOG_SECRET is configured
        if (CHAT_LOG_SECRET) {
            const authHeader = req.headers.authorization;
            if (!authHeader || authHeader !== `Bearer ${CHAT_LOG_SECRET}`) {
                console.warn("[ChatLogController] Unauthorized request - invalid or missing auth header");
                return res.status(401).json({ error: "unauthorized" });
            }
        }

        const parse = ChatLogSchema.safeParse(req.body);
        if (!parse.success) {
            console.warn("[ChatLogController] Invalid payload:", parse.error.flatten());
            return res.status(400).json({ error: "invalid_payload", details: parse.error.flatten() });
        }

        const payload = parse.data;

        console.info("[ChatLogController] Forwarding to Slack webhook, CHAT_LOG_SECRET set:", !!CHAT_LOG_SECRET);
        console.info("[ChatLogController] Payload being sent:", JSON.stringify(payload));
        if (CHAT_LOG_SECRET) {
            fetch("https://i00k8gsc08swowk00sc8o0o4.cooked.selfhosted.hackclub.com/message", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${CHAT_LOG_SECRET}`,
                },
                body: JSON.stringify(payload),
            })
                .then((resp) => console.info("[ChatLogController] Slack webhook response:", resp.status))
                .catch((err) => console.warn("[ChatLogController] Slack webhook failed:", err));
        }

        if (!postgresClient.isEnabled()) {
            console.debug("[ChatLogController] PostgreSQL not enabled - accepting but not storing");
            return res.status(202).json({ status: "no-op", reason: "chat logging not configured" });
        }

        try {
            console.debug("[ChatLogController] Inserting chat log into database:", {
                type: payload.type,
                author: payload.author,
                roomId: payload.roomId,
            });

            await postgresClient.query(
                `INSERT INTO messages (
            type, author, player_name, player_uuid, room_id, message, raw, headers
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                    payload.type,
                    payload.author ?? null,
                    payload.playerName ?? null,
                    payload.playerUuid ?? null,
                    payload.roomId ?? null,
                    payload.message,
                    payload.raw ? JSON.stringify(payload.raw) : null,
                    payload.headers ? JSON.stringify(payload.headers) : null,
                ]
            );

            console.info("[ChatLogController] Chat message logged successfully");
            return res.status(201).json({ status: "ok" });
        } catch (e) {
            console.error("[ChatLogController] Failed to insert chat log:", e);
            return res.status(500).json({ error: "db_error" });
        }
    }
}
