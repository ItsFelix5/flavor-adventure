import crypto from "crypto";
import type { Client, IntrospectionResponse, OpenIDCallbackChecks } from "openid-client";
import { Issuer, generators, custom } from "openid-client";
import { v4 } from "uuid";
import type { Request, Response } from "express";
import axios from "axios";
import {
    OPID_CLIENT_ID,
    OPID_CLIENT_SECRET,
    OPID_CLIENT_ISSUER,
    OPID_CLIENT_REDIRECT_URL,
    OPID_USERNAME_CLAIM,
    OPID_LOCALE_CLAIM,
    OPID_SCOPE,
    OPID_PROMPT,
    SECRET_KEY,
    OPID_TAGS_CLAIM,
} from "../enums/EnvironmentVariable";

custom.setHttpOptionsDefaults({
    timeout: 50000,
});

class OpenIDClient {
    private issuerPromise: Promise<Client> | null = null;
    private secret: string;

    constructor() {
        this.secret = crypto.createHash("sha256").update(String(SECRET_KEY)).digest("base64").substring(0, 32);
    }

    private initClient(): Promise<Client> {
        if (!this.issuerPromise) {
            this.issuerPromise = Issuer.discover(OPID_CLIENT_ISSUER)
                .then((issuer) => {
                    const client = new issuer.Client({
                        client_id: OPID_CLIENT_ID,
                        client_secret: OPID_CLIENT_SECRET,
                        redirect_uris: [OPID_CLIENT_REDIRECT_URL],
                        response_types: ["code"],
                    });
                    client[custom.clock_tolerance] = 10;
                    return client;
                })
                .catch((e) => {
                    console.info(
                        "Failed to fetch OIDC configuration for both .well-known/openid-configuration and oauth-authorization-server. Trying .well-known/openid-configuration only."
                    );
                    this.issuerPromise = Issuer.discover(OPID_CLIENT_ISSUER + "/.well-known/openid-configuration")
                        .then((issuer) => {
                            const client = new issuer.Client({
                                client_id: OPID_CLIENT_ID,
                                client_secret: OPID_CLIENT_SECRET,
                                redirect_uris: [OPID_CLIENT_REDIRECT_URL],
                                response_types: ["code"],
                            });
                            client[custom.clock_tolerance] = 10;
                            return client;
                        })
                        .catch((e) => {
                            this.issuerPromise = null;
                            throw e;
                        });
                    return this.issuerPromise;
                });
        }
        return this.issuerPromise;
    }

    public authorizationUrl(
        res: Response,
        playUri: string,
        req: Request,
        manuallyTriggered: "true" | undefined,
        chatRoomId: string | undefined,
        providerId: string | undefined,
        providerScopes: string[] | undefined
    ): Promise<string> {
        const isSlack = OPID_CLIENT_ISSUER.includes("slack.com");

        if (isSlack) {
            const state = v4();
            res.cookie("oidc_state", state, {
                httpOnly: true,
                secure: req.secure,
            });

            res.cookie("code_verifier", this.encrypt("slack_oauth"), {
                httpOnly: true,
                secure: req.secure,
            });

            const userScopes =
                providerScopes?.join(",") || "identity.basic,identity.email,identity.avatar,identity.team";
            const authUrl = new URL("https://slack.com/oauth/v2/authorize");
            authUrl.searchParams.set("client_id", OPID_CLIENT_ID);
            authUrl.searchParams.set("user_scope", userScopes);
            authUrl.searchParams.set("state", state);
            authUrl.searchParams.set("redirect_uri", OPID_CLIENT_REDIRECT_URL);

            console.info("Slack OAuth authorization URL generated with user_scope:", userScopes);

            return Promise.resolve(authUrl.toString());
        }

        return this.initClient().then((client) => {
            if (!OPID_SCOPE.includes("email") || !OPID_SCOPE.includes("openid")) {
                throw new Error("Invalid scope, 'email' and 'openid' are required in OPID_SCOPE.");
            }

            const code_verifier = generators.codeVerifier();
            res.cookie("code_verifier", this.encrypt(code_verifier), {
                httpOnly: true,
                secure: req.secure,
            });

            const state = v4();
            res.cookie("oidc_state", state, {
                httpOnly: true,
                secure: req.secure,
            });

            const code_challenge = generators.codeChallenge(code_verifier);

            return client.authorizationUrl({
                scope: OPID_SCOPE,
                prompt: OPID_PROMPT,
                state: state,
                playUri,
                manuallyTriggered,
                chatRoomId,
                providerId,
                providerScopes,
                code_challenge,
                code_challenge_method: "S256",
            });
        });
    }

