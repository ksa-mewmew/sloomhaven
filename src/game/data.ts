import raw from "../content/game_content.v0.3.json";
import proposal from "./enemy-actions.v0.3.1.proposal.json";
import { presentation as skin } from "./presentation";
import type { Card, Board, Archetype, Encounter } from "./types";
import { intentSteps } from "./intents";
export const AI_PROPOSAL = proposal;
export const content = {
    ...raw,
    enemyArchetypes: raw.enemyArchetypes.map(({ preTurnMove: _removed, ...enemy }) => ({
        ...enemy,
        intents: (proposal.enemies as unknown as Record<string, Archetype["intents"]>)[enemy.id],
    })),
};
export const presentation = skin;
export const cards = Object.fromEntries((raw.cards as Card[]).map((x) => [x.id, x]));
export const boards = Object.fromEntries((raw.boards as Board[]).map((x) => [x.id, x]));
export const archetypes = Object.fromEntries((content.enemyArchetypes as Archetype[]).map((x) => [x.id, x]));
export const encounters = Object.fromEntries((raw.encounters as Encounter[]).map((x) => [x.id, x]));
export function validateContent() {
    const assert = (v: unknown, m: string) => {
        if (!v)
            throw Error("데이터 오류: " + m);
    };
    for (const [name, list] of Object.entries({
        cards: raw.cards,
        boards: raw.boards,
        enemies: raw.enemyArchetypes,
        encounters: raw.encounters,
        relics: raw.relics,
    }))
        assert(new Set(list.map((x) => x.id)).size === list.length, name + " 중복 ID");
    for (const b of Object.values(boards)) {
        const ids = b.nodes.map((n) => n.id);
        assert(new Set(ids).size === ids.length, b.id);
        const reached = new Set([ids[0]]);
        for (let k = 0; k < ids.length; k++)
            for (const [a, c] of b.edges) {
                assert(ids.includes(a) && ids.includes(c) && a !== c, b.id + " 간선");
                if (reached.has(a))
                    reached.add(c);
                if (reached.has(c))
                    reached.add(a);
            }
        assert(reached.size === ids.length, b.id + " 연결");
    }
    const types = [
        "attack",
        "move",
        "block",
        "status",
        "push",
        "heal",
        "self_hp_loss",
        "retain_block",
        "counter",
    ];
    for (const c of Object.values(cards))
        for (const f of [c.top, c.bottom]) {
            assert(typeof f.loss === "boolean" && f.steps.length, c.id);
            for (const s of f.steps) {
                assert(types.includes(s.type), c.id + " 효과");
                if (s.range !== undefined)
                    assert(s.range === "any" || (Number.isInteger(s.range) && s.range > 0), c.id + " 사거리");
                if (s.type === "status")
                    assert(["poison", "weak", "exposed", "disarm", "bind", "bleed"].includes(s.status!) && (s.stacks ?? 0) > 0, c.id + " 상태");
                for (const key of ["damage", "amount", "distance", "stacks"] as const)
                    if (s[key] !== undefined)
                        assert(Number.isInteger(s[key]) && s[key]! >= 0, c.id + " 수치");
            }
        }
    for (const e of Object.values(archetypes)) {
        assert(e.hp > 0 && e.intents.length, e.id);
        assert(new Set(e.intents.map((i) => i.id)).size === e.intents.length, e.id + " 의도 ID");
        for (const i of e.intents)
            assert(i.weight > 0 &&
                Number.isInteger(i.weight) &&
                [
                    "adjacent_all",
                    "marked",
                    "block",
                    "heal",
                    "buff_attack",
                    "sequence",
                    "attack",
                    "move",
                    "push",
                    "pull",
                    "status",
                ].includes(i.kind), e.id + " 의도");
        for (const i of e.intents) {
            const steps = intentSteps(i);
            assert(steps.length > 0, e.id + " 빈 의도");
            for (const step of steps) {
                assert([
                    "adjacent_all",
                    "marked",
                    "attack",
                    "move",
                    "push",
                    "pull",
                    "status",
                    "block",
                    "heal",
                    "buff_attack",
                ].includes(step.kind), e.id + " 시퀀스 단계");
                if (step.kind === "move")
                    assert(["approach", "retreat", "maintain_range"].includes(step.mode ?? "") &&
                        Number.isInteger(step.maxSteps) &&
                        step.maxSteps! >= 0 &&
                        (step.mode !== "maintain_range" ||
                            (Number.isInteger(step.preferredRange) &&
                                step.preferredRange! > 0)), e.id + " 이동 명령");
                if (["attack", "marked", "adjacent_all"].includes(step.kind))
                    assert(Number.isInteger(step.damage) &&
                        step.damage! >= 0 &&
                        (step.range === undefined ||
                            (Number.isInteger(step.range) && step.range > 0)), e.id + " 공격 수치");
                if (step.kind === "push" || step.kind === "pull")
                    assert(Number.isInteger(step.distance) && step.distance! >= 0, e.id + " 강제 이동 거리");
                if (step.status)
                    assert(["exposed", "weak", "poison", "disarm", "bind", "bleed"].includes(step.status.status) &&
                        Number.isInteger(step.status.stacks) &&
                        step.status.stacks > 0, e.id + " 상태이상");
            }
        }
    }
    for (const s of Object.values(encounters)) {
        assert(boards[s.board], s.id + " 전장");
        const nodes = [s.playerStart, ...s.enemies.map((e) => e.node)];
        assert(new Set(nodes).size === nodes.length, s.id + " 점유");
        assert(nodes.every((n) => boards[s.board].nodes.some((x) => x.id === n)), s.id + " 위치");
        assert(s.enemies.every((e) => archetypes[e.archetype]), s.id + " 적");
        assert(new Set(s.enemies.map((e) => e.id)).size === s.enemies.length, s.id + " 적 ID");
        if (s.objective === "kill_target")
            assert(s.enemies.some((e) => e.id === s.targetEnemyId), s.id + " 표적");
        assert(s.variants.length > 0, s.id + " 변형 없음");
        assert(JSON.stringify(s.enemies) === JSON.stringify(s.variants[0].enemies), s.id + " A 호환 배치 불일치");
        for (const v of s.variants) {
            const positions = [s.playerStart, ...v.enemies.map((e) => e.node)];
            assert(new Set(positions).size === positions.length, s.id + "/" + v.id + " 점유 중복");
            assert(positions.every((n) => boards[s.board].nodes.some((x) => x.id === n)), s.id + "/" + v.id + " 잘못된 위치");
            assert(v.enemies.every((e) => archetypes[e.archetype]), s.id + " 적 참조");
            assert(new Set(v.enemies.map((e) => e.id)).size === v.enemies.length, v.id + " 적 ID 중복");
            if (s.objective === "kill_target")
                assert(v.enemies.some((e) => e.id === s.targetEnemyId), v.id + " 표적 누락");
        }
    }
    assert(raw.character.initialEquippedCards.length === raw.character.deckCapacity, "덱 용량");
    assert(raw.character.initialOwnedCards.every((id) => cards[id]), "보유 카드");
    assert(new Set(raw.character.initialOwnedCards).size ===
        raw.character.initialOwnedCards.length, "보유 중복");
    assert(new Set(raw.character.initialEquippedCards).size ===
        raw.character.initialEquippedCards.length &&
        raw.character.initialEquippedCards.every((id) => raw.character.initialOwnedCards.includes(id)), "출전 덱 참조");
    assert(raw.run.stages.length === raw.run.totalBattles &&
        raw.run.stages.every((s, i) => s.stage === i + 1 && encounters[s.encounter]), "런 슬롯");
    return true;
}
