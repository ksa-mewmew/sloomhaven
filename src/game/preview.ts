import { projectEnemyPhase } from "./engine";
import { playerTargets } from "./board";
import { calculateHit } from "./combat";
import { archetypes } from "./data";
import { intentSteps, isAttackIntent } from "./intents";
import type { Battle, Unit, Step } from "./types";
export function simulateIntentPreview(s: Battle, source: Unit) {
    const projected = projectEnemyPhase(s, [source.id]);
    const attacks = projected.log
        .filter((l) => l.event === "attack" && l.actorId === source.id)
        .map((l) => ({
        id: String(l.targetId),
        stepIndex: l.stepIndex,
        hits: [
            {
                damage: Number(l.damage),
                blocked: Number(l.blocked),
                hp: Number(l.hp),
            },
        ],
    }));
    const steps = intentSteps(source.intent).map((step, index) => {
        const move = projected.log.find((l) => l.event === "enemy_move" &&
            l.actorId === source.id &&
            l.stepIndex === index);
        const start = projected.log.find((l) => l.event === "enemy_step" &&
            l.actorId === source.id &&
            l.stepIndex === index);
        const attempted = projected.log.find((l) => ["enemy_attack_attempt", "enemy_status_attempt"].includes(l.event) &&
            l.actorId === source.id &&
            l.stepIndex === index);
        const cancelled = projected.log.find((l) => ["disarm_skip", "bind_consumed", "followup_skipped"].includes(l.event) &&
            l.actorId === source.id &&
            l.stepIndex === index);
        return {
            index,
            step,
            start: String(start?.startNode ?? source.node),
            end: String(move?.end ?? start?.startNode ?? source.node),
            path: (move?.path ?? []) as string[],
            reason: cancelled?.event ?? move?.reason,
            threats: (attempted?.threatNodes ?? []) as string[],
            hits: attacks.filter((a) => a.stepIndex === index).flatMap((a) => a.hits),
            executed: !!start,
        };
    });
    return {
        state: projected,
        steps,
        threats: [...new Set(steps.flatMap((x) => x.threats))],
        attacks,
    };
}
export function attackPreview(s: Battle, source: Unit) {
    const projected = simulateIntentPreview(s, source);
    const grouped = new Map<string, {
        id: string;
        hits: {
            damage: number;
            blocked: number;
            hp: number;
        }[];
    }>();
    for (const a of projected.attacks) {
        const row = grouped.get(a.id) ?? { id: a.id, hits: [] };
        row.hits.push(...a.hits);
        grouped.set(a.id, row);
    }
    return [...grouped.values()];
}
export function playerAttackPreview(s: Battle, step: Step) {
    if (step.type !== "attack" || s.player.disarm > 0)
        return [];
    const attacker = structuredClone(s.player);
    return playerTargets(s, step)
        .map((id) => s.enemies.find((e) => e.id === id)!)
        .map((target) => {
        const bonus = (step.condition === "gained_block_this_turn" && s.gainedBlock) ||
            ([
                "target_intent_nonattack",
                "target_original_intent_nonattack",
            ].includes(step.condition ?? "") &&
                !isAttackIntent(target.intent))
            ? (step.bonus_damage ?? 0)
            : 0;
        const h = calculateHit(attacker, target, (step.damage ?? 0) + bonus, step.pierce_block);
        const removable = target.archetype && archetypes[target.archetype].unkillable
            ? Math.max(0, target.hp - 1)
            : target.hp;
        return {
            id: target.id,
            node: target.node,
            base: step.damage ?? 0,
            ...h,
            hp: Math.min(removable, h.hp),
        };
    });
}
