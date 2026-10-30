import modes from "../content/encounter-modes.phase1.json";
import mail from "../content/mail-carrier.proposal.json";
import { archetypes, boards, cards, content } from "./data";
import type { CharacterId, EncounterModeConfig, PartyMode, Card } from "./types";
export const characterRegistry = {
    wanderer: {
        id: "wanderer" as CharacterId, name: "방문자", playable: true, initialHp: 20, maxHp: 20,
        starterCardIds: content.character.initialEquippedCards,
        rewardCardIds: Object.values(cards).filter(c => c.pool === "reward").map(c => c.id),
        cards: Object.values(cards),
    },
    mail_carrier: {
        ...mail, id: "mail_carrier" as CharacterId, playable: false,
        rewardCardIds: mail.cards.filter(c => c.pool === "reward").map(c => c.id),
        cards: mail.cards as Card[],
    },
};
export function encounterModeConfig(scenario: string, variant: string, mode: PartyMode): EncounterModeConfig {
    const e = modes.encounters.find(e => e.scenarioId === scenario);
    const placements = e?.variants as Record<string, { solo: EncounterModeConfig["enemies"]; duo: EncounterModeConfig["enemies"] }> | undefined;
    const enemies = placements?.[variant.split("-")[1]]?.[mode];
    if (!e || !enemies) throw Error("존재하지 않는 모드 배치");
    return { boardId: e.boardId, playerStartNodes: [...e.starts[mode]], enemies: structuredClone(enemies) };
}
export function validateFoundation() {
    const check = (v: unknown, message: string) => { if (!v) throw Error("기반 데이터 오류: " + message); };
    check(modes.encounters.length === 10 && !modes.duoPlayable, "솔로 전용");
    let variants = 0;
    for (const e of modes.encounters) for (const key of Object.keys(e.variants)) {
        variants++;
        for (const mode of ["solo", "duo"] as const) {
            const c = encounterModeConfig(e.scenarioId, e.scenarioId + "-" + key, mode), b = boards[c.boardId];
            check(b && c.playerStartNodes.length === (mode === "solo" ? 1 : 2), "시작 위치");
            const occupied = [...c.playerStartNodes, ...c.enemies.map(e => e.node)];
            check(new Set(occupied).size === occupied.length && occupied.every(n => b.nodes.some(x => x.id === n)), e.scenarioId + " 점유");
            check(new Set(c.enemies.map(e => e.id)).size === c.enemies.length && c.enemies.every(e => archetypes[e.archetype]), "적 정의");
            if (e.objective === "kill_target") check(c.enemies.some(x => x.id === "e1"), "목표 적");
        }
    }
    check(variants === 18, "A/B 18개");
    const all = Object.values(characterRegistry).flatMap(c => c.cards.map(x => x.id));
    check(new Set(all).size === all.length && mail.cards.length === 14 && mail.starterCardIds.length === 8, "캐릭터 카드 ID");
    for (const c of Object.values(characterRegistry)) {
        check(c.initialHp === 20 && c.maxHp === 20 && c.starterCardIds.every(id => c.cards.some(x => x.id === id)), "캐릭터 시작값");
        for (const card of c.cards) for (const face of [card.top, card.bottom])
            check(face.steps.length && face.steps.every(s => ["attack", "move", "block", "status", "push", "heal", "self_hp_loss", "retain_block", "counter"].includes(s.type)), "카드 효과 정의");
    }
    return true;
}
