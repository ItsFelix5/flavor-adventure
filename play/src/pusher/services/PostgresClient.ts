import { Pool, PoolClient } from "pg";

class PostgresClient {
    private pool: Pool | null = null;
    private enabled = false;
    private initializationPromise: Promise<void> | null = null;

    async init(): Promise<void> {
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this.doInit();
        return this.initializationPromise;
    }

    private async doInit(): Promise<void> {
        const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

        if (connectionString) {
            // Use connection string if provided
            try {
                this.pool = new Pool({
                    connectionString,
                    max: 10,
                    idleTimeoutMillis: 30000,
                    connectionTimeoutMillis: 5000,
                });

                // Test the connection
                const client = await this.pool.connect();
                console.info("PostgreSQL connection established successfully (via connection string)");
                client.release();

                this.enabled = true;
                await this.initUserMapsTable();
                return;
            } catch (error) {
                console.error("Failed to initialize PostgreSQL connection:", error);
                this.pool = null;
                this.enabled = false;
                return;
            }
        }

        // Fall back to individual environment variables
        const host = process.env.POSTGRES_HOST;
        const port = process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT) : 5432;
        const database = process.env.POSTGRES_DATABASE;
        const user = process.env.POSTGRES_USER;
        const password = process.env.POSTGRES_PASSWORD;

        if (!host || !database || !user || !password) {
            console.info("PostgreSQL not configured (missing required env vars). Chat logging disabled.");
            return;
        }

        try {
            this.pool = new Pool({
                host,
                port,
                database,
                user,
                password,
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000,
            });

            // Test the connection
            const client = await this.pool.connect();
            console.info("PostgreSQL connection established successfully");
            client.release();

            this.enabled = true;
            await this.initUserMapsTable();
        } catch (error) {
            console.error("Failed to initialize PostgreSQL connection:", error);
            this.pool = null;
            this.enabled = false;
        }
    }

    private async initUserMapsTable(): Promise<void> {
        if (!this.isEnabled()) return;
        try {
            // Create table if not exists
            await this.query(`
                CREATE TABLE IF NOT EXISTS user_maps (
                    slack_id TEXT PRIMARY KEY,
                    map_url TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Add is_approved column if it doesn't exist
            await this.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_maps' AND column_name='is_approved') THEN
                        ALTER TABLE user_maps ADD COLUMN is_approved BOOLEAN DEFAULT FALSE;
                    END IF;
                END
                $$;
            `);

            console.info("PostgreSQL user_maps table initialized");
        } catch (error) {
            console.error("Failed to initialize user_maps table:", error);
        }
    }

    isEnabled(): boolean {
        return this.enabled && this.pool !== null;
    }

    async query(text: string, params?: unknown[]): Promise<unknown> {
        if (!this.pool) {
            throw new Error("PostgreSQL is not initialized");
        }

        const client: PoolClient = await this.pool.connect();
        try {
            const result = await client.query(text, params);
            return result;
        } finally {
            client.release();
        }
    }

    async upsertUser(
        slackId: string,
        givenName?: string,
        email?: string
    ): Promise<{ isAdmin: boolean; hasPets: boolean; isBanned: boolean }> {
        if (!this.isEnabled()) {
            return { isAdmin: false, hasPets: false, isBanned: false };
        }

        try {
            const result = (await this.query(
                `INSERT INTO users (slack_id, given_name, email, updated_at)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (slack_id) 
                DO UPDATE SET 
                    given_name = COALESCE(EXCLUDED.given_name, users.given_name),
                    email = COALESCE(EXCLUDED.email, users.email),
                    updated_at = CURRENT_TIMESTAMP
                RETURNING is_admin, is_banned, has_unlocked_pets`,
                [slackId, givenName, email]
            )) as { rows: Array<{ is_admin: boolean; is_banned: boolean; has_unlocked_pets: boolean }> };

            const user = result.rows[0];
            const isAdmin = user?.is_admin || false;
            const isBanned = user?.is_banned || false;
            const hasPets = user?.has_unlocked_pets || false;

            console.info("[PostgresClient] User upserted:", slackId, { isAdmin, isBanned, hasPets });
            return { isAdmin, hasPets, isBanned };
        } catch (error) {
            console.error("[PostgresClient] Failed to upsert user:", error);
            return { isAdmin: false, hasPets: false, isBanned: false };
        }
    }

    async getUserBySlackId(slackId: string): Promise<{ givenName: string | null } | null> {
        if (!this.isEnabled()) {
            return null;
        }

        try {
            const result = (await this.query(`SELECT given_name FROM users WHERE slack_id = $1`, [slackId])) as {
                rows: Array<{ given_name: string | null }>;
            };

            if (result.rows.length === 0) {
                return null;
            }

            return { givenName: result.rows[0].given_name };
        } catch (error) {
            console.error("[PostgresClient] Failed to get user:", error);
            return null;
        }
    }

    async upsertUserMap(slackId: string, mapUrl: string): Promise<boolean> {
        if (!this.isEnabled()) return false;
        try {
            await this.query(
                `INSERT INTO user_maps (slack_id, map_url, is_approved, updated_at)
                 VALUES ($1, $2, FALSE, CURRENT_TIMESTAMP)
                 ON CONFLICT (slack_id) 
                 DO UPDATE SET 
                     map_url = EXCLUDED.map_url,
                     is_approved = FALSE,
                     updated_at = CURRENT_TIMESTAMP`,
                [slackId, mapUrl]
            );
            return true;
        } catch (error) {
            console.error("[PostgresClient] Failed to upsert user map:", error);
            return false;
        }
    }

    async getUserMap(slackId: string): Promise<{ mapUrl: string; isApproved: boolean } | null> {
        if (!this.isEnabled()) return null;
        try {
            const result = (await this.query(
                `SELECT map_url, is_approved FROM user_maps WHERE slack_id = $1`,
                [slackId]
            )) as {
                rows: Array<{ map_url: string; is_approved: boolean }>;
            };
            if (result.rows.length === 0) return null;
            return {
                mapUrl: result.rows[0].map_url,
                isApproved: result.rows[0].is_approved,
            };
        } catch (error) {
            console.error("[PostgresClient] Failed to get user map:", error);
            return null;
        }
    }

    async close(): Promise<void> {
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
            this.enabled = false;
        }
    }
}

export const postgresClient = new PostgresClient();
