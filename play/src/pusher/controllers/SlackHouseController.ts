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
            const templatePath = path.resolve(process.cwd(), "../maps/flavor/house.tmj");
            console.log(`[SlackHouseController] Loading template from: ${templatePath}`);
            console.log(`[SlackHouseController] process.cwd(): ${process.cwd()}`);
            const templateContent = await fs.readFile(templatePath, "utf-8");
            const mapJson = JSON.parse(templateContent);
            console.log("[SlackHouseController] Template loaded successfully");

            // Get display name from database
            let displayName = slackId; // fallback
            const user = await postgresClient.getUserBySlackId(slackId);
            if (user && user.givenName) {
                displayName = user.givenName;
            }
            console.log(`[SlackHouseController] Display name: ${displayName}`);
            console.log(`[SlackHouseController] mapJson.layers count: ${mapJson.layers?.length}`);

            // Find and replace "{{ houseName }}" text object
            let replaced = false;
            for (const layer of mapJson.layers || []) {
                console.log(`[SlackHouseController] Layer: ${layer.name}, type: ${layer.type}`);
                if (layer.type === "objectgroup" && layer.objects) {
                    for (const obj of layer.objects) {
                        if (obj.text) {
                            console.log(`[SlackHouseController] Found text object: "${obj.text.text}"`);
                        }
                        if (obj.text && obj.text.text === "{{ houseName }}") {
                            obj.text.text = `${displayName}'s House`;
                            replaced = true;
                            console.log(`[SlackHouseController] Replaced text with: ${displayName}'s House`);
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
