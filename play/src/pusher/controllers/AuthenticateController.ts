import fs from "fs";
import { RegisterData } from "@workadventure/messages";
import { z } from "zod";
import Mustache from "mustache";
import { Application } from "express";
import Debug from "debug";
import { AuthTokenData, jwtTokenManager } from "../services/JWTTokenManager";
import { openIDClient } from "../services/OpenIDClient";
import { hackClubAuthClient } from "../services/HackClubAuthClient";
import { FRONT_URL } from "../enums/EnvironmentVariable";
import { adminService } from "../services/AdminService";
import { validateQuery } from "../services/QueryValidator";
import { VerifyDomainService } from "../services/verifyDomain/VerifyDomainService";
import { matrixProvider } from "../services/MatrixProvider";
import { postgresClient } from "../services/PostgresClient";
import { BaseHttpController } from "./BaseHttpController";

const debug = Debug("pusher:requests");

export class AuthenticateController extends BaseHttpController {
    private readonly redirectToMatrixFile: string;
    private readonly redirectToPlayFile: string;
    private readonly loginOptionsFile: string;
    constructor(app: Application) {
        super(app);

        let redirectToMatrixPath: string;
        if (process.env.NODE_ENV === "production" && fs.existsSync("dist/public/redirectToMatrix.html")) {
            // In prod mode
            redirectToMatrixPath = "dist/public/redirectToMatrix.html";
        } else if (fs.existsSync("redirectToMatrix.html")) {
            // In dev mode
            redirectToMatrixPath = "redirectToMatrix.html";
        } else {
            throw new Error("Could not find redirectToMatrix.html file");
        }

        this.redirectToMatrixFile = fs.readFileSync(redirectToMatrixPath, "utf8");

        // Pre-parse the file for speed (and validation)
        Mustache.parse(this.redirectToMatrixFile);

        let redirectToPlayPath: string;
        if (process.env.NODE_ENV === "production" && fs.existsSync("dist/public/redirectToPlay.html")) {
            // In prod mode
            redirectToPlayPath = "dist/public/redirectToPlay.html";
        } else if (fs.existsSync("redirectToPlay.html")) {
            // In dev mode
            redirectToPlayPath = "redirectToPlay.html";
        } else {
            throw new Error("Could not find redirectToPlay.html file");
        }

        this.redirectToPlayFile = fs.readFileSync(redirectToPlayPath, "utf8");

        // Pre-parse the file for speed (and validation)
        Mustache.parse(this.redirectToPlayFile);

        let loginOptionsPath: string;
        if (process.env.NODE_ENV === "production" && fs.existsSync("dist/public/loginOptions.html")) {
            // In prod mode
            loginOptionsPath = "dist/public/loginOptions.html";
        } else if (fs.existsSync("loginOptions.html")) {
            // In dev mode
            loginOptionsPath = "loginOptions.html";
        } else {
            throw new Error("Could not find loginOptions.html file");
        }

        this.loginOptionsFile = fs.readFileSync(loginOptionsPath, "utf8");
        Mustache.parse(this.loginOptionsFile);
    }

    routes(): void {
        this.authHackClub();
        this.openIDCallback();
        this.matrixCallback();
        this.logoutCallback();
        this.register();
        this.logoutUser();
    }

    private authHackClub(): void {
        /**
         * @openapi
         * /auth/hackclub:
         *   get:
         *     description: Redirects the user to the Hack Club login screen
         *     parameters:
         *      - name: "playUri"
         *        in: "query"
         *        description: "todo"
         *        required: false
         *        type: "string"
         *     responses:
         *       302:
         *         description: Redirects the user to the Hack Club login screen
         */
        this.app.get("/auth/hackclub", async (req, res) => {
            debug(`AuthenticateController => [${req.method}] ${req.originalUrl} — IP: ${req.ip} — Time: ${Date.now()}`);
            const query = validateQuery(
                req,
                res,
                z.object({
                    playUri: z.string(),
                    manuallyTriggered: z.literal("true").optional(),
                    chatRoomId: z.string().optional(),
                    providerId: z.string().optional(),
                    providerScopes: z.string().array().optional(),
                })
            );
            if (query === undefined) {
                return;
            }

            const verifyDomainService_ = VerifyDomainService.get(await adminService.getCapabilities());
            const verifyDomainResult = await verifyDomainService_.verifyDomain(query.playUri);
            if (!verifyDomainResult) {
                res.status(403);
                res.send("Unauthorized domain in playUri");
                return;
            }

            const loginUri = hackClubAuthClient.authorizationUrl(
                res,
                query.playUri,
                req,
                query.manuallyTriggered,
                query.chatRoomId,
                query.providerId,
                query.providerScopes
            );

            res.cookie("playUri", query.playUri, {
                httpOnly: true,
                secure: req.secure && process.env.NODE_ENV !== "development",
                sameSite: "lax",
            });

            res.redirect(loginUri);
        });
    }

