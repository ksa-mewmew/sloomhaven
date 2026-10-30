import { itemById, ECONOMY_VERSION } from "./economy";
import { archetypes, cards, content, encounters } from "./data";
import { boardOf, distance, living, neighbors, paths, pushNodes, stepThreats, enemyTargets, playerTargets, } from "./board";
import { planEnemyMove, planForcedMove, nodeOrder } from "./movement";
import { intentSteps, isAttackIntent } from "./intents";
import { random, sample, seedNumber } from "./rng";
import { replaceRecovery, statusKeys, statusNames } from "./status";
import { calculateHit } from "./combat";
import legacyPhase0 from "../content/legacy-phase0.json";
import { PHASE1, LEGACY_RULES, rulesDefaults, type Ruleset } from "./rulesets";
import type { Action, Battle, Command, Side, Step, Task, Unit } from "./types";
export function log(s: Battle, event: string, detail: string, fields: Record<string, unknown> = {}) {
    s.log.push({
        turn: s.turn,
        event,
        detail,
        rng: s.rng,
        rngCount: s.rngCount,
        seed: s.seed,
        ...fields,
    });
    s.stats[event] = (s.stats[event] ?? 0) + 1;
}
function unit(id: string, node: string, hp: number): Unit {
    return {
        id,
        node,
        hp,
        maxHp: hp,
        block: 0,
        poison: 0,
        weak: 0,
        exposed: 0,
        disarm: 0,
        bind: 0,
        bleed: 0,
        buff: 0,
    };
}
export function createBattle(scenario = "S01", seed = "holiday", deck = content.character.initialEquippedCards, hp = content.character.maxHp, maxHp = content.character.maxHp, relics: string[] = [], upgrades: Record<string, Side[]> = {}, variant?: string, economy?: {
    items: string[];
    ruleset?: Ruleset;
    medkits?: number;
}): Battle {
    if (!encounters[scenario] ||
        new Set(deck).size !== deck.length ||
        deck.some((id) => !cards[id]) ||
        deck.length < 2)
        throw Error("잘못된 전투/덱");
    const ruleset = economy?.ruleset ?? rulesDefaults.ruleset;
    const e = economy?.ruleset === LEGACY_RULES ? legacyPhase0.encounters.find(e => e.id === scenario)! : encounters[scenario];
    const chosen = e.variants.find((v) => v.id === (variant ?? e.variants[0].id));
    if (!chosen)
        throw Error("존재하지 않는 전투 변형");
    const s: Battle = {
        version: 3,
        ruleset,
        boardId: e.board,
        partyMode: "solo",
        medkits: economy?.medkits ?? 0,
        contentVersion: "0.3.1-proposal-1",
        scenario,
        variant: chosen.id,
        seed,
        rng: seedNumber(seed),
        rngCount: 0,
        turn: 1,
        phase: "ready",
        player: unit("player", e.playerStart, hp),
        enemies: chosen.enemies.map((x) => ({
            ...unit(x.id, x.node, archetypes[x.archetype].hp),
            archetype: x.archetype,
        })),
        zones: { hand: [...deck], inPlay: [], discard: [], lost: [] },
        deck: [...deck],
        relics: [...relics],
        upgrades: structuredClone(upgrades),
        queue: [],
        rested: false,
        retain: false,
        gainedBlock: false,
        counter: 0,
        counterUsed: false,
        hpLostEnemy: false,
        delayedHeal: 0,
        topDone: false,
        relicMoved: false,
        firstLoss: false,
        log: [],
        commands: [],
        stats: { start_hp: hp },
        startHp: hp,
    };
    if (economy) {
        s.contentVersion = ECONOMY_VERSION;
        s.economy = {
            items: [...economy.items],
            used: [],
            moveBonus: 0,
            startPending: [
                ...(relics.includes("R01") ? ["tile" as const] : []),
                ...(relics.includes("R06") ? ["enemy" as const] : []),
            ],
            r05: false,
            r08: false,
            pauseFaces: false,
        };
    }
    s.player.maxHp = maxHp;
    prepare(s);
    return s;
}
function getUnit(s: Battle, id: string) {
    return id === "player" ? s.player : s.enemies.find((e) => e.id === id)!;
}
function heal(s: Battle, u: Unit, n: number) {
    if (u.hp <= 0)
        return;
    if (replaceRecovery(u, n, "heal")) {
        log(s, "bleed_removed", `${u.id}: 치료 효과를 소모해 출혈 제거`, {
            actorId: u.id,
            replacement: "heal",
        });
        return;
    }
    const actual = Math.min(n, u.maxHp - u.hp);
    u.hp += actual;
    log(s, "heal_resolved", "회복", {
        actorId: u.id,
        amount: actual,
        enemiesRemaining: living(s).length,
    });
    if (u.id === "player") {
        s.stats.turn_healed = (s.stats.turn_healed ?? 0) + actual;
        if (actual > 0 && living(s).length === 1)
            s.stats.heal_last_enemy_turns = (s.stats.heal_last_enemy_turns ?? 0) + 1;
    }
    if (u.id === "player")
        s.stats.healing_amount = (s.stats.healing_amount ?? 0) + actual;
    log(s, "heal", `${u.id} +${actual}`);
}
function lose(s: Battle, ids: string[], zone: "hand" | "discard" | "inPlay", reason: string) {
    for (const id of ids) {
        s.zones[zone].splice(s.zones[zone].indexOf(id), 1);
        s.zones.lost.push(id);
        log(s, "loss_" + reason, id);
        if (!s.firstLoss) {
            s.firstLoss = true;
            if (!s.economy && s.relics.includes("R03"))
                heal(s, s.player, 3);
        }
    }
}
function direct(s: Battle, u: Unit, n: number, ignoreBlock = false, kind = "collision") {
    const before = u.hp;
    const absorbed = ignoreBlock ? 0 : Math.min(u.block, n);
    u.block -= absorbed;
    u.hp -= n - absorbed;
    if (u.archetype && archetypes[u.archetype].unkillable)
        u.hp = Math.max(1, u.hp);
    log(s, "direct", `${u.id} HP -${n - absorbed}`);
    log(s, "direct_resolved", kind, {
        targetId: u.id,
        actualHpDamage: before - Math.max(0, u.hp),
        kind,
    });
    check(s);
}
function check(s: Battle) {
    for (const e of s.enemies) {
        if (e.hp <= 0 && !s.stats["death_" + e.id]) {
            s.stats["death_" + e.id] = s.turn;
            log(s, "enemy_died", e.id, { actorId: e.id });
        }
        if (e.archetype) {
            const a = archetypes[e.archetype];
            if (a.phase2AtHp && e.hp > 0 && e.hp <= a.phase2AtHp && !e.phase2) {
                e.phase2 = true;
                e.buff += a.phase2AttackBonus ?? 0;
                log(s, "boss_phase", "2단계: 공격 +1");
            }
        }
    }
    if (s.phase === "victory" || s.phase === "defeat")
        return true;
    if (s.player.hp <= 0) {
        s.phase = "defeat";
        s.reason = "체력 소진";
    }
    else {
        const e = encounters[s.scenario];
        if (!living(s).length ||
            (e.objective === "kill_target" &&
                s.enemies.find((x) => x.id === e.targetEnemyId)!.hp <= 0)) {
            s.phase = "victory";
            s.reason = "사건 종결";
        }
    }
    if (s.phase === "victory" || s.phase === "defeat") {
        for (const t of s.queue)
            if (t.kind === "finish" && s.zones.inPlay.includes(t.action.card)) {
                if (t.loss)
                    lose(s, [t.action.card], "inPlay", "printed");
                else {
                    s.zones.inPlay.splice(s.zones.inPlay.indexOf(t.action.card), 1);
                    s.zones.discard.push(t.action.card);
                }
            }
        s.queue = [];
        delete s.prompt;
        log(s, "result", s.reason!);
        return true;
    }
    return false;
}
function prepare(s: Battle) {
    s.phase = "ready";
    if (s.economy)
        s.economy.pauseFaces = false;
    s.rested = false;
    s.gainedBlock = false;
    s.counter = 0;
    s.counterUsed = false;
    s.hpLostEnemy = false;
    s.delayedHeal = 0;
    s.topDone = false;
    s.stats.turn_attack_attempts = 0;
    s.stats.turn_healed = 0;
    s.lastTarget = undefined;
    for (const e of living(s).sort((a, b) => nodeOrder(a.id, b.id))) {
        const a = archetypes[e.archetype!];
        let r = random(s) * a.intents.reduce((n, i) => n + i.weight, 0);
        e.intent = structuredClone(a.intents.find((i) => (r -= i.weight) < 0) ?? a.intents.at(-1)!);
        e.marks = intentSteps(e.intent).map((step) => step.kind === "marked" ? s.player.node : null);
        e.mark = e.marks.find(Boolean) ?? undefined;
        log(s, "intent", `${e.id}: ${e.intent.id}${e.mark ? " @" + e.mark : ""}`, {
            actorId: e.id,
            intentId: e.intent.id,
            pureDefense: !isAttackIntent(e.intent),
        });
    }
    if (s.zones.hand.length < 2 && s.zones.discard.length < 2) {
        s.phase = "defeat";
        s.reason = "카드 탈진";
        log(s, "result", s.reason);
    }
}
function condition(s: Battle, c?: string, target?: Unit) {
    switch (c) {
        case "gained_block_this_turn":
            return s.gainedBlock;
        case "no_adjacent_enemies_after_move":
            return !living(s).some((e) => distance(boardOf(s), s.player.node, e.node) === 1);
        case "adjacent_enemy_after_move":
            return living(s).some((e) => distance(boardOf(s), s.player.node, e.node) === 1);
        case "no_hp_loss_during_enemy_phase":
            return !s.hpLostEnemy;
        case "target_original_intent_nonattack":
        case "target_intent_nonattack":
            return target?.intent && !isAttackIntent(target.intent);
        default:
            return true;
    }
}
export function validTargets(s: Battle, step: Step) {
    if (step.target === "last_attack_target")
        return living(s)
            .filter((e) => e.id === s.lastTarget)
            .map((e) => e.id);
    return playerTargets(s, step);
}
function status(s: Battle, u: Unit, st: {
    status: import("./types").Status;
    stacks: number;
}) {
    u[st.status] += st.stacks;
    log(s, "status", `${u.id} ${statusNames[st.status]} +${st.stacks}`, {
        targetId: u.id,
        status: st.status,
        stacks: st.stacks,
    });
}
function hit(s: Battle, t: Extract<Task, {
    kind: "hit";
}>) {
    if (t.source !== "player" && t.target !== "player")
        return;
    const a = getUnit(s, t.source), u = getUnit(s, t.target);
    if (a.hp <= 0 || u.hp <= 0 || a.disarm > 0)
        return;
    const beforeHp = u.hp;
    if (a.id !== "player")
        a.lastHitTarget = u.id;
    if (a.id === "player")
        s.stats.turn_attack_attempts = (s.stats.turn_attack_attempts ?? 0) + 1;
    if (t.cardId && !t.basic) {
        s.stats[`${t.cardId}_targets`] = (s.stats[`${t.cardId}_targets`] ?? 0) + 1;
        s.stats[`${t.cardId}_printed_sum`] =
            (s.stats[`${t.cardId}_printed_sum`] ?? 0) + t.damage;
    }
    const result = calculateHit(a, u, t.damage, t.pierce);
    const exposedHpDamage = Math.max(0, Math.min(beforeHp, result.hp) -
        Math.min(beforeHp, calculateHit(a, { ...u, exposed: 0 }, t.damage, t.pierce).hp));
    a.weak = result.weak;
    u.exposed = result.exposed;
    u.block = result.block;
    const n = result.hp, blocked = result.blocked;
    log(s, "attack", `${a.id} → ${u.id}: HP ${n}, 방어 흡수 ${blocked}`, {
        actorId: a.id,
        targetId: u.id,
        damage: result.damage,
        blocked,
        hp: n,
        stepIndex: t.stepIndex,
    });
    if (u.id === "player" && n > 0) {
        s.prompt = {
            kind: "damage",
            damage: n,
            source: a.id,
            status: t.status,
            base: t.damage,
            exposedHpDamage,
        };
        return;
    }
    u.hp -= n;
    if (u.archetype && archetypes[u.archetype].unkillable)
        u.hp = Math.max(1, u.hp);
    if (t.status && u.hp > 0)
        status(s, u, t.status);
    const actualHpDamage = beforeHp - Math.max(0, u.hp);
    log(s, "attack_resolved", "타격 해결", {
        actorId: a.id === "player" ? "wanderer" : a.id,
        targetId: u.id,
        cardId: t.cardId,
        basic: !!t.basic,
        base: t.damage,
        actualHpDamage,
        exposedHpDamage,
    });
    if (t.cardId && !t.basic)
        s.stats[`${t.cardId}_hp_damage`] =
            (s.stats[`${t.cardId}_hp_damage`] ?? 0) + actualHpDamage;
    if (u.id === "player")
        counter(s, a);
    check(s);
}
function counter(s: Battle, a: Unit) {
    if (s.counter &&
        !s.counterUsed &&
        distance(boardOf(s), s.player.node, a.node) === 1) {
        s.counterUsed = true;
        direct(s, a, s.counter, false, "counter");
    }
}
function effect(s: Battle, step: Step, target?: string, path?: string[], skip = false, cardId?: string) {
    const u = target ? getUnit(s, target) : undefined;
    if (skip && step.type !== "self_hp_loss") {
        if (step.type === "attack")
            s.lastTarget = undefined;
        return;
    }
    if (step.type !== "attack" &&
        !step.timing &&
        !condition(s, step.condition, u))
        return;
    switch (step.type) {
        case "attack": {
            s.lastTarget = u?.id;
            const bonus = condition(s, step.condition, u)
                ? (step.bonus_damage ?? 0)
                : 0;
            if (u)
                hit(s, {
                    kind: "hit",
                    source: "player",
                    target: u.id,
                    damage: (step.damage ?? 0) + bonus,
                    pierce: step.pierce_block,
                    cardId,
                    basic: step.basic,
                });
            break;
        }
        case "status":
            if (u)
                status(s, u, { status: step.status!, stacks: step.stacks! });
            break;
        case "move":
            if (path?.length) {
                s.player.node = path.at(-1)!;
                s.stats.move_distance = (s.stats.move_distance ?? 0) + path.length;
                log(s, "move", path.join(" → "));
            }
            break;
        case "push":
        case "pull":
            if (u && u.hp > 0)
                force(s, s.player, u, step.distance ?? 1, step.type);
            break;
        case "block":
            gainBlock(s, s.player, step.amount!);
            break;
        case "heal":
            if (step.timing)
                s.delayedHeal += step.amount!;
            else
                heal(s, s.player, step.amount!);
            break;
        case "self_hp_loss":
            direct(s, s.player, step.amount!, true, "self_cost");
            break;
        case "retain_block":
            s.retain = true;
            log(s, "retain", "전투 종료까지 방어도 보존");
            break;
        case "counter":
            s.counter = step.damage!;
            break;
    }
    check(s);
}
function force(s: Battle, source: Unit, target: Unit, max: number, kind: "push" | "pull") {
    if (s.economy &&
        target.id === "player" &&
        source.id !== "player" &&
        s.economy.items.includes("I09") &&
        !s.economy.used.includes("I09")) {
        s.prompt = { kind: "forceReaction", source: source.id, max, mode: kind };
        return planForcedMove(s, source, target, 0, kind);
    }
    const plan = planForcedMove(s, source, target, max, kind);
    if (plan.path.length)
        target.node = plan.path.at(-1)!;
    if (s.economy &&
        source.id === "player" &&
        target.id !== "player" &&
        plan.path.length &&
        s.relics.includes("R05") &&
        !s.economy.r05) {
        s.economy.r05 = true;
        target.exposed++;
        log(s, "relic_R05", "첫 강제 이동: 노출 1", { targetId: target.id });
    }
    log(s, "forced_move", `${kind === "push" ? "밀치기" : "당기기"}: ${target.id} ${plan.direction} ${plan.path.length}/${max}칸`, { actorId: source.id, targetId: target.id, kind, ...plan });
    if (source.id === "player" && plan.path.length)
        log(s, kind, `${target.id} → ${target.node}`);
    return plan;
}
function gainBlock(s: Battle, u: Unit, amount: number) {
    if (replaceRecovery(u, amount, "block")) {
        log(s, "bleed_removed", `${u.id}: 방어도 효과를 소모해 출혈 제거`, {
            actorId: u.id,
            replacement: "block",
        });
        return;
    }
    u.block += amount;
    if (u.id === "player" && amount > 0)
        s.gainedBlock = true;
    log(s, u.id === "player" ? "block" : "enemy_block", `${u.id} +${amount}`);
}
function triggerR08(s: Battle) {
    if (!s.economy)
        return;
    if (s.relics.includes("R08") &&
        !s.economy!.r08 &&
        living(s).some((e) => distance(boardOf(s), s.player.node, e.node) === 1)) {
        s.economy!.r08 = true;
        gainBlock(s, s.player, 3);
        log(s, "relic_R08", "인접 턴 종료 방어도 3");
    }
}
function tick(s: Battle, id: string) {
    const u = getUnit(s, id);
    if (u.hp > 0 && u.poison) {
        u.poison--;
        direct(s, u, 2, true, "poison");
        log(s, "poison_tick", id);
    }
    if (u.hp <= 0 || ["victory", "defeat"].includes(s.phase))
        return;
    if (u.bleed > 0) {
        direct(s, u, u.bleed, true, "bleed");
        log(s, "bleed_tick", id);
    }
    if (u.hp <= 0 || ["victory", "defeat"].includes(s.phase))
        return;
    if (u.disarm > 0) {
        u.disarm--;
        log(s, "disarm_consumed", id);
    }
}
function pump(s: Battle) {
    let guard = 0;
    while (!s.prompt && s.queue.length && s.phase === "resolving") {
        if (++guard > 300)
            throw Error("상태 전이 무한 반복");
        const t = s.queue.shift()!;
        switch (t.kind) {
            case "step": {
                const x = structuredClone(t.step);
                if (x.type === "move" && s.economy?.moveBonus) {
                    x.distance = (x.distance ?? 0) + s.economy.moveBonus;
                    s.economy.moveBonus = 0;
                }
                if (x.type === "attack" && s.player.disarm > 0) {
                    s.lastTarget = undefined;
                    log(s, "disarm_skip", "무장해제: 공격 생략", { cardId: t.card });
                    break;
                }
                if (x.type === "move" && s.player.bind > 0) {
                    s.player.bind--;
                    log(s, "bind_consumed", "속박: 이동 단계 생략", { cardId: t.card });
                    break;
                }
                if (x.type !== "attack" && !x.timing && !condition(s, x.condition))
                    break;
                if (x.type === "move") {
                    s.prompt = {
                        kind: "effect",
                        step: x,
                        targets: [],
                        paths: paths(s, s.player.node, x.distance!),
                        card: t.card,
                        side: t.side,
                        stepIndex: t.stepIndex,
                        stepCount: t.stepCount,
                    };
                    break;
                }
                if (["attack", "status", "push", "pull"].includes(x.type)) {
                    const targets = validTargets(s, x);
                    if (x.type === "attack" &&
                        (x.target === "all_enemies" || x.target === "all_adjacent_enemies"))
                        log(s, "area_attack", "광역 타격", {
                            cardId: t.card,
                            targetCount: targets.length,
                            printedSum: targets.length * (x.damage ?? 0),
                        });
                    if (!targets.length) {
                        if (x.type === "attack")
                            s.lastTarget = undefined;
                        break;
                    }
                    if (x.target === "all_enemies" ||
                        x.target === "all_adjacent_enemies") {
                        const weak = s.player.weak;
                        for (const id of targets.sort()) {
                            if (x.type === "attack")
                                s.player.weak = weak;
                            effect(s, x, id, undefined, false, t.card);
                            if (check(s))
                                break;
                        }
                        if (x.type === "attack")
                            s.player.weak = Math.max(0, weak - 1);
                        break;
                    }
                    if (x.target === "last_attack_target") {
                        if (x.type === "push" || x.type === "pull") {
                            const forced = planForcedMove(s, s.player, getUnit(s, targets[0]), x.distance ?? 1, x.type);
                            const p = forced.path;
                            if (p.length)
                                s.prompt = {
                                    kind: "effect",
                                    step: x,
                                    targets,
                                    card: t.card,
                                    side: t.side,
                                    stepIndex: t.stepIndex,
                                    stepCount: t.stepCount,
                                    paths: [p],
                                    forced,
                                };
                            else
                                effect(s, x, targets[0]);
                        }
                        else
                            effect(s, x, targets[0]);
                        break;
                    }
                    s.prompt = {
                        kind: "effect",
                        step: x,
                        targets,
                        paths: [],
                        card: t.card,
                        side: t.side,
                        stepIndex: t.stepIndex,
                        stepCount: t.stepCount,
                    };
                    break;
                }
                effect(s, x);
                break;
            }
            case "finish":
                if (s.zones.inPlay.includes(t.action.card)) {
                    if (t.loss)
                        lose(s, [t.action.card], "inPlay", "printed");
                    else {
                        s.zones.inPlay.splice(s.zones.inPlay.indexOf(t.action.card), 1);
                        s.zones.discard.push(t.action.card);
                    }
                }
                if (t.action.side === "top")
                    s.topDone = true;
                log(s, "face_done", t.action.card + " " + t.action.side);
                if (t.action.side === "top" &&
                    !s.economy &&
                    s.relics.includes("R04") &&
                    !s.relicMoved) {
                    s.phase = "ready";
                    s.reason = "상단 완료 — 추가 이동 또는 계속";
                }
                if (s.economy &&
                    (s.economy.items.length || ((s.medkits ?? 0) > 0 && s.player.hp < s.player.maxHp)) &&
                    s.queue[0]?.kind !== "playerEnd") {
                    s.phase = "ready";
                    s.reason = "카드 면 사이 · 아이템 또는 계속";
                    s.economy.pauseFaces = true;
                }
                break;
            case "playerEnd":
                if (s.economy) {
                    s.economy.moveBonus = 0;
                    triggerR08(s);
                }
                tick(s, "player");
                if (check(s))
                    break;
                enqueueEnemies(s);
                break;
            case "enemy": {
                const e = getUnit(s, t.id);
                if (e.hp <= 0)
                    break;
                e.block = 0;
                e.lastHitTarget = undefined;
                s.queue.unshift(...intentSteps(e.intent).map((step, index) => ({
                    kind: "enemyStep" as const,
                    id: e.id,
                    step,
                    index,
                })));
                break;
            }
            case "enemyStep": {
                const e = getUnit(s, t.id);
                if (e.hp <= 0)
                    break;
                const i = t.step;
                log(s, "enemy_step", `${e.id}: ${i.kind}`, {
                    actorId: e.id,
                    stepIndex: t.index,
                    step: i,
                    startNode: e.node,
                });
                if (i.kind === "move") {
                    if (e.bind > 0) {
                        e.bind--;
                        log(s, "bind_consumed", `${e.id}: 속박으로 이동 단계 생략`, {
                            actorId: e.id,
                            stepIndex: t.index,
                        });
                        break;
                    }
                    const plan = planEnemyMove(s, e, i, t.index);
                    for (const node of plan.path) {
                        if ([s.player, ...living(s)].some((u) => u.id !== e.id && u.node === node))
                            break;
                        e.node = node;
                    }
                    log(s, "enemy_move", `${e.id}: ${i.mode} ${plan.path.join(" → ") || "제자리"}`, { actorId: e.id, stepIndex: t.index, mode: i.mode, ...plan });
                }
                else if (i.kind === "push" || i.kind === "pull") {
                    if (i.targetPolicy === "last_attack_target" &&
                        e.lastHitTarget !== "player") {
                        log(s, "followup_skipped", e.id, {
                            actorId: e.id,
                            stepIndex: t.index,
                        });
                        break;
                    }
                    if (s.player.hp > 0)
                        force(s, e, s.player, i.distance ?? 1, i.kind);
                }
                else if (i.kind === "status") {
                    log(s, "enemy_status_attempt", e.id, {
                        actorId: e.id,
                        stepIndex: t.index,
                        threatNodes: stepThreats(s, e, i, t.index),
                        range: i.range ?? 1,
                        status: i.status,
                    });
                    if ((i.targetPolicy !== "last_attack_target" ||
                        e.lastHitTarget === "player") &&
                        enemyTargets(s, e, i, t.index).length &&
                        i.status)
                        status(s, s.player, i.status);
                }
                else if (i.kind === "block") {
                    gainBlock(s, e, i.amount!);
                }
                else if (i.kind === "heal")
                    heal(s, e, i.amount!);
                else if (i.kind === "buff_attack") {
                    e.buff += i.amount!;
                    log(s, "buff", `${e.id} +${i.amount}`);
                }
                else {
                    e.lastHitTarget = undefined;
                    if (e.disarm > 0) {
                        log(s, "disarm_skip", `${e.id}: 무장해제: 공격 생략`, {
                            actorId: e.id,
                            stepIndex: t.index,
                        });
                        break;
                    }
                    log(s, "enemy_attack_attempt", e.id, {
                        actorId: e.id,
                        kind: i.kind,
                        stepIndex: t.index,
                        threatNodes: stepThreats(s, e, i, t.index),
                    });
                    const targets = enemyTargets(s, e, i, t.index);
                    const tasks: Task[] = [];
                    for (const u of targets)
                        for (let k = 0; k < (i.hits ?? 1); k++)
                            tasks.push({
                                kind: "hit",
                                source: e.id,
                                target: u.id,
                                damage: i.damage ?? 0,
                                status: i.status,
                                stepIndex: t.index,
                            });
                    s.queue.unshift(...tasks);
                    if (!targets.length)
                        log(s, "miss", e.id, { actorId: e.id });
                }
                break;
            }
            case "forceApply": {
                const target = getUnit(s, t.target);
                const plan = planForcedMove(s, getUnit(s, t.source), target, t.max, t.mode);
                if (plan.path.length)
                    target.node = plan.path.at(-1)!;
                log(s, "forced_move", "반응 후 강제 이동", {
                    actorId: t.source,
                    targetId: t.target,
                    ...plan,
                });
                break;
            }
            case "hit":
                hit(s, t);
                break;
            case "tick":
                tick(s, t.id);
                break;
            case "end": {
                if (s.delayedHeal && !s.hpLostEnemy)
                    heal(s, s.player, s.delayedHeal);
                if (!s.retain)
                    s.player.block = 0;
                log(s, "turn_end", "턴 종료", {
                    blockRemaining: s.player.block,
                    healed: s.stats.turn_healed ?? 0,
                    playerAttacks: s.stats.turn_attack_attempts ?? 0,
                });
                if (!s.stats.turn_attack_attempts && s.stats.turn_healed)
                    s.stats.heal_only_turns = (s.stats.heal_only_turns ?? 0) + 1;
                const e = encounters[s.scenario];
                if (e.objective === "survive" && s.turn >= e.turnLimit!) {
                    s.phase = "victory";
                    s.reason = "생존 성공";
                    log(s, "result", s.reason);
                }
                else {
                    s.turn++;
                    prepare(s);
                }
                break;
            }
        }
        if (check(s))
            break;
    }
}
function enqueueEnemies(s: Battle) {
    const e = encounters[s.scenario];
    if (e.objective === "kill_target" && e.turnLimit !== undefined && s.turn >= e.turnLimit) {
        s.phase = "defeat";
        s.reason = "시간 초과";
        log(s, "result", s.reason);
        return;
    }
    for (const u of living(s).sort((a, b) => nodeOrder(a.id, b.id)))
        s.queue.push({ kind: "enemy", id: u.id }, { kind: "tick", id: u.id });
    s.queue.push({ kind: "end" });
}
export function faceSteps(s: Pick<Battle, "upgrades" | "ruleset">, a: Action): Step[] {
    const f = s.ruleset === LEGACY_RULES && a.card === "C17" ? legacyPhase0.c17[a.side] : cards[a.card][a.side];
    const steps: Step[] = a.basic
        ? [
            a.side === "top"
                ? { type: "attack", damage: 3, range: 1, basic: true }
                : { type: "move", distance: 1, basic: true },
        ]
        : structuredClone(f.steps);
    if (!a.basic && s.upgrades[a.card]?.includes(a.side)) {
        const first = steps.find((x) => a.side === "top" ? x.type === "attack" : x.type === "block");
        if (first) {
            if (a.side === "top")
                first.damage!++;
            else
                first.amount!++;
        }
    }
    return steps;
}
export function applyCommand(state: Battle, c: Command): Battle {
    if (state.version !== 3 ||
        !["0.3.1-proposal-1", ECONOMY_VERSION].includes(state.contentVersion))
        throw Error("전투 콘텐츠 버전 불일치: 새 v0.3 전투를 시작하세요");
    const s = structuredClone(state);
    if (c.type === "medkit") {
        const reason = medkitUnavailable(s);
        if (reason) throw Error(reason);
        s.medkits!--;
        log(s, "medkit_use", "응급약 사용", { remaining: s.medkits });
        const before = s.player.hp;
        heal(s, s.player, 6);
        log(s, "medkit_heal", "응급약 회복 처리", { amount: s.player.hp - before, remaining: s.medkits });
        s.commands.push(structuredClone(c));
        assertBattle(s);
        return s;
    }
    if (c.type === "recordMetrics") {
        if (!["victory", "defeat"].includes(s.phase) ||
            !Number.isFinite(c.elapsedSeconds) ||
            c.elapsedSeconds < 0 ||
            !Number.isInteger(c.inputCount) ||
            c.inputCount < 0)
            throw Error("잘못된 실측값");
        s.elapsedSeconds = c.elapsedSeconds;
        s.stats.input_count = c.inputCount;
        s.commands.push(structuredClone(c));
        return s;
    }
    if (["victory", "defeat"].includes(s.phase))
        throw Error("종료된 전투");
    if (s.economy?.startPending.length && c.type !== "startChoice")
        throw Error("전투 시작 유물 선택이 필요합니다");
    if (c.type === "startChoice") {
        if (!s.economy?.startPending.length)
            throw Error("시작 선택 대기 아님");
        if (s.economy.startPending[0] === "tile") {
            if (!c.node ||
                !boardOf(s).nodes.some((n) => n.id === c.node) ||
                living(s).some((e) => e.node === c.node))
                throw Error("유효하지 않은 시작 칸");
            s.player.node = c.node;
            for (const e of living(s)) {
                e.marks = intentSteps(e.intent).map((i) => i.kind === "marked" ? s.player.node : null);
                e.mark = e.marks.find(Boolean) ?? undefined;
            }
        }
        else {
            const e = living(s).find((e) => e.id === c.target);
            if (!e)
                throw Error("적 선택 필요");
            status(s, e, { status: "weak", stacks: 1 });
        }
        log(s, "start_choice", "시작 유물 선택", {
            node: c.node,
            targetId: c.target,
        });
        s.economy.startPending.shift();
    }
    else if (c.type === "item") {
        useItem(s, c);
    }
    else if (c.type === "forceReaction") {
        if (s.prompt?.kind !== "forceReaction")
            throw Error("강제 이동 반응 대기 아님");
        const p = s.prompt;
        if (c.use) {
            consumeItem(s, "I09");
            log(s, "force_negated", "무릎 보호대: 강제 이동 취소");
        }
        else
            s.queue.unshift({
                kind: "forceApply",
                source: p.source,
                target: "player",
                max: p.max,
                mode: p.mode,
            });
        delete s.prompt;
    }
    else if (c.type === "continueFace") {
        if (!s.economy?.pauseFaces || s.prompt)
            throw Error("카드 면 사이 아님");
        s.economy.pauseFaces = false;
        s.reason = undefined;
        s.phase = "resolving";
    }
    else if (c.type === "play") {
        if (s.phase !== "ready" ||
            s.prompt ||
            s.reason ||
            c.actions.length !== 2 ||
            new Set(c.actions.map((a) => a.card)).size !== 2 ||
            new Set(c.actions.map((a) => a.side)).size !== 2 ||
            c.actions.some((a) => !s.zones.hand.includes(a.card) || !["top", "bottom"].includes(a.side)))
            throw Error("상단과 하단에 서로 다른 손 카드 2장이 필요합니다");
        s.phase = "resolving";
        for (const a of c.actions) {
            s.zones.hand.splice(s.zones.hand.indexOf(a.card), 1);
            s.zones.inPlay.push(a.card);
            log(s, `card_${a.card}_${a.side}_${a.basic ? "basic" : "printed"}`, "사용");
            const loss = !a.basic && cards[a.card][a.side].loss;
            s.queue.push(...faceSteps(s, a).map((step, index, steps) => ({
                stepIndex: index + 1,
                stepCount: steps.length,
                kind: "step" as const,
                step,
                card: a.card,
                side: a.side,
            })), { kind: "finish", action: a, loss });
        }
        s.queue.push({ kind: "playerEnd" });
    }
    else if (c.type === "choose") {
        if (s.prompt?.kind !== "effect")
            throw Error("효과 선택 대기 아님");
        const p = s.prompt;
        if (!c.skip) {
            if (p.step.type === "move") {
                if (!p.paths.some((x) => JSON.stringify(x) === JSON.stringify(c.path ?? [])))
                    throw Error("불법 이동 경로");
            }
            else if ((p.step.type === "push" || p.step.type === "pull") &&
                p.paths.length) {
                if (!p.paths.some((x) => JSON.stringify(x) === JSON.stringify(c.path)))
                    throw Error("불법 밀치기");
            }
            else if (!p.targets.includes(c.target ?? ""))
                throw Error("불법 대상");
        }
        delete s.prompt;
        if ((p.step.type === "push" || p.step.type === "pull") &&
            !p.paths.length &&
            !c.skip) {
            const id = c.target!;
            const forced = planForcedMove(s, s.player, getUnit(s, id), p.step.distance ?? 1, p.step.type);
            const options = forced.path;
            if (options.length)
                s.prompt = {
                    ...p,
                    kind: "effect",
                    step: p.step,
                    targets: [id],
                    paths: [options],
                    forced,
                };
            else
                effect(s, p.step, id);
        }
        else
            effect(s, p.step, c.target ?? p.targets[0], c.path, c.skip, p.card);
    }
    else if (c.type === "damage") {
        resolveDamage(s, c);
    }
    else if (c.type === "rest") {
        if (s.prompt?.kind === "rest") {
            if (!s.prompt.cards.includes(c.card ?? ""))
                throw Error("휴식 후보를 선택하세요");
            delete s.prompt;
            finishRest(s, c.card!);
        }
        else {
            if (s.phase !== "ready" ||
                s.reason ||
                s.prompt ||
                s.rested ||
                s.zones.discard.length < 2)
                throw Error("지금은 휴식할 수 없습니다");
            s.rested = true;
            if (s.relics.includes(s.economy ? "R02" : "R01")) {
                s.prompt = { kind: "rest", cards: sample(s, s.zones.discard, 2) };
                log(s, "rest_candidates", "휴식 후보 공개", { cards: s.prompt.cards });
            }
            else
                finishRest(s, sample(s, s.zones.discard)[0]);
        }
    }
    else if (c.type === "relicMove") {
        if (s.economy ||
            !s.relics.includes("R04") ||
            s.relicMoved ||
            !s.topDone ||
            s.prompt ||
            !s.reason)
            throw Error("추가 이동 불가");
        s.relicMoved = true;
        s.phase = "resolving";
        s.queue.unshift({ kind: "step", step: { type: "move", distance: 1 } });
        s.reason = undefined;
    }
    else if (c.type === "endPlayer") {
        if (!s.reason || s.phase !== "ready" || s.prompt)
            throw Error("종료할 수 없음");
        s.reason = undefined;
        s.phase = "resolving";
        if (!s.queue.length)
            enqueueEnemies(s);
    }
    s.commands.push(structuredClone(c));
    pump(s);
    if (s.phase === "resolving" && !s.queue.length && !s.prompt && s.relicMoved) {
        enqueueEnemies(s);
        pump(s);
    }
    if (s.phase === "victory" || s.phase === "defeat") {
        s.stats.end_hp = s.player.hp;
        s.stats.turns = s.turn;
        s.stats.won = s.phase === "victory" ? 1 : 0;
    }
    assertBattle(s);
    return s;
}
function resolveDamage(s: Battle, c: Extract<Command, {
    type: "damage";
}>) {
    if (s.prompt?.kind !== "damage")
        throw Error("피해 선택 대기 아님");
    const p = s.prompt;
    if (c.zone) {
        const ids = c.cards ?? [];
        if (ids.length !== (c.zone === "hand" ? 1 : 2) ||
            new Set(ids).size !== ids.length ||
            ids.some((id) => !s.zones[c.zone!].includes(id)))
            throw Error("소실 비용 불충족");
        lose(s, ids, c.zone, "damage");
        log(s, "prevented", String(p.damage));
    }
    else {
        s.player.hp -= p.damage;
        if (p.damage > 0)
            s.hpLostEnemy = true;
        log(s, "hp_damage", String(p.damage));
    }
    log(s, "attack_resolved", "플레이어 피격 선택", {
        actorId: p.source,
        targetId: "player",
        base: p.base,
        actualHpDamage: c.zone ? 0 : Math.min(s.player.hp + p.damage, p.damage),
        exposedHpDamage: c.zone ? 0 : (p.exposedHpDamage ?? 0),
        prevented: !!c.zone,
    });
    delete s.prompt;
    if (!check(s)) {
        if (p.status)
            status(s, s.player, p.status);
        counter(s, getUnit(s, p.source));
    }
}
export function projectEnemyPhase(state: Battle, ids?: string[]) {
    const s = structuredClone(state);
    triggerR08(s);
    s.log = [];
    s.commands = [];
    delete s.prompt;
    delete s.reason;
    s.phase = "resolving";
    s.queue = (ids ??
        living(s)
            .sort((a, b) => nodeOrder(a.id, b.id))
            .map((e) => e.id)).flatMap((id) => [
        { kind: "enemy" as const, id },
        { kind: "tick" as const, id },
    ]);
    let guard = 0;
    do {
        pump(s);
        if ((s as Battle).prompt?.kind === "damage")
            resolveDamage(s, { type: "damage" });
        if ((s as Battle).prompt?.kind === "forceReaction") {
            const p = (s as Battle).prompt as Extract<Battle["prompt"], {
                kind: "forceReaction";
            }>;
            delete s.prompt;
            s.queue.unshift({
                kind: "forceApply",
                source: p.source,
                target: "player",
                max: p.max,
                mode: p.mode,
            });
        }
        if (++guard > 200)
            throw Error("예상 행동 반복 오류");
    } while ((s.queue.length || s.prompt) && s.phase === "resolving");
    if (s.rng !== state.rng || s.rngCount !== state.rngCount)
        throw Error("미리보기 RNG 변경");
    return s;
}
function finishRest(s: Battle, id: string) {
    lose(s, [id], "discard", "rest");
    if (s.economy) {
        s.economy.used = s.economy.used.filter((id) => !itemById[id].recharge_on_short_rest);
        log(s, "items_recharged", "짧은 휴식: I02/I04 재충전");
    }
    s.zones.hand.push(...s.zones.discard);
    s.zones.discard = [];
    if (s.zones.hand.length < 2) {
        s.phase = "defeat";
        s.reason = "카드 탈진";
    }
    log(s, "rest", `소실 ${id}, 나머지 회수`);
}
export function assertBattle(s: Battle) {
    if (s.medkits !== undefined && (!Number.isInteger(s.medkits) || s.medkits < 0))
        throw Error("응급약 수량 오류");
    if (s.economy) {
        const e = s.economy;
        if (!Array.isArray(e.items) ||
            !Array.isArray(e.used) ||
            new Set(e.items).size !== e.items.length ||
            new Set(e.used).size !== e.used.length ||
            e.items.some((id) => !itemById[id]) ||
            e.used.some((id) => !e.items.includes(id)) ||
            ![0, 2].includes(e.moveBonus) ||
            !Array.isArray(e.startPending) ||
            e.startPending.some((x) => !["tile", "enemy"].includes(x)))
            throw Error("아이템/유물 전투 저장 오류");
    }
    const all = Object.values(s.zones).flat();
    if (all.length !== s.deck.length ||
        new Set(all).size !== all.length ||
        all.some((id) => !s.deck.includes(id)))
        throw Error("카드 구역 불변식 위반");
    for (const u of [s.player, ...s.enemies])
        for (const key of statusKeys)
            if (!Number.isInteger(u[key]) || u[key] < 0)
                throw Error("상태이상 수치 오류: " + key);
    const units = [s.player, ...living(s)];
    if (new Set(units.map((u) => u.node)).size !== units.length)
        throw Error("점유 충돌");
    return true;
}
export function replay(initial: Battle, commands: Command[]) {
    return commands.reduce(applyCommand, initial);
}
export function medkitUnavailable(s: Battle) {
    if (s.ruleset !== PHASE1) return "이전 규칙에서는 응급약을 사용하지 않습니다";
    if (!(s.medkits! > 0)) return "남은 응급약이 없습니다";
    if (s.phase !== "ready" || s.prompt || s.economy?.startPending.length || (s.reason && !s.economy?.pauseFaces))
        return "플레이어 행동 대기 또는 두 카드 면 사이에만 사용합니다";
    if (s.player.hp >= s.player.maxHp) return "HP가 최대입니다";
    return "";
}
export function itemAvailable(s: Battle, id: string) {
    if (!s.economy ||
        !s.economy.items.includes(id) ||
        s.economy.used.includes(id) ||
        s.economy.startPending.length)
        return false;
    if (id === "I02")
        return s.prompt?.kind === "damage" && s.prompt.damage > 0;
    if (id === "I09")
        return s.prompt?.kind === "forceReaction";
    return (s.phase === "ready" && !s.prompt && (!s.reason || s.economy.pauseFaces));
}
function consumeItem(s: Battle, id: string) {
    if (!itemAvailable(s, id))
        throw Error("지금 사용할 수 없는 아이템입니다");
    s.economy!.used.push(id);
    log(s, "item_use", itemById[id].name, { itemId: id });
    if (s.relics.includes("R07")) {
        gainBlock(s, s.player, 2);
        log(s, "relic_R07", "아이템 사용: 방어도 2", { itemId: id });
    }
}
function useItem(s: Battle, c: Extract<Command, {
    type: "item";
}>) {
    if (!itemById[c.id] || c.id === "I09" || !itemAvailable(s, c.id))
        throw Error("아이템 사용 조건 불충족");
    const target = living(s).find((e) => e.id === c.target), p = s.player;
    const range = target ? distance(boardOf(s), p.node, target.node) : Infinity;
    if (["I04", "I06"].includes(c.id) && range !== 1)
        throw Error("인접 적을 선택하세요");
    if (c.id === "I05" && range > 2)
        throw Error("거리 2 이내 적을 선택하세요");
    if (c.id === "I06" && !planForcedMove(s, p, target!, 2, "push").path.length)
        throw Error("이동 가능한 밀치기 대상이 없습니다");
    if (c.id === "I07" &&
        !living(s).some((e) => distance(boardOf(s), p.node, e.node) === 1))
        throw Error("인접 적이 없습니다");
    if (c.id === "I03" &&
        (!c.status || !["poison", "bleed"].includes(c.status) || !p[c.status]))
        throw Error("제거할 중독 또는 출혈을 선택하세요");
    if (c.id === "I08" &&
        (!c.status || !["weak", "exposed"].includes(c.status) || !p[c.status]))
        throw Error("제거할 약화 또는 노출을 선택하세요");
    const blockBefore = p.block;
    consumeItem(s, c.id);
    if (c.id === "I01")
        s.economy!.moveBonus = 2;
    else if (c.id === "I02") {
        if (s.prompt?.kind !== "damage")
            throw Error("피해 반응 대기 아님");
        const absorbed = Math.min(s.prompt.damage, Math.max(0, p.block - blockBefore));
        p.block -= absorbed;
        s.prompt.damage = Math.max(0, s.prompt.damage - absorbed - 1);
        log(s, "item_damage_reduced", "HP 피해 감소", {
            absorbed,
            remaining: s.prompt.damage,
        });
    }
    else if (c.id === "I03" || c.id === "I08")
        p[c.status!] = 0;
    else if (c.id === "I04")
        status(s, target!, { status: "exposed", stacks: 1 });
    else if (c.id === "I05")
        status(s, target!, { status: "bind", stacks: 1 });
    else if (c.id === "I06")
        force(s, p, target!, 2, "push");
    else if (c.id === "I07")
        for (const e of living(s).filter((e) => distance(boardOf(s), p.node, e.node) === 1))
            status(s, e, { status: "weak", stacks: 1 });
}
