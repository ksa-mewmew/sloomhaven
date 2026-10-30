import { cards, content, encounters } from "./data";
import { applyCommand, createBattle } from "./engine";
import { replaceRecovery } from "./status";
import { sample, seedNumber } from "./rng";
import type { Battle, Command, Side } from "./types";
export type Reward = {
    id: string;
    kind: "hp" | "card" | "upgrade" | "relic" | "heal";
    cards?: string[];
    relic?: string;
    amount?: number;
};
export interface Run {
    version: 3;
    schemaVersion: 3;
    contentVersion: "0.3.1-proposal-1";
    seed: string;
    rng: number;
    rngCount: number;
    stage: "start" | "map" | "deck" | "battle" | "report" | "reward" | "zoneRest" | "success" | "failure";
    hp: number;
    maxHp: number;
    owned: string[];
    equipped: string[];
    relics: string[];
    upgrades: Record<string, Side[]>;
    completed: string[];
    choices: string[];
    rewards: Reward[];
    chosen?: string;
    chosenVariant?: string;
    breaksTaken: number[];
    history: {
        event: string;
        slot: number;
        rng: number;
        rngCount: number;
        [key: string]: unknown;
    }[];
    battle?: Battle;
    initialBattle?: Battle;
    reports: Battle[];
}
export function createRun(seed: string): Run {
    const r: Run = {
        version: 3,
        schemaVersion: 3,
        contentVersion: "0.3.1-proposal-1",
        seed,
        rng: seedNumber(seed),
        rngCount: 0,
        stage: "start",
        hp: 40,
        maxHp: 40,
        owned: [...content.character.initialOwnedCards],
        equipped: [...content.character.initialEquippedCards],
        relics: [],
        upgrades: {},
        completed: [],
        choices: [],
        rewards: [],
        reports: [],
        breaksTaken: [],
        history: [],
    };
    r.rewards = makeRewards(r, true);
    return r;
}
export const capacity = (r: Run) => content.character.deckCapacity + (r.relics.includes("R02") ? 1 : 0);
export function upgradesAvailable(r: Run) {
    return r.owned.flatMap((id) => (["top", "bottom"] as Side[])
        .filter((side) => !r.upgrades[id]?.includes(side) &&
        cards[id][side].steps.some((s) => s.type === (side === "top" ? "attack" : "block")))
        .map((side) => ({ id, side })));
}
function makeRewards(r: Run, start = false): Reward[] {
    const pool: Reward[] = [];
    const missing = Object.values(cards)
        .filter((c) => c.pool === "reward" && !r.owned.includes(c.id))
        .map((c) => c.id);
    pool.push(missing.length
        ? { id: "card", kind: "card", cards: sample(r, missing, 3) }
        : { id: "card", kind: "heal" });
    pool.push(upgradesAvailable(r).length
        ? { id: "upgrade", kind: "upgrade" }
        : { id: "upgrade", kind: "heal" });
    const relic = sample(r, content.relics
        .filter((x) => !r.relics.includes(x.id) && (x.id !== "R02" || r.owned.length >= 9))
        .map((x) => x.id))[0];
    pool.push(relic
        ? { id: "relic", kind: "relic", relic }
        : { id: "relic", kind: "heal" });
    if (start)
        pool.push({ id: "hp", kind: "hp" });
    else
        pool.push({ id: "heal", kind: "heal", amount: 5 });
    const offered = sample(r, pool, 3);
    r.history.push({
        event: "reward_offer",
        slot: r.completed.length,
        rng: r.rng,
        rngCount: r.rngCount,
        seed: r.seed,
        offered: structuredClone(offered),
    });
    return offered;
}
function nextMap(r: Run) {
    const stage = content.run.stages[r.completed.length];
    if (!stage)
        throw Error("런 슬롯을 초과했습니다");
    r.choices = encounters[stage.encounter].variants.map((v) => v.id);
    r.stage = "map";
}
export function zoneFor(r: Run) {
    const slot = Math.min(content.run.totalBattles, r.completed.length + 1);
    return content.run.zones.find((z) => z.stages.includes(slot))!;
}
export type RunCommand = {
    type: "reward";
    id: string;
    card?: string;
    side?: Side;
} | {
    type: "scenario";
    id: string;
} | {
    type: "equip";
    ids: string[];
} | {
    type: "startBattle";
} | {
    type: "battle";
    command: Command;
} | {
    type: "report";
};
export function applyRunCommand(state: Run, c: RunCommand): Run {
    const r = structuredClone(state);
    switch (c.type) {
        case "reward": {
            if (!["start", "reward", "zoneRest"].includes(r.stage))
                throw Error("보상 단계 아님");
            const isBreak = r.stage === "zoneRest";
            const hpBefore = r.hp;
            const reward = r.rewards.find((x) => x.id === c.id);
            if (!reward)
                throw Error("잘못된 보상");
            if (reward.kind === "hp") {
                r.maxHp += 5;
                r.hp += 5;
            }
            else if (reward.kind === "heal") {
                const replaced = r.battle &&
                    replaceRecovery(r.battle.player, reward.amount ?? 5, "heal");
                if (!replaced)
                    r.hp = Math.min(r.maxHp, r.hp + (reward.amount ?? 5));
                if (r.battle)
                    r.battle.player.hp = r.hp;
            }
            else if (reward.kind === "relic") {
                if (!reward.relic || r.relics.includes(reward.relic))
                    throw Error("중복 유물");
                r.relics.push(reward.relic);
            }
            else if (reward.kind === "card") {
                if (!c.card ||
                    !reward.cards?.includes(c.card) ||
                    r.owned.includes(c.card))
                    throw Error("카드 선택 필요");
                r.owned.push(c.card);
            }
            else if (reward.kind === "upgrade") {
                if (!upgradesAvailable(r).some((x) => x.id === c.card && x.side === c.side))
                    throw Error("강화할 면 선택 필요");
                (r.upgrades[c.card!] ??= []).push(c.side!);
            }
            r.history.push({
                event: isBreak ? "zone_rest" : "reward",
                slot: r.completed.length,
                rng: r.rng,
                rngCount: r.rngCount,
                reward: structuredClone(reward),
                card: c.card,
                side: c.side,
                hpBefore,
                hpAfter: r.hp,
                healed: reward.kind === "heal" ? Math.max(0, r.hp - hpBefore) : 0,
                healthGrowth: reward.kind === "hp" ? Math.max(0, r.hp - hpBefore) : 0,
            });
            if (isBreak)
                r.breaksTaken.push(r.completed.length);
            if (!isBreak &&
                content.run.zoneBreaksAfterStages.includes(r.completed.length) &&
                !r.breaksTaken.includes(r.completed.length)) {
                r.stage = "zoneRest";
                r.rewards = [
                    { id: "zone-heal", kind: "heal", amount: 8 },
                    upgradesAvailable(r).length
                        ? { id: "zone-upgrade", kind: "upgrade" }
                        : { id: "zone-upgrade", kind: "heal", amount: 8 },
                ];
            }
            else
                nextMap(r);
            break;
        }
        case "scenario":
            if (r.stage !== "map" || !r.choices.includes(c.id))
                throw Error("전투 후보 아님");
            r.chosen = content.run.stages[r.completed.length].encounter;
            r.chosenVariant = c.id;
            r.stage = "deck";
            break;
        case "equip":
            if (r.stage !== "deck" ||
                new Set(c.ids).size !== c.ids.length ||
                c.ids.length > capacity(r) ||
                c.ids.some((id) => !r.owned.includes(id)))
                throw Error("덱 편성 오류");
            r.equipped = [...c.ids];
            r.history.push({
                event: "deck",
                slot: r.completed.length + 1,
                rng: r.rng,
                rngCount: r.rngCount,
                cards: [...c.ids],
            });
            break;
        case "startBattle":
            if (r.stage !== "deck" || r.equipped.length !== capacity(r))
                throw Error(`정확히 ${capacity(r)}장이 필요합니다`);
            r.battle = createBattle(r.chosen!, `${r.seed}/${r.completed.length + 1}/${r.chosen}`, r.equipped, r.hp, r.maxHp, r.relics, r.upgrades, r.chosenVariant);
            r.initialBattle = structuredClone(r.battle);
            r.stage = "battle";
            break;
        case "battle":
            if (r.stage !== "battle" || !r.battle)
                throw Error("전투 중 아님");
            r.battle = applyCommand(r.battle, c.command);
            break;
        case "report":
            if (!r.battle ||
                !["victory", "defeat"].includes(r.battle.phase) ||
                r.stage !== "battle")
                throw Error("종료된 전투 필요");
            r.hp = r.battle.player.hp;
            r.reports.push(structuredClone(r.battle));
            if (r.battle.phase === "defeat")
                r.stage = "failure";
            else {
                r.completed.push(r.chosen!);
                if (r.completed.length === content.run.totalBattles)
                    r.stage = "success";
                else {
                    r.stage = "reward";
                    r.rewards = makeRewards(r);
                }
            }
            break;
    }
    return r;
}
