import fs from "fs/promises";
import path from "path";
import { Application, Request, Response } from "express";
import { postgresClient } from "../services/PostgresClient";

/**
 * Serves personalized house maps at /slack/:slackId
 * The map JSON is modified to include the user's display name
 */
export class SlackHouseController {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private templateCache: any = null;

    constructor(app: Application) {
        console.log("[SlackHouseController] Registering /slack/:slackId");
        app.get("/slack/:slackId", this.serveHouse.bind(this));
    }

    async serveHouse(req: Request, res: Response) {
        const { slackId } = req.params;
        console.log(`[SlackHouseController] Request for /slack/${slackId}`);

        if (!slackId || !/^[A-Z0-9]+$/.test(slackId)) {
            res.status(400).json({ error: "Invalid slackId" });
            return;
        }

        try {
            // Load template (cached after first load)
            if (!this.templateCache) {
                const templatePath = path.resolve(__dirname, "../../../maps/flavor/house.tmj");
                const templateContent = await fs.readFile(templatePath, "utf-8");
                this.templateCache = JSON.parse(templateContent);
                console.log("[SlackHouseController] Template loaded and cached");
            }

            // Clone template
            const mapJson = JSON.parse(JSON.stringify(this.templateCache));

            // Get display name from database
            let displayName = slackId; // fallback
            const user = await postgresClient.getUserBySlackId(slackId);
            if (user && user.givenName) {
                displayName = user.givenName;
            }
            console.log(`[SlackHouseController] Display name: ${displayName}`);

            // Find and replace "Hello World" text object
            let replaced = false;
            for (const layer of mapJson.layers || []) {
                if (layer.type === "objectgroup" && layer.objects) {
                    for (const obj of layer.objects) {
                        if (obj.text && obj.text.text === "Hello World") {
                            obj.text.text = displayName;
                            replaced = true;
                            console.log(`[SlackHouseController] Replaced text with: ${displayName}`);
                        }
                    }
                }
            }

            if (!replaced) {
                console.warn("[SlackHouseController] Text object not found!");
            }

            // Send modified map with CORS headers
            // TODO:
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Content-Type", "application/json");
            res.json(mapJson);
        } catch (error) {
            console.error("[SlackHouseController] Error:", error);
            res.status(500).json({ error: "Failed to serve map" });
        }
    }
}
