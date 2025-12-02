import Debug from "debug";
import { METERED_TURN_API_URL } from "../enums/EnvironmentVariable";
import { BaseHttpController } from "./BaseHttpController";

const debug = Debug("pusher:turn");

let cachedIceServers: unknown[] | null = null;
let cacheExpiry = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export class TurnController extends BaseHttpController {
    routes(): void {
        this.app.get("/api/turn-credentials", async (req, res) => {
            debug(`TurnController => [${req.method}] ${req.originalUrl}`);

            if (!METERED_TURN_API_URL) {
                return res.status(404).json({ error: "TURN service not configured" });
            }

            // Return cached credentials if still valid
            if (cachedIceServers && Date.now() < cacheExpiry) {
                debug("Returning cached TURN credentials");
                return res.json(cachedIceServers);
            }

            try {
                const response = await fetch(METERED_TURN_API_URL);
                if (!response.ok) {
                    throw new Error(`Metered API returned ${response.status}`);
                }
                const iceServers = await response.json();

                // Cache the credentials
                // eslint-disable-next-line require-atomic-updates
                cachedIceServers = iceServers;
                // eslint-disable-next-line require-atomic-updates
                cacheExpiry = Date.now() + CACHE_DURATION;

                debug("Fetched fresh TURN credentials from Metered");
                return res.json(iceServers);
            } catch (error) {
                console.error("Failed to fetch TURN credentials:", error);
                return res.status(500).json({ error: "Failed to fetch TURN credentials" });
            }
        });
    }
}
