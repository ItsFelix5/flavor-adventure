import type { Application, Request, Response } from "express";
import { z } from "zod";
import { postgresClient } from "../services/PostgresClient";
import { CHAT_LOG_SECRET } from "../enums/EnvironmentVariable";

const ChatLogSchema = z.object({
    type: z.enum(["matrix", "proximity"]),
    message: z.string().min(1),
    author: z.string().optional(), // sender ID
    playerName: z.string().optional(),
    playerUuid: z.string().optional(),
    roomId: z.string().optional(),
    matrixRoomId: z.string().optional(),
    raw: z.record(z.unknown()).optional(), // JSONB for raw data
    headers: z.record(z.unknown()).optional(), // JSONB for headers
});

export class ChatLogController {
    constructor(app: Application) {
        postgresClient.init().catch((e: unknown) => console.error("ChatLogController Postgres init error:", e));

        app.post("/chat-log", this.handleChatLog.bind(this));
    }

    private async handleChatLog(req: Request, res: Response) {
        // Validate authorization if CHAT_LOG_SECRET is configured
        if (CHAT_LOG_SECRET) {
            const authHeader = req.headers.authorization;
            if (!authHeader || authHeader !== `Bearer ${CHAT_LOG_SECRET}`) {
                return res.status(401).json({ error: "unauthorized" });
            }
        }

        const parse = ChatLogSchema.safeParse(req.body);
        if (!parse.success) {
            return res.status(400).json({ error: "invalid_payload", details: parse.error.flatten() });
        }

        if (!postgresClient.isEnabled()) {
            // Accept but don't store
            return res.status(202).json({ status: "no-op", reason: "chat logging not configured" });
        }

        const payload = parse.data;

        try {
            await postgresClient.query(
                `INSERT INTO messages (
            type, author, player_name, player_uuid, room_id, message, raw, headers
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                    payload.type,
                    payload.author ?? null,
                    payload.playerName ?? null,
                    payload.playerUuid ?? null,
                    payload.roomId ?? payload.matrixRoomId ?? null,
                    payload.message,
                    payload.raw ? JSON.stringify(payload.raw) : null,
                    payload.headers ? JSON.stringify(payload.headers) : null,
                ]
            );
            return res.status(201).json({ status: "ok" });
        } catch (e) {
            console.error("Failed to insert chat log:", e);
            return res.status(500).json({ error: "db_error" });
        }
    }
}
