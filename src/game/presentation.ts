import proposal from "./enemy-actions.v0.3.1.proposal.json";
import skin from "../content/presentation.ko.v0.3.json";
export const flavor = skin;
export const presentation = {
    ...skin,
    workingTitle: skin.story.title,
    opening: skin.story.opening,
    scenarios: Object.fromEntries(Object.entries(skin.scenarios).map(([id, s]) => [
        id,
        { ...s, displayName: s.name, boardMood: s.designNote },
    ])),
    enemies: Object.fromEntries(Object.entries(skin.enemies).map(([id, e]) => [
        id,
        {
            ...e,
            displayName: e.name,
            portraitLines: [] as string[],
            portraitAlt: e.name,
            intentLabels: e.intents as Record<string, string>,
        },
    ])),
};
const newIntentLabels: Record<string, Record<string, string>> = {
    grunt: { shard_cut: "파편 긋기" },
    harrier: { trip: "발목 걸기" },
    clockmaker: { late: "늦었다는 재촉" },
    arbiter: { order: "손을 비우라는 명령" },
};
const rawEnemyFlavor = (id: string) => (skin.enemies as Record<string, {
    name: string;
    location: string;
    flavor: string;
    encounter: string;
    intents: Record<string, string>;
    portrait?: string[];
}>)[id];
export const enemyFlavor = (id: string) => {
    const e = rawEnemyFlavor(id);
    return e
        ? {
            ...e,
            intents: {
                ...e.intents,
                ...newIntentLabels[id],
                ...Object.fromEntries(((proposal.enemies as unknown as Record<string, {
                    id: string;
                    previewLabel: string;
                }[]>)[id] ?? []).map((p) => [p.id, p.previewLabel])),
            },
        }
        : undefined;
};
export const cardFlavor = (id: string) => (skin.cards as Record<string, {
    name: string;
    flavor: string;
}>)[id]
    ?.flavor ?? "";
export const relicFlavor = (_id: string) => "";
export const variantFlavor = (id: string) => (skin.variants as Record<string, string>)[id] ?? "";
export function logText(s: import("./types").Battle, entry: import("./types").Battle["log"][number]): string {
    const unit = s.enemies.find((e) => e.id === entry.actorId);
    if (entry.event === "intent" && unit) {
        const e = enemyFlavor(unit.archetype!);
        return `${e?.name ?? unit.id}: ${e?.intents[String(entry.intentId)] ?? entry.intentId}`;
    }
    if (entry.event === "rest")
        return `${skin.messages.rest} ${entry.detail}`;
    if (entry.event.startsWith("loss_"))
        return `${skin.messages.cardLoss} ${entry.detail}`;
    if (entry.event === "prevented")
        return skin.messages.damageCanceled;
    if (entry.event === "result")
        return `${s.phase === "victory" ? skin.messages.battleWon : skin.messages.battleLost} ${entry.detail}`;
    return entry.detail.replace(/\bplayer\b/g, skin.classes.visitor.name);
}