    public getUserInfo(
        req: Request,
        res: Response,
        playUri: string
    ): Promise<{
        tags: string[] | undefined;
        email: string;
        sub: string;
        access_token: string;
        username: string;
        locale: string;
        matrix_url: string | undefined;
        matrix_identity_provider: string | undefined;
    }> {
        const fullUrl = req.url;
        const cookies = req.cookies;

        if (typeof cookies?.code_verifier !== "string") {
            throw new Error("code verifier doesn't exist");
        }

        const code_verifier = this.decrypt(cookies.code_verifier);
        const state = cookies.oidc_state;

        return this.initClient().then(async (client) => {
            const params = client.callbackParams(fullUrl);

            if (state && params.state && typeof state === "string" && params.state !== state) {
                throw new Error("State mismatch");
            }

            res.clearCookie("code_verifier");
            res.clearCookie("oidc_state");

            const isSlack = OPID_CLIENT_ISSUER.includes("slack.com");

            let accessToken: string;
            let userInfoResponse: Record<string, unknown>;

            if (isSlack) {
                console.info("Detected Slack OAuth - using Slack-specific token exchange");
                if (!params.code) {
                    throw new Error("No authorization code received from Slack");
                }
                accessToken = await this.exchangeSlackCode(params.code);
                console.info("Successfully exchanged Slack code for access token");
                userInfoResponse = await this.fetchSlackUserInfo(accessToken);
                console.info("Successfully fetched Slack user info:", {
                    userId: userInfoResponse.sub,
                    email: userInfoResponse.email,
                    name: userInfoResponse.name,
                });
            } else {
                const checks: OpenIDCallbackChecks = {
                    code_verifier,
                };

                if (state && params.state && typeof state === "string") {
                    checks.state = state;
                }

                let tokenSet;
                try {
                    tokenSet = await client.callback(OPID_CLIENT_REDIRECT_URL, params, checks);
                } catch (error) {
                    if (error instanceof Error && error.message.includes("id_token")) {
                        console.info(
                            "ID token not found in response - attempting OAuth 2.0 flow without ID token validation"
                        );
                        tokenSet = await client.oauthCallback(OPID_CLIENT_REDIRECT_URL, params, checks);
                    } else {
                        throw error;
                    }
                }

                if (!tokenSet.access_token) {
                    throw new Error("No access_token in TokenSet from OAuth provider");
                }

                accessToken = tokenSet.access_token;

                try {
                    userInfoResponse = await client.userinfo(accessToken, {
                        params: {
                            playUri,
                        },
                    });
                } catch (error) {
                    console.warn("Standard userinfo endpoint not available:", error);
                    userInfoResponse = {};
                }
            }

            return {
                ...userInfoResponse,
                email: (userInfoResponse.email as string) ?? "",
                sub: (userInfoResponse.sub as string) ?? (userInfoResponse.user_id as string) ?? "",
                access_token: accessToken,
                username:
                    (userInfoResponse.name as string) ??
                    (userInfoResponse[OPID_USERNAME_CLAIM] as string) ??
                    (userInfoResponse.real_name as string) ??
                    "",
                locale: (userInfoResponse[OPID_LOCALE_CLAIM] as string) ?? (userInfoResponse.locale as string) ?? "",
                tags: (userInfoResponse[OPID_TAGS_CLAIM] as string[]) ?? [],
                matrix_url: userInfoResponse.matrix_url as string | undefined,
                matrix_identity_provider: userInfoResponse.matrix_identity_provider as string | undefined,
            };
        });
    }

    private async exchangeSlackCode(code: string): Promise<string> {
        try {
            const response = await axios.post(
                "https://slack.com/api/oauth.v2.access",
                new URLSearchParams({
                    code,
                    client_id: OPID_CLIENT_ID,
                    client_secret: OPID_CLIENT_SECRET,
                    redirect_uri: OPID_CLIENT_REDIRECT_URL,
                }),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                }
            );

            if (!response.data.ok) {
                throw new Error(`Slack OAuth error: ${response.data.error}`);
            }

            return response.data.authed_user.access_token;
        } catch (error) {
            console.error("Error exchanging Slack authorization code:", error);
            throw error;
        }
    }

    private async fetchSlackUserInfo(accessToken: string): Promise<Record<string, unknown>> {
        try {
            const response = await axios.get("https://slack.com/api/users.identity", {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (!response.data.ok) {
                throw new Error(`Slack API error: ${response.data.error}`);
            }

            const { user, team } = response.data;

            return {
                sub: user.id,
                user_id: user.id,
                name: user.name,
                email: user.email,
                real_name: user.real_name || user.name,
                locale: user.locale || "en-US",
                team_id: team?.id,
                team_name: team?.name,
            };
        } catch (error) {
            console.error("Error fetching Slack user info:", error);
            throw error;
        }
    }

    public logoutUser(token: string): Promise<void> {
        return this.initClient().then((client) => {
            if (!client.metadata.revocation_endpoint) {
                return;
            }
            return client.revoke(token);
        });
    }

    public checkTokenAuth(token: string): Promise<IntrospectionResponse> {
        return this.initClient().then((client) => {
            return client.userinfo(token);
        });
    }

    private encrypt(text: string): string {
        const iv = crypto.randomBytes(16);
        // @ts-ignore Required because of a bug in svelte-check that is typechecking pusher for some reason
        const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(this.secret), iv);
        let encrypted = cipher.update(text);
        // @ts-ignore Required because of a bug in svelte-check that is typechecking pusher for some reason
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString("hex") + "::" + encrypted.toString("hex");
    }

    private decrypt(data: string): string {
        const parts = data.split("::");
        if (parts.length !== 2) {
            throw new Error("Unexpected encrypted data: " + data);
        }
        const ivStr = parts[0];
        const encryptedData = parts[1];
        const iv = Buffer.from(ivStr, "hex");
        const encryptedText = Buffer.from(encryptedData, "hex");
        // @ts-ignore Required because of a bug in svelte-check that is typechecking pusher for some reason
        const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(this.secret), iv);
        // @ts-ignore Required because of a bug in svelte-check that is typechecking pusher for some reason
        let decrypted = decipher.update(encryptedText);
        // @ts-ignore Required because of a bug in svelte-check that is typechecking pusher for some reason
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }
}

export const openIDClient = new OpenIDClient();
