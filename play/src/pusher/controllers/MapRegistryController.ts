import { Application, Request, Response } from "express";
import { z } from "zod";
import { jwtTokenManager } from "../services/JWTTokenManager";
import { postgresClient } from "../services/PostgresClient";
import Debug from "debug";

const debug = Debug("pusher:map-registry");

const RegisterMapSchema = z.object({
    mapUrl: z.string().url(),
    authToken: z.string(),
});

export class MapRegistryController {
    constructor(app: Application) {
        app.post("/map/register", this.registerMap.bind(this));
    }

    async registerMap(req: Request, res: Response) {
        debug(`MapRegistryController => [${req.method}] ${req.originalUrl} — IP: ${req.ip}`);

        const parse = RegisterMapSchema.safeParse(req.body);
        if (!parse.success) {
            res.status(400).json({ error: "Invalid payload", details: parse.error.flatten() });
            return;
        }

        const { mapUrl, authToken } = parse.data;

        // Verify authentication
        let slackId: string | undefined;
        try {
            const tokenData = jwtTokenManager.verifyJWTToken(authToken);
            slackId = tokenData.slackId;
            
            if (!slackId) {
                res.status(403).json({ error: "User must be connected via Slack to register a map" });
                return;
            }
        } catch (error) {
            console.warn("Invalid token provided to register map", error);
            res.status(401).json({ error: "Invalid auth token" });
            return;
        }

        // Validate Map URL
        try {
            const url = new URL(mapUrl);
            const hostname = url.hostname.toLowerCase();
            
            // Allow github.io subdomains and raw.githubusercontent.com
            const isGithubPages = hostname.endsWith(".github.io");
            const isRawGithub = hostname === "raw.githubusercontent.com";

            if (!isGithubPages && !isRawGithub) {
                res.status(400).json({ error: "Map URL must be hosted on GitHub Pages (*.github.io) or Raw GitHub (*.githubusercontent.com)" });
                return;
            }
        } catch (e) {
            res.status(400).json({ error: "Invalid URL format" });
            return;
        }

        // Save to DB
        try {
            const success = await postgresClient.upsertUserMap(slackId, mapUrl);
            if (success) {
                res.json({ success: true, mapUrl });
            } else {
                res.status(500).json({ error: "Failed to save map registration" });
            }
        } catch (error) {
            console.error("Error registering map:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
}
