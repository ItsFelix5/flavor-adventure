<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { UserInputManager } from "../../Phaser/UserInput/UserInputManager";

    export let onSignIn: () => void;
    export let userInputManager: UserInputManager;

    onMount(() => {
        userInputManager.addSpaceEventListener(onSignIn);
    });

    onDestroy(() => {
        userInputManager.removeSpaceEventListener(onSignIn);
    });
</script>
