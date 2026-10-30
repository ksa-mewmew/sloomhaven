import type { Battle } from "./types";
import type { Run } from "./campaign";
export function battleSummary(s: Battle) {
    const damage = s.log.filter((e) => e.event === "attack_resolved" || e.event === "direct_resolved");
    const playerHeals = s.log.filter((e) => e.event === "heal_resolved" && e.actorId === "player");
    const enemies = s.enemies.map((u) => {
        const intents = s.log.filter((e) => e.event === "intent" && e.actorId === u.id);
        const hits = damage.filter((e) => e.event === "attack_resolved" && e.actorId === u.id);
        return {
            id: u.id,
            archetype: u.archetype,
            intents: Object.fromEntries([...new Set(intents.map((e) => String(e.intentId)))].map((id) => [
                id,
                {
                    count: intents.filter((e) => e.intentId === id).length,
                    ratio: intents.filter((e) => e.intentId === id).length /
                        Math.max(1, intents.length),
                },
            ])),
            pureDefense: intents.filter((e) => e.pureDefense).length,
            attackAttempts: s.log.filter((e) => e.event === "enemy_attack_attempt" && e.actorId === u.id).length,
            validHits: hits.length,
            misses: s.log.filter((e) => e.event === "miss" && e.actorId === u.id)
                .length,
            friendlyFire: hits.filter((e) => e.targetId !== "player").length,
            hpDamage: hits.reduce((n, e) => n + Number(e.actualHpDamage ?? 0), 0),
            exposedDamageTaken: damage
                .filter((e) => e.targetId === u.id)
                .reduce((n, e) => n + Number(e.exposedHpDamage ?? 0), 0),
            diedTurn: s.stats["death_" + u.id] ?? null,
            poisonDamage: damage
                .filter((e) => e.kind === "poison" && e.targetId === u.id)
                .reduce((n, e) => n + Number(e.actualHpDamage ?? 0), 0),
        };
    });
    return {
        scenario: s.scenario,
        variant: s.variant,
        seed: s.seed,
        result: s.phase,
        turns: s.turn,
        elapsedSeconds: s.elapsedSeconds ?? null,
        inputCount: s.stats.input_count ?? s.commands.length,
        startHp: s.startHp,
        endHp: s.player.hp,
        hpLost: damage
            .filter((e) => e.targetId === "player")
            .reduce((n, e) => n + Number(e.actualHpDamage ?? 0), 0),
        healed: playerHeals.reduce((n, e) => n + Number(e.amount ?? 0), 0),
        blockAtTurnEnd: s.log
            .filter((e) => e.event === "turn_end")
            .map((e) => ({ turn: e.turn, block: Number(e.blockRemaining ?? 0) })),
        healingOnlyTurns: s.stats.heal_only_turns ?? 0,
        lastEnemyHealingTurns: new Set(playerHeals
            .filter((e) => Number(e.amount) > 0 && e.enemiesRemaining === 1)
            .map((e) => e.turn)).size,
        cards: Object.fromEntries(Object.entries(s.stats).filter(([k]) => k.startsWith("card_"))),
        C08: {
            printedTopUses: s.stats.card_C08_top_printed ?? 0,
            basicTopUses: s.stats.card_C08_top_basic ?? 0,
            basicReplacementRate: (s.stats.card_C08_top_basic ?? 0) /
                Math.max(1, (s.stats.card_C08_top_basic ?? 0) +
                    (s.stats.card_C08_top_printed ?? 0)),
            targets: s.stats.C08_targets ?? 0,
            hpDamage: s.stats.C08_hp_damage ?? 0,
            printedDamage: s.stats.C08_printed_sum ?? 0,
            targetDistribution: s.log
                .filter((e) => e.event === "area_attack" && e.cardId === "C08")
                .map((e) => e.targetCount),
        },
        C19: {
            targets: s.stats.C19_targets ?? 0,
            hpDamage: s.stats.C19_hp_damage ?? 0,
        },
        rests: s.stats.rest ?? 0,
        losses: {
            printed: s.stats.loss_printed ?? 0,
            rest: s.stats.loss_rest ?? 0,
            damage: s.stats.loss_damage ?? 0,
        },
        preventedHits: s.stats.prevented ?? 0,
        rngCount: s.rngCount,
        enemies,
    };
}
export function runSummary(r: Omit<Run, "contentVersion" | "stage" | "rewards" | "gold" | "items" | "equippedItems" | "stock" | "shopsTaken"> & {
    stage: string;
}) {
    const battles = r.reports.map(battleSummary);
    const rewardHealing = r.history
        .filter((e) => (e.reward as {
        kind?: string;
    } | undefined)?.kind === "heal")
        .reduce((n, e) => n + Number(e.healed ?? 0), 0);
    return {
        version: "0.2",
        seed: r.seed,
        result: r.stage,
        reached: Math.min(10, r.completed.length + 1),
        completed: r.completed.length,
        battles,
        hpLost: battles.reduce((n, b) => n + b.hpLost, 0),
        combatHealing: battles.reduce((n, b) => n + b.healed, 0),
        rewardHealing,
        healthGrowth: r.history.reduce((n, e) => n + Number(e.healthGrowth ?? 0), 0),
        healed: battles.reduce((n, b) => n + b.healed, 0) + rewardHealing,
        choices: r.history,
        deck: r.equipped,
        owned: r.owned,
        upgrades: r.upgrades,
        relics: r.relics,
        breaks: r.breaksTaken,
    };
}
