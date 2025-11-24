<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { UserInputManager } from "../../Phaser/UserInput/UserInputManager";
    import PopUpContainer from "./PopUpContainer.svelte";

    export let message: string;
    export let click: () => void; // For cancel
    export let onSignIn: () => void; // For sign in
    export let userInputManager: UserInputManager;

    let email = "";
    let error = "";

    onMount(() => {
        userInputManager.addSpaceEventListener(onSignIn);
    });

    onDestroy(() => {
        userInputManager.removeSpaceEventListener(onSignIn);
    });

    async function handleEmailLogin() {
        if (!email || !email.includes("@")) {
            error = "Please enter a valid email";
            return;
        }
        try {
            const response = await fetch("/login-email", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    email,
                    playUri: window.location.href,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                if (data.authToken) {
                    const url = new URL(data.playUri || window.location.href);
                    url.searchParams.set("token", data.authToken);
                    window.location.href = url.toString();
                }
            } else {
                error = "Login failed";
            }
        } catch (e) {
            console.error(e);
            error = "An error occurred";
        }
    }
</script>

<PopUpContainer reduceOnSmallScreen={true}>
    <div class="text-center mb-4">
        {message}
    </div>
    
    <div class="mb-4">
        <p class="text-sm mb-2">Sign in with Email (Temporary)</p>
        <input 
            type="email" 
            bind:value={email} 
            placeholder="Enter your email" 
            class="w-full p-2 text-black rounded mb-2"
            on:keydown={(e) => e.stopPropagation()}
        />
        {#if error}
            <p class="text-red-500 text-xs">{error}</p>
        {/if}
        <button class="btn btn-primary w-full justify-center" on:click={handleEmailLogin}>
            Sign in with Email
        </button>
    </div>

    <div class="text-center my-2">- OR -</div>

    <svelte:fragment slot="buttons">
        <button class="btn btn-secondary w-full md:w-1/2 justify-center responsive-message mb-2 md:mb-0 md:mr-2" on:click={onSignIn}> Sign In with Slack </button>
        <button class="btn btn-outline w-full md:w-1/2 justify-center responsive-message" on:click={click}> Cancel </button>
    </svelte:fragment>
</PopUpContainer>

<style>
    @media (max-width: 768px) {
        .responsive-message {
            scale: 1.2;
        }
    }
</style>
