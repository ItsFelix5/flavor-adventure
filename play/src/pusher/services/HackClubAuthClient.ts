import { v4 } from "uuid";
import axios from "axios";
import type { Request, Response } from "express";
import {
    HACK_CLUB_CLIENT_ID,
    HACK_CLUB_CLIENT_SECRET,
    OPID_CLIENT_REDIRECT_URL,
} from "../enums/EnvironmentVariable";

export class HackClubAuthClient {
    private readonly authUrl = "https://hca.dinosaurbbq.org/oauth/authorize";
    private readonly tokenUrl = "https://hca.dinosaurbbq.org/oauth/token";
    private readonly userInfoUrl = "https://hca.dinosaurbbq.org/api/v1/me";

    public authorizationUrl(
        res: Response,
        playUri: string,
        req: Request,
        manuallyTriggered: "true" | undefined,
        chatRoomId: string | undefined,
        providerId: string | undefined,
        providerScopes: string[] | undefined
    ): string {
        if (!HACK_CLUB_CLIENT_ID) {
            console.error("HACK_CLUB_CLIENT_ID is missing in authorizationUrl");
            throw new Error("Hack Club Client ID is not configured");
        }

        const state = v4();
        res.cookie("oidc_state", state, {
            httpOnly: true,
            secure: req.secure,
        });

        // Hack Club OAuth doesn't seem to use code_verifier based on the guide, 
        // but we'll set it if needed or just ignore it.
        
        // Use HCA specific redirect URL (which we will create endpoint for)
        // But wait, we can probably reuse the existing callback structure if we are careful.
        // However, since we need to differentiate between providers callback, 
        // let's assume we'll use a specific one: /auth/hackclub/callback
        const redirectUri = this.getRedirectUrl();

        const url = new URL(this.authUrl);
        url.searchParams.set("client_id", HACK_CLUB_CLIENT_ID);
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "email name slack_id");
        url.searchParams.set("state", state);

        // Pass playUri via state or cookie? 
        // AuthenticateController sets playUri in cookie before redirecting, so we rely on that.

        return url.toString();
    }

    private getRedirectUrl(): string {
        // Construct callback URL based on the base PUSHER_URL
        // We can reuse OPID_CLIENT_REDIRECT_URL base but change path
        const baseUrl = new URL(OPID_CLIENT_REDIRECT_URL).origin;
        return `${baseUrl}/auth/hackclub/callback`;
    }

    public async exchangeCode(code: string): Promise<string> {
        if (!HACK_CLUB_CLIENT_ID || !HACK_CLUB_CLIENT_SECRET) {
            throw new Error("Hack Club Client ID or Secret not configured");
        }

        const response = await axios.post(this.tokenUrl, {
            client_id: HACK_CLUB_CLIENT_ID,
            client_secret: HACK_CLUB_CLIENT_SECRET,
            redirect_uri: this.getRedirectUrl(),
            code: code,
            grant_type: "authorization_code",
        }, {
            headers: {
                "Content-Type": "application/json"
            }
        });

        return response.data.access_token;
    }

    public async getUserInfo(accessToken: string): Promise<{
        sub: string; // We'll map slack_id or id to sub
        name: string;
        email: string;
        slack_id?: string;
    }> {
        const response = await axios.get(this.userInfoUrl, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const data = response.data;
        
        // Extract info from the "identity" object if present (as per new response format)
        const identity = data.identity || data;
        
        // Map HCA user info to our structure
        // HCA returns: id, name, email, slack_id, etc. (possibly nested in identity)
        // We want to use slack_id as the primary identifier if available to match Slack login
        return {
            sub: identity.slack_id || identity.id,
            name: identity.name, // Note: User wants to fetch name from Slack instead, we handle that in AuthenticateController
            email: identity.primary_email || identity.email,
            slack_id: identity.slack_id,
        };
    }
}

export const hackClubAuthClient = new HackClubAuthClient();
