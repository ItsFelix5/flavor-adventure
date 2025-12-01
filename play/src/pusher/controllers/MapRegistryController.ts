import { Application, Request, Response } from "express";
import { z } from "zod";
import Debug from "debug";
import { jwtTokenManager } from "../services/JWTTokenManager";
import { postgresClient } from "../services/PostgresClient";

const debug = Debug("pusher:map-registry");

const RegisterMapSchema = z.object({
    mapUrl: z.string().min(1),
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

        const { authToken } = parse.data;
        let { mapUrl } = parse.data;

        // Normalize: strip https:// or http:// prefix if present
        mapUrl = mapUrl.replace(/^https?:\/\//, "").trim();

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

        // Validate Map URL path (format: hostname/path/to/map.tmj)
        // Must be on github.io or raw.githubusercontent.com
        const hostMatch = mapUrl.match(/^([^/]+)/);
        if (!hostMatch) {
            res.status(400).json({ error: "Invalid URL format" });
            return;
        }

        const hostname = hostMatch[1].toLowerCase();
        const isGithubPages = hostname.endsWith(".github.io");
        const isRawGithub = hostname === "raw.githubusercontent.com";

        if (!isGithubPages && !isRawGithub) {
            res.status(400).json({
                error: "Map URL must be hosted on GitHub Pages (*.github.io) or Raw GitHub (raw.githubusercontent.com)",
            });
            return;
        }

        // Ensure it ends with a map file extension
        if (!mapUrl.match(/\.(tmj|json)$/i)) {
            res.status(400).json({ error: "Map URL must point to a .tmj or .json file" });
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
