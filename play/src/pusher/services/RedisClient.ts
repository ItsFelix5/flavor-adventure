import { createClient, RedisClientType } from "redis";

class RedisClient {
    private client: RedisClientType | null = null;
    private enabled = false;

    private handleError(this: void, err: unknown) {
        console.error("Redis Client Error", err);
    }

    async init(): Promise<void> {
        const host = process.env.REDIS_HOST;
        const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;
        const password = process.env.REDIS_PASSWORD;

        if (!host) {
            console.info("Redis not configured (missing REDIS_HOST env var). User uniqueness check disabled.");
            return;
        }

        const url = `redis://${password ? `:${password}@` : ""}${host}:${port}`;

        try {
            this.client = createClient({
                url,
            });

            // eslint-disable-next-line listeners/no-missing-remove-event-listener
            this.client.on("error", this.handleError);

            await this.client.connect();
            console.info("Redis connection established successfully");

            this.enabled = true;
        } catch (error) {
            console.error("Failed to initialize Redis connection:", error);
            this.client = null;
            this.enabled = false;
        }
    }

    isEnabled(): boolean {
        return this.enabled && this.client !== null;
    }

    async isUserOnline(userUuid: string): Promise<boolean> {
        if (!this.isEnabled() || !this.client) {
            return false;
        }
        const value = await this.client.get(`user_online:${userUuid}`);
        return value === "true";
    }

    async setUserOnline(userUuid: string): Promise<void> {
        if (!this.isEnabled() || !this.client) {
            return;
        }
        // Set user as online. No expiration for now.
        // use TTL of 24 hours to avoid stale entries
        await this.client.set(`user_online:${userUuid}`, "true", { EX: 86400 });
    }

    async setUserOffline(userUuid: string): Promise<void> {
        if (!this.isEnabled() || !this.client) {
            return;
        }
        await this.client.del(`user_online:${userUuid}`);
    }
}

export const redisClient = new RedisClient();