    private openIDCallback(): void {
        /**
         * @openapi
         * /openid-callback:
         *   get:
         *     description: This endpoint is meant to be called by the OpenID provider after the OpenID provider handles a login attempt. The OpenID provider redirects the browser to this endpoint.
         *     parameters:
         *      - name: "code"
         *        in: "query"
         *        description: "A unique code to be exchanged for an authentication token"
         *        required: false
         *        type: "string"
         *      - name: "nonce"
         *        in: "query"
         *        description: "todo"
         *        required: false
         *        type: "string"
         *     responses:
         *       302:
         *         description: Redirects to play once authentication is done, unless we use an AdminAPI (in this case, we redirect to the AdminAPI with same parameters)
         */

        this.app.get("/openid-callback", async (req, res) => {
            debug(`AuthenticateController => [${req.method}] ${req.originalUrl} — IP: ${req.ip} — Time: ${Date.now()}`);

            // Handle error from OpenID provider (e.g. user cancelled)
            if (req.query.error) {
                console.warn("Error from OpenID provider:", req.query.error, req.query.error_description);
                const playUri = req.cookies.playUri || FRONT_URL;
                res.clearCookie("playUri");
                res.redirect(playUri);
                return;
            }

            const playUri = req.cookies.playUri;
            if (!playUri) {
                console.warn("Missing playUri in cookies, redirecting to home");
                res.redirect(FRONT_URL);
                return;
            }

            let userInfo = null;
            try {
                userInfo = await openIDClient.getUserInfo(req, res, playUri);
            } catch (err) {
                //if no access on openid provider, return error
                console.error("An error occurred while connecting to OpenID Provider => ", err);
                res.status(500);
                res.send("An error occurred while connecting to OpenID Provider");
                return;
            }
            const email = userInfo.email || userInfo.sub;
            if (!email) {
                throw new Error("No email in the response");
            }

            // Upsert user to db and check status
            let isAdmin = false;
            let hasPets = false;
            let isBanned = false;
            if (userInfo.sub) {
                try {
                    const userPerms = await postgresClient.upsertUser(
                        userInfo.sub, // Slack user ID
                        userInfo.username,
                        userInfo.email
                    );
                    isAdmin = userPerms.isAdmin;
                    hasPets = userPerms.hasPets;
                    isBanned = userPerms.isBanned;
                } catch (e: unknown) {
                    console.error("[AuthenticateController] Failed to upsert user:", e);
                }
            }

            // If user is banned, ratio
            if (isBanned) {
                console.warn("[AuthenticateController] User is banned:", userInfo.sub);
                res.clearCookie("playUri");
                return res.redirect("/banned.html");
            }

            const tags = [...(userInfo?.tags || [])];
            if (isAdmin && !tags.includes("admin")) {
                tags.push("admin");
                console.info("[AuthenticateController] Admin privileges granted to:", userInfo.sub);
            }
            if (hasPets && !tags.includes("pets")) {
                tags.push("pets");
                console.info("[AuthenticateController] Pets unlocked for:", userInfo.sub);
            }

            const authToken = jwtTokenManager.createAuthToken(
                email,
                userInfo?.access_token,
                userInfo?.username,
                userInfo?.locale,
                tags,
                email ? matrixProvider.getBareMatrixIdFromEmail(email) : undefined,
                userInfo?.sub // Slack ID
            );

            // Matrix SSO redirect disabled - skip directly to play redirect

            res.clearCookie("playUri");

            res.redirect(playUri + "?token=" + encodeURIComponent(authToken));
            return;
        });
    }

    private matrixCallback(): void {
        /**
         * @openapi
         * /matrix-callback:
         *   get:
         *     description: This endpoint is meant to be called by the Matrix server (Synapse) after the OpenID provider connected to Synapse handles a login attempt. Synapse redirects the browser to this endpoint.
         *     parameters:
         *      - name: "loginToken"
         *        in: "query"
         *        description: "A unique token that can be exchanged for a Matrix authentication token"
         *        required: true
         *        type: "string"
         *     responses:
         *       302:
         *         description: Redirects to play once authentication is done.
         */
        this.app.get("/matrix-callback", (req, res) => {
            debug(`AuthenticateController => [${req.method}] ${req.originalUrl} — IP: ${req.ip} — Time: ${Date.now()}`);
            const playUri = req.cookies.playUri;
            if (!playUri) {
                throw new Error("Missing playUri in cookies");
            }

            const query = validateQuery(
                req,
                res,
                z.object({ loginToken: z.string(), chatRoomId: z.string().optional() })
            );
            if (query === undefined) {
                return;
            }

            res.clearCookie("playUri");
            res.clearCookie("authToken");
            const playUriUrl = new URL(req.cookies.playUri);
            playUriUrl.searchParams.append("matrixLoginToken", query.loginToken);

            if (query.chatRoomId) {
                playUriUrl.searchParams.append("chatRoomId", query.chatRoomId);
            }

            const html = Mustache.render(this.redirectToPlayFile, {
                playUri: playUriUrl.toString(),
            });
            res.type("html").send(html);
            return;
        });
    }

