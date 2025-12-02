// Mock OIDC removed. Helpers now no-op.
export async function oidcLogin() {
    throw new Error("Mock OIDC disabled");
}
export async function oidcLogout() {
    /* no-op */
}
export async function oidcAdminTagLogin() {
    throw new Error("Mock OIDC disabled");
}
export async function oidcMatrixUserLogin() {
    throw new Error("Mock OIDC disabled");
}
export async function oidcMemberTagLogin() {
    throw new Error("Mock OIDC disabled");
}
