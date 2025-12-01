<script lang="ts">
    import { fly } from "svelte/transition";
    import { showRegisterMapModalStore } from "../../Stores/ModalStore";
    import { localUserStore } from "../../Connection/LocalUserStore";
    import ButtonClose from "../Input/ButtonClose.svelte";

    let mapUrlInput = "";
    let isSubmitting = false;
    let message = "";
    let isError = false;

    function close() {
        showRegisterMapModalStore.set(false);
        mapUrlInput = "";
        message = "";
        isError = false;
    }

    function onKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            close();
        }
    }

    function getAuthToken(): string | null {
        return localUserStore.getAuthToken();
    }

    async function registerMap() {
        const authToken = getAuthToken();
        if (!authToken) {
            message = "You must be logged in to register a map. Please log in first.";
            isError = true;
            return;
        }

        const mapUrl = mapUrlInput.trim();
        if (!mapUrl) {
            message = "Please enter a map URL";
            isError = true;
            return;
        }

        isSubmitting = true;
        message = "";

        try {
            const response = await fetch("/map/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    mapUrl: mapUrl,
                    authToken: authToken,
                }),
            });

            let data: { error?: string; success?: boolean };
            try {
                data = await response.json();
            } catch {
                data = { error: `Server error (${response.status})` };
            }

            if (response.ok && data.success) {
                message =
                    "Map registered successfully! After a few days of review you will be updated (by slack DM)    ";
                isError = false;
                // eslint-disable-next-line require-atomic-updates
                mapUrlInput = "";
            } else {
                message = data.error || `Failed to register map (${response.status})`;
                isError = true;
            }
        } catch (error) {
            console.error("Error registering map:", error);
            message = error instanceof Error ? error.message : "Network error. Please try again.";
            isError = true;
        } finally {
            isSubmitting = false;
        }
    }
</script>

<svelte:window on:keydown={onKeyDown} />

{#if $showRegisterMapModalStore}
    <div
        class="fixed inset-0 z-[500] flex items-center justify-center bg-black/50"
        on:click={close}
        on:keydown={onKeyDown}
        role="button"
        tabindex="0"
        transition:fly={{ y: -200, duration: 300 }}
    >
        <div
            class="relative w-full max-w-lg rounded-lg bg-dark-purple p-6 shadow-xl"
            on:click|stopPropagation
            on:keydown|stopPropagation
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-map-title"
        >
            <div class="absolute right-4 top-4">
                <ButtonClose on:click={close} />
            </div>

            <h2 id="register-map-title" class="mb-2 text-left text-2xl font-bold text-white">upload a custom house</h2>
            <p class="mb-6 text-left text-sm text-gray-400">Link your custom Tiled map to your FlavorTown house</p>

            <div class="mb-6 rounded-lg bg-light-purple/20 p-4">
                <h3 class="mb-2 text-sm font-semibold text-white">How?</h3>
                <ul class="list-inside list-disc space-y-1 text-sm text-gray-300">
                    <li>
                        Fork the <a href="https://github.com/hackclub/flavormap" class="text-white hover:underline"
                            >map repo</a
                        >
                    </li>
                    <li>Edit your house with Tiled</li>
                    <li>Host on GitHub pages</li>
                    <li>Submit, await approval</li>
                </ul>
            </div>
            <p class="mb-4 text-sm">
                <a
                    href="https://github.com/hackclub/flavormap#how-to-make-your-own-house--edit-a-map"
                    class="font-bold text-white hover:underline">Detailed instructions here</a
                >
            </p>
            <div class="flex flex-col gap-4">
                <label class="text-white">
                    <span class="mb-2 block text-sm font-medium">Map URL:</span>
                    <input
                        type="text"
                        bind:value={mapUrlInput}
                        class="w-full rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-light-purple focus:outline-none"
                        placeholder="orpheus.github.io/flavormap/office.tmj"
                        on:keydown={(e) => e.key === "Enter" && !isSubmitting && registerMap()}
                    />
                </label>

                <button
                    class="rounded-lg bg-green-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                    on:click={registerMap}
                    disabled={isSubmitting || !mapUrlInput.trim()}
                >
                    {isSubmitting ? "Registering..." : "Register Map"}
                </button>

                {#if message}
                    <div
                        class="rounded-lg p-3 text-center text-sm {isError
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-green-500/20 text-green-400'}"
                    >
                        {#if isError && message.toLowerCase().includes("invalid payload")}
                            Hmm... That isn't the kind of GitHub Pages URL we expected.
                        {:else if isError}
                            Uh Oh.. An error occured. Tell @euanripper about: {message}
                        {:else}
                            {message}
                        {/if}
                    </div>
                {/if}

                <button
                    class="rounded-lg bg-gray-700 px-6 py-3 text-white transition-colors hover:bg-gray-600"
                    on:click={close}
                >
                    Cancel
                </button>
            </div>
        </div>
    </div>
{/if}
