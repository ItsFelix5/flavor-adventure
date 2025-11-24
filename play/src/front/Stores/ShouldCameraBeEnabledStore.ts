import { derived } from "svelte/store";
import { inJitsiStore, availabilityStatusStore, enableCameraSceneVisibilityStore, batchGetUserMediaStore, cameraEnergySavingStore, cameraAllowedByContextStore } from "./MediaStore";
import { videoStreamElementsStore, screenShareStreamElementsStore } from "./PeerStore";
import { scriptingVideoStore } from "./ScriptingVideoStore";

export const shouldCameraBeEnabledStore = derived(
    [
        inJitsiStore,
        videoStreamElementsStore,
        screenShareStreamElementsStore,
        scriptingVideoStore,
        availabilityStatusStore,
        enableCameraSceneVisibilityStore,
        batchGetUserMediaStore,
        cameraEnergySavingStore,
    ],
    ([
        $inJitsiStore,
        $videoStreamElementsStore,
        $screenShareStreamElementsStore,
        $scriptingVideoStore,
        $availabilityStatusStore,
        $enableCameraSceneVisibilityStore,
        $batchGetUserMediaStore,
        $cameraEnergySavingStore,
    ]) => {
        // If we are in Jitsi, we probably want the camera (if enabled in Jitsi)
        if ($inJitsiStore) return true;

        // If we are setting up the camera, we want the camera enabled
        if ($enableCameraSceneVisibilityStore) return true;

        // If batch update, we might want to keep state or wait. Assuming keep true/false based on other conditions
        if ($batchGetUserMediaStore) return false; // Or just don't block it here, but MediaStore handles batch.

        // If energy saving is ON, we don't want camera (unless previewing)
        if ($cameraEnergySavingStore) return false;

        // If we are connected to someone (video/screen share/scripting)
        if (
            $videoStreamElementsStore.length > 0 ||
            $screenShareStreamElementsStore.length > 0 ||
            $scriptingVideoStore.size > 0
        ) {
            return true;
        }

        // If we are not in Jitsi and not connected to anyone, check if we are somehow in a "meeting" status?
        // But user said "when they are just walking around".
        // If they are walking around, availabilityStatus is ONLINE.

        return false;
    }
);

// Subscribe to the store to update the cameraAllowedByContextStore
// This is necessary to break circular dependencies between MediaStore and ShouldCameraBeEnabledStore
// eslint-disable-next-line svelte/no-ignored-unsubscribe
shouldCameraBeEnabledStore.subscribe((shouldBeEnabled) => {
    cameraAllowedByContextStore.set(shouldBeEnabled);
});