    /**
     * @openapi
     * /register:
     *   post:
     *     description: Try to login with an admin token
     *     parameters:
     *      - name: "organizationMemberToken"
     *        in: "body"
     *        description: "A token allowing a user to connect to a given world"
     *        required: true
     *        type: "string"
     *     responses:
     *       200:
     *         description: The details of the logged user
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 authToken:
     *                   type: string
     *                   description: A unique identification JWT token
     *                 userUuid:
     *                   type: string
     *                   description: Unique user ID
     *                 email:
     *                   type: string|null
     *                   description: The email of the user
     *                   example: john.doe@example.com
     *                 roomUrl:
     *                   type: string
     *                   description: The room URL to connect to
     *                   example: https://play.workadventu.re/@/foo/bar/baz
     *                 organizationMemberToken:
     *                   type: string|null
     *                   description: TODO- unclear. It seems to be sent back from the request?
     *                   example: ???
     *                 mapUrlStart:
     *                   type: string
     *                   description: TODO- unclear. I cannot find any use of this
     *                   example: ???
     *                 messages:
     *                   type: array
     *                   description: The list of messages to be displayed when the user logs?
     *                   example: ???
     *                  Note the above is from the original devs, not hack club, not sure what they were cooking
     */
    private register(): void {
        this.app.options("/register", (req, res) => {
            res.status(200).send("");
        });

        this.app.post("/register", async (req, res) => {
            debug(`AuthenticateController => [${req.method}] ${req.originalUrl} — IP: ${req.ip} — Time: ${Date.now()}`);
            const param = req.body;

            //todo: what to do if the organizationMemberToken is already used?
            const organizationMemberToken: string | null = param.organizationMemberToken;
            const playUri: string | null = param.playUri;

            if (typeof organizationMemberToken != "string") throw new Error("No organization token");
            const data = await adminService.fetchMemberDataByToken(
                organizationMemberToken,
                playUri,
                req.header("accept-language")
            );
            const userUuid = data.userUuid;
            const email = data.email;
            const roomUrl = data.roomUrl;
            const mapUrlStart = data.mapUrlStart;
            const matrixUserId = email ? matrixProvider.getBareMatrixIdFromEmail(email) : undefined;

            const authToken = jwtTokenManager.createAuthToken(
                email || userUuid,
                undefined,
                undefined,
                undefined,
                [],
                matrixUserId
            );

            res.json({
                authToken,
                userUuid,
                email,
                roomUrl,
                mapUrlStart,
                organizationMemberToken,
            } satisfies RegisterData);
        });
    }

    private logoutCallback(): void {
        /**
         * @openapi
         * /logout-callback:
         *   get:
         *     description: TODO
         *     parameters:
         *      - name: "token"
         *        in: "query"
         *        description: "todo"
         *        required: false
         *        type: "string"
         *     responses:
         *       200:
         *         description: TODO
         *
         */
        this.app.get("/logout-callback", (req, res) => {
            debug(`AuthenticateController => [${req.method}] ${req.originalUrl} — IP: ${req.ip} — Time: ${Date.now()}`);
            // if no playUri, redirect to front
            if (!req.cookies.playUri) {
                res.redirect(FRONT_URL);
                return;
            }

            // when user logout, redirect to playUri saved in cookie
            const logOutAdminUrl = new URL(req.cookies.playUri);
            res.clearCookie("playUri");
            res.redirect(logOutAdminUrl.toString());
            return;
        });
    }

    private logoutUser(): void {
        /**
         * @openapi
         * /logout:
         *   get:
         *     description: TODO
         *     responses:
         *       302:
         *         description: Redirects the user to the OpenID logout screen
         */
        this.app.get("/logout", async (req, res) => {
            debug(`AuthenticateController => [${req.method}] ${req.originalUrl} — IP: ${req.ip} — Time: ${Date.now()}`);
            const query = validateQuery(
                req,
                res,
                z.object({
                    playUri: z.string(),
                    token: z.string(),
                    redirect: z.string().optional(),
                })
            );
            if (query === undefined) {
                return;
            }

            const verifyDomainService_ = VerifyDomainService.get(await adminService.getCapabilities());
            const verifyDomainResult = await verifyDomainService_.verifyDomain(query.playUri);
            if (!verifyDomainResult) {
                res.status(403);
                res.send("Unauthorized domain in playUri");
                return;
            }

            const authTokenData: AuthTokenData = jwtTokenManager.verifyJWTToken(query.token, false);
            if (authTokenData.accessToken == undefined) {
                throw Error("Cannot log out, no access token found.");
            }
            // TODO: change that to use end session endpoint
            // Use post logout redirect and id token hint to redirect on the logut session endpoint of the OpenId provider
            // https://openid.net/specs/openid-connect-session-1_0.html#RPLogout
            await openIDClient.logoutUser(authTokenData.accessToken);

            // if no redirect, redirect to playUri and connect user to the world
            // if the world is with authentication mandatory, the user will be redirected to the login screen
            // if the world is anonymous or with authentication optional, the user will be connected to the world
            if (!query.redirect) {
                res.redirect(query.playUri);
                return;
            }

            // save the playUri in cookie to redirect to the world after logout
            res.cookie("playUri", query.playUri, {
                httpOnly: true, // dont let browser javascript access cookie ever
                secure: req.secure, // only use cookie over https
            });
            res.redirect(query.redirect);
        });
    }
}
