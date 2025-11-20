import fs from "fs";
import type { Application, Request, Response } from "express";
import { postgresClient } from "../services/PostgresClient";

export class DynamicMapController {
    constructor(app: Application) {
        // houses under /slack/:slackId
        app.get("/slack/:slackId", this.serveHouse.bind(this));
        // meetings at /meet/:meetId
        app.get("/meet/:meetId", this.serveMeeting.bind(this));
        // unique UI maps at /flavor/unique/:uuid/UI.tmj
        app.get("/flavor/unique/:uuid/UI.tmj", this.serveUniqueUI.bind(this));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private fixExitUrls(layers: any[], mapsHost: string): void {
        for (const layer of layers) {
            // Handle layer groups recursively
            if (layer.layers) {
                this.fixExitUrls(layer.layers, mapsHost);
            }
            // Handle layer properties
            if (layer.properties) {
                for (const prop of layer.properties) {
                    if (
                        prop.name === "exitUrl" &&
                        prop.value &&
                        !prop.value.startsWith("http://") &&
                        !prop.value.startsWith("https://") &&
                        !prop.value.startsWith("#")
                    ) {
                        prop.value = `/_/global/${mapsHost}/flavor/courtyard.tmj`;
                    }
                }
            }
            // Handle objects within object layers
            if (layer.objects) {
                for (const obj of layer.objects) {
                    if (obj.properties) {
                        for (const prop of obj.properties) {
                            if (
                                prop.name === "exitUrl" &&
                                prop.value &&
                                !prop.value.startsWith("http://") &&
                                !prop.value.startsWith("https://") &&
                                !prop.value.startsWith("#")
                            ) {
                                prop.value = `/_/global/${mapsHost}/flavor/courtyard.tmj`;
                            }
                        }
                    }
                }
            }
        }
    }

    private async serveHouse(req: Request, res: Response) {
        const slackId = req.params.slackId;
        console.log(`[DynamicMapController] Serving house for Slack ID: ${slackId}`);

        try {
            const housePath = "/usr/src/app/maps/flavor/house.tmj";
            const houseContent = fs.readFileSync(housePath, "utf-8");

            // ensure using absolute URLs
            const mapData = JSON.parse(houseContent);

            // Get display name from database
            let displayName = slackId; // fallback
            try {
                const user = await postgresClient.getUserBySlackId(slackId);
                if (user && user.givenName) {
                    displayName = user.givenName;
                    console.log(`[DynamicMapController] Found display name: ${displayName}`);
                }
            } catch (error) {
                console.warn(`[DynamicMapController] Could not fetch user: ${error}`);
            }

            // Replace "Hello World" text object with display name (houses)
            if (mapData.layers) {
                for (const layer of mapData.layers) {
                    if (layer.type === "objectgroup" && layer.objects) {
                        for (const obj of layer.objects) {
                            if (obj.text && obj.text.text === "Hello World") {
                                obj.text.text = displayName;
                                console.log(`[DynamicMapController] Replaced text with: ${displayName}`);
                            }
                        }
                    }
                }
            }

            // string handling to rewrite paths to absolute URLs
            // Use X-Forwarded-Proto if available (for reverse proxies), otherwise use req.protocol
            const protocol = req.get("X-Forwarded-Proto") || req.protocol;
            const requestHost = req.get("host") || "";

            const mapsHost = requestHost.includes("workadventure.localhost")
                ? requestHost.replace(/^play\./, "maps.")
                : requestHost;
            const mapsBaseUrl = `${protocol}://${mapsHost}/flavor`;

            console.log(`[DynamicMapController] Maps base URL: ${mapsBaseUrl}`);

            // Use full absolute URLs always
            if (mapData.tilesets) {
                for (const tileset of mapData.tilesets) {
                    if (
                        tileset.image &&
                        !tileset.image.startsWith("http://") &&
                        !tileset.image.startsWith("https://")
                    ) {
                        // Convert relative path to absolute URL, removing ../ and ./
                        const imgPath = tileset.image.replace(/^\.\.\//, "").replace(/^\.\//, "");
                        tileset.image = `${mapsBaseUrl}/${imgPath}`;
                    }
                }
            }

            if (mapData.properties) {
                for (const prop of mapData.properties) {
                    if (
                        prop.name === "mapImage" &&
                        prop.value &&
                        !prop.value.startsWith("http://") &&
                        !prop.value.startsWith("https://")
                    ) {
                        const imgPath = prop.value.replace(/^\.\.\//, "").replace(/^\.\//, "");
                        prop.value = `${mapsBaseUrl}/${imgPath}`;
                    }

                    if (
                        prop.name === "script" &&
                        prop.value &&
                        !prop.value.startsWith("http://") &&
                        !prop.value.startsWith("https://")
                    ) {
                        const scriptPath = prop.value.replace(/^\.\.\//, "").replace(/^\.\//, "");
                        prop.value = `${mapsBaseUrl}/${scriptPath}`;
                    }
                }
            }

            if (mapData.layers) {
                this.fixExitUrls(mapData.layers, mapsHost);
            }

            res.setHeader("Content-Type", "application/json");
            // Only allow requests from the play domain (same origin or play.* subdomain)
            const origin = req.get("origin");
            if (origin && (origin.includes("workadventure.localhost") || origin.includes("hackclub.com"))) {
                res.setHeader("Access-Control-Allow-Origin", origin);
            }
            res.send(JSON.stringify(mapData));
        } catch (error) {
            console.error("[DynamicMapController] Error serving house:", error);
            res.status(500).json({ error: "Failed to load house map" });
        }
    }

    private serveMeeting(req: Request, res: Response) {
        const meetId = req.params.meetId;
        console.log(`[DynamicMapController] Serving meeting for ID: ${meetId}`);

        try {
            const conferencePath = "/usr/src/app/maps/flavor/conference.tmj";
            const conferenceContent = fs.readFileSync(conferencePath, "utf-8");

            // Parse and rewrite tileset/image paths to absolute URLs
            const mapData = JSON.parse(conferenceContent);

            // Build the maps server URL from the request
            // Use X-Forwarded-Proto if available (for reverse proxies), otherwise use req.protocol
            const protocol = req.get("X-Forwarded-Proto") || req.protocol;
            const requestHost = req.get("host") || "";
            // In dev: use maps.workadventure.localhost
            // In prod: use same host (flavor-adventure.hackclub.com serves maps via /flavor)
            const mapsHost = requestHost.includes("workadventure.localhost")
                ? requestHost.replace(/^play\./, "maps.")
                : requestHost;
            const mapsBaseUrl = `${protocol}://${mapsHost}/flavor`;

            console.log(`[DynamicMapController] Maps base URL: ${mapsBaseUrl}`);

            if (mapData.tilesets) {
                for (const tileset of mapData.tilesets) {
                    if (
                        tileset.image &&
                        !tileset.image.startsWith("http://") &&
                        !tileset.image.startsWith("https://")
                    ) {
                        // Convert relative path like "tilesets/WA_Special_Zones.png"
                        // to absolute URL based on the request origin
                        tileset.image = `${mapsBaseUrl}/${tileset.image}`;
                    }
                }
            }

            if (mapData.properties) {
                for (const prop of mapData.properties) {
                    if (
                        prop.name === "mapImage" &&
                        prop.value &&
                        !prop.value.startsWith("http://") &&
                        !prop.value.startsWith("https://")
                    ) {
                        prop.value = `${mapsBaseUrl}/${prop.value}`;
                    }
                    // Also fix script paths
                    if (
                        prop.name === "script" &&
                        prop.value &&
                        !prop.value.startsWith("http://") &&
                        !prop.value.startsWith("https://")
                    ) {
                        prop.value = `${mapsBaseUrl}/${prop.value}`;
                    }
                }
            }

            if (mapData.layers) {
                this.fixExitUrls(mapData.layers, mapsHost);
            }

            res.setHeader("Content-Type", "application/json");
            // Only allow requests from the play domain (same origin or play.* subdomain)
            const origin = req.get("origin");
            if (origin && (origin.includes("workadventure.localhost") || origin.includes("hackclub.com"))) {
                res.setHeader("Access-Control-Allow-Origin", origin);
            }
            res.send(JSON.stringify(mapData));
        } catch (error) {
            console.error("[DynamicMapController] Error serving meeting:", error);
            res.status(500).json({ error: "Failed to load meeting map" });
        }
    }

    private serveUniqueUI(req: Request, res: Response) {
        const uuid = req.params.uuid;
        console.log(`[DynamicMapController] Serving unique UI for UUID: ${uuid}`);

        try {
            const uiPath = "/usr/src/app/maps/flavor/UI.tmj";
            const uiContent = fs.readFileSync(uiPath, "utf-8");

            // Parse and rewrite tileset/image paths to absolute URLs
            const mapData = JSON.parse(uiContent);

            // Build the maps server URL from the request
            const protocol = req.get("X-Forwarded-Proto") || req.protocol;
            const requestHost = req.get("host") || "";
            const mapsHost = requestHost.includes("workadventure.localhost")
                ? requestHost.replace(/^play\./, "maps.")
                : requestHost;
            const mapsBaseUrl = `${protocol}://${mapsHost}/flavor`;

            console.log(`[DynamicMapController] Maps base URL: ${mapsBaseUrl}`);

            // Rewrite tileset images
            if (mapData.tilesets) {
                for (const tileset of mapData.tilesets) {
                    if (
                        tileset.image &&
                        !tileset.image.startsWith("http://") &&
                        !tileset.image.startsWith("https://")
                    ) {
                        const imgPath = tileset.image.replace(/^\.\.\//, "").replace(/^\.\//, "");
                        tileset.image = `${mapsBaseUrl}/${imgPath}`;
                    }
                }
            }

            // Rewrite properties (mapImage, script, etc.)
            if (mapData.properties) {
                for (const prop of mapData.properties) {
                    if (
                        prop.name === "mapImage" &&
                        prop.value &&
                        !prop.value.startsWith("http://") &&
                        !prop.value.startsWith("https://")
                    ) {
                        const imgPath = prop.value.replace(/^\.\.\//, "").replace(/^\.\//, "");
                        prop.value = `${mapsBaseUrl}/${imgPath}`;
                    }

                    if (
                        prop.name === "script" &&
                        prop.value &&
                        !prop.value.startsWith("http://") &&
                        !prop.value.startsWith("https://")
                    ) {
                        const scriptPath = prop.value.replace(/^\.\.\//, "").replace(/^\.\//, "");
                        prop.value = `${mapsBaseUrl}/${scriptPath}`;
                    }
                }
            }

            if (mapData.layers) {
                this.fixExitUrls(mapData.layers, mapsHost);
            }

            res.setHeader("Content-Type", "application/json");
            // Only allow requests from the play domain
            const origin = req.get("origin");
            if (origin && (origin.includes("workadventure.localhost") || origin.includes("hackclub.com"))) {
                res.setHeader("Access-Control-Allow-Origin", origin);
            }
            res.send(JSON.stringify(mapData));
        } catch (error) {
            console.error("[DynamicMapController] Error serving unique UI:", error);
            res.status(500).json({ error: "Failed to load UI map" });
        }
    }
}
