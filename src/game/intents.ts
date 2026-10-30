import type { IntentStep } from "./types";
export function intentSteps(i?: IntentStep): IntentStep[] {
    return !i
        ? []
        : i.kind === "sequence"
            ? (i.steps ?? []).flatMap(intentSteps)
            : [i];
}
export function isAttackIntent(i?: IntentStep) {
    return intentSteps(i).some((s) => s.kind === "attack" || s.kind === "adjacent_all" || s.kind === "marked");
}
