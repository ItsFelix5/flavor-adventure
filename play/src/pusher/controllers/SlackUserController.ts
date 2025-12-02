import { Application, Request, Response } from "express";
import { postgresClient } from "../services/PostgresClient";

/**
 * Simple endpoint to get a user's display name by Slack ID
 * GET /api/slack-user/:slackId
 * Returns: { displayName: string }
 */
export class SlackUserController {
    constructor(app: Application) {
        app.get("/api/slack-user/:slackId", this.getDisplayName.bind(this));
    }

    async getDisplayName(req: Request, res: Response) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        const { slackId } = req.params;

        if (!slackId || !/^[A-Z0-9]+$/.test(slackId)) {
            res.status(400).json({ error: "Invalid slackId" });
            return;
        }

        try {
            const user = await postgresClient.getUserBySlackId(slackId);
            if (!user) {
                res.status(404).json({ error: "User not found" });
                return;
            }

            res.json({ displayName: user.givenName || slackId });
        } catch (error) {
            console.error("[SlackUserController] Error:", error);
            res.status(500).json({ error: "Database error" });
        }
    }
}
