import * as legacy from "./campaign-v031";
import { cards, content, encounters } from "./data";
import { createBattle, applyCommand } from "./engine";
import { random, sample, seedNumber } from "./rng";
import { replaceRecovery } from "./status";
import { economy, economyTrial, ECONOMY_VERSION, relicById, itemById, } from "./economy";
import type { Command, Side } from "./types";
export const upgradesAvailable = (r: Pick<Run, "owned" | "upgrades">) => legacy.upgradesAvailable(r as legacy.Run);
export type Reward = {
    id: string;
    kind: "hp" | "card" | "item" | "upgrade" | "relic" | "heal" | "continue" | "empty";
    cards?: string[];
    items?: string[];
    relic?: string;
    amount?: number;
};
export type Stock = {
    key: string;
    kind: "card" | "item" | "relic";
    id: string;
    price: number;
    sold: boolean;
};
export interface Run extends Omit<legacy.Run, "contentVersion" | "stage" | "rewards"> {
    contentVersion: typeof ECONOMY_VERSION;
    stage: legacy.Run["stage"] | "shop";
    rewards: Reward[];
    gold: number;
    items: string[];
    equippedItems: string[];
    stock: Stock[];
    shopsTaken: number[];
    rewardType?: "card" | "item" | "relic";
    rewardGold?: number;
}
export type RunCommand = legacy.RunCommand | {
    type: "buy";
    key: string;
} | {
    type: "leaveShop";
} | {
    type: "equipItems";
    ids: string[];
};
export const capacity = (r: Pick<Run, "relics">) => 8 + (r.relics.includes("R03") ? 1 : 0);
export const zoneFor = (r: Pick<Run, "completed">) => content.run.zones.find((z) => z.stages.includes(Math.min(10, r.completed.length + 1)))!;
function record(r: Run, event: string, fields: Record<string, unknown> = {}) {
    r.history.push({
        event,
        slot: r.completed.length,
        rng: r.rng,
        rngCount: r.rngCount,
        ...fields,
    });
}
export function createRun(seed: string): Run {
    const old = legacy.createRun(seed);
    return {
        ...old,
        contentVersion: ECONOMY_VERSION,
        rng: seedNumber(seed),
        rngCount: 0,
        gold: 100,
        items: [],
        equippedItems: [],
        stock: [],
        shopsTaken: [],
        rewards: [{ id: "start-continue", kind: "continue" }],
        history: [],
    };
}
export function rollRewardType(r: {
    rng: number;
    rngCount: number;
}) {
    const n = random(r);
    return n < economy.battle_rewards.bonus_type_one_roll.card
        ? "card"
        : n < 0.9
            ? "item"
            : "relic";
}
export function openShop(r: Run) {
    const start = r.completed.length === 0;
    const relics = economy.relics.filter((x) => x.acquisition !== "battle_reward_only" &&
        !r.relics.includes(x.id) &&
        (!start || x.rarity === "일반"));
    const pools = {
        item: economy.items.filter((x) => !r.items.includes(x.id)).map((x) => x.id),
        relic: relics.map((x) => x.id),
        card: Object.keys(cards).filter((id) => !r.owned.includes(id)),
    };
    r.stock = [];
    for (const kind of ["item", "relic", "card"] as const)
        for (const id of sample(r, pools[kind], economy.shop.stock_per_visit[kind])) {
            const band = kind === "relic"
                ? relicById[id].rarity === "일반"
                    ? "relic_common"
                    : "relic_advanced"
                : kind;
            const [lo, hi] = economy.shop.price_ranges_gold[band];
            const price = lo + Math.floor(random(r) * (hi - lo + 1));
            r.stock.push({
                key: `${r.completed.length}/${kind}/${id}`,
                kind,
                id,
                price,
                sold: false,
            });
        }
    r.stage = "shop";
    record(r, "shop_open", { start, stock: structuredClone(r.stock) });
}
function nextMap(r: Run) {
    r.choices = encounters[content.run.stages[r.completed.length].encounter].variants.map((v) => v.id);
    r.stage = "map";
}
function afterReward(r: Run) {
    if ([3, 7].includes(r.completed.length) &&
        !r.breaksTaken.includes(r.completed.length)) {
        r.stage = "zoneRest";
        r.rewards = [{ id: "zone-heal", kind: "heal", amount: 8 }];
    }
    else if ([5, 9].includes(r.completed.length) &&
        !r.shopsTaken.includes(r.completed.length))
        openShop(r);
    else
        nextMap(r);
}
function acquire(r: Run, kind: "card" | "item" | "relic", id: string) {
    const list = kind === "card" ? r.owned : kind === "item" ? r.items : r.relics;
    if (list.includes(id))
        throw Error("이미 보유 중입니다");
    list.push(id);
    if (kind === "relic" && id === "R09")
        r.gold += 100;
    if (kind === "relic" && id === "R04") {
        r.maxHp += 7;
        if (!r.battle || !replaceRecovery(r.battle.player, 7, "heal"))
            r.hp = Math.min(r.maxHp, r.hp + 7);
        if (r.battle) {
            r.battle.player.hp = r.hp;
            r.battle.player.maxHp = r.maxHp;
        }
    }
    record(r, "acquire", { kind, id, gold: r.gold });
}
function offer(r: Run) {
    const kind = rollRewardType(r);
    r.rewardType = kind;
    r.rewardGold = economyTrial.goldPerWin;
    r.gold += r.rewardGold;
    let reward: Reward;
    if (kind === "card") {
        const ids = sample(r, Object.keys(cards).filter((id) => !r.owned.includes(id)), economyTrial.cardChoices);
        reward = { id: "bonus", kind: ids.length ? "card" : "empty", cards: ids };
    }
    else if (kind === "item") {
        const ids = sample(r, economy.items.filter((x) => !r.items.includes(x.id)).map((x) => x.id), economyTrial.itemChoices);
        reward = { id: "bonus", kind: ids.length ? "item" : "empty", items: ids };
    }
    else {
        const id = sample(r, economy.relics
            .filter((x) => x.acquisition !== "shop_only" && !r.relics.includes(x.id))
            .map((x) => x.id))[0];
        reward = { id: "bonus", kind: id ? "relic" : "empty", relic: id };
    }
    r.rewards = [reward];
    record(r, "reward_offer", {
        kind,
        gold: r.rewardGold,
        reward: structuredClone(reward),
    });
}
export function applyRunCommand(state: Run, c: RunCommand): Run {
    const r = structuredClone(state);
    if (r.contentVersion !== ECONOMY_VERSION)
        throw Error("경제 콘텐츠 버전 불일치");
    if (c.type === "reward") {
        if (!["start", "reward", "zoneRest"].includes(r.stage))
            throw Error("보상 단계 아님");
        const reward = r.rewards.find((x) => x.id === c.id);
        if (!reward)
            throw Error("잘못된 보상");
        if (r.stage === "start") {
            r.rewards = [];
            record(r, "start_funding", { gold: 100, extra: 0 });
            openShop(r);
        }
        else if (r.stage === "zoneRest") {
            const before = r.hp;
            if (!r.battle || !replaceRecovery(r.battle.player, 8, "heal"))
                r.hp = Math.min(r.maxHp, r.hp + 8);
            if (r.battle)
                r.battle.player.hp = r.hp;
            r.breaksTaken.push(r.completed.length);
            record(r, "zone_rest", { hpBefore: before, hpAfter: r.hp, amount: 8 });
            r.rewards = [];
            nextMap(r);
        }
        else {
            if (reward.kind === "card") {
                if (!c.card || !reward.cards?.includes(c.card))
                    throw Error("카드를 선택하세요");
                acquire(r, "card", c.card);
            }
            else if (reward.kind === "item") {
                if (!c.card || !reward.items?.includes(c.card))
                    throw Error("아이템을 선택하세요");
                acquire(r, "item", c.card);
            }
            else if (reward.kind === "relic")
                acquire(r, "relic", reward.relic!);
            else if (reward.kind === "empty") {
                r.gold += economyTrial.exhaustionGold;
                record(r, "exhaustion_gold", {
                    amount: economyTrial.exhaustionGold,
                    gold: r.gold,
                    originalType: r.rewardType,
                });
            }
            else
                throw Error("현재 강화/추가 보상은 비활성화");
            r.rewards = [];
            afterReward(r);
        }
    }
    else if (c.type === "buy") {
        if (r.stage !== "shop")
            throw Error("상점 아님");
        const x = r.stock.find((x) => x.key === c.key);
        if (!x || x.sold || r.gold < x.price)
            throw Error("품절 또는 골드 부족");
        acquire(r, x.kind, x.id);
        r.gold -= x.price;
        x.sold = true;
        record(r, "purchase", { ...x, gold: r.gold });
    }
    else if (c.type === "leaveShop") {
        if (r.stage !== "shop")
            throw Error("상점 아님");
        r.shopsTaken.push(r.completed.length);
        record(r, "shop_leave", { gold: r.gold });
        nextMap(r);
    }
    else if (c.type === "scenario") {
        if (r.stage !== "map" || !r.choices.includes(c.id))
            throw Error("전투 후보 아님");
        r.chosen = content.run.stages[r.completed.length].encounter;
        r.chosenVariant = c.id;
        r.stage = "deck";
    }
    else if (c.type === "equipItems") {
        if (r.stage !== "deck" ||
            new Set(c.ids).size !== c.ids.length ||
            c.ids.length > economyTrial.itemSlots ||
            c.ids.some((id) => !r.items.includes(id) || !itemById[id]))
            throw Error("아이템 편성 오류");
        r.equippedItems = [...c.ids];
    }
    else if (c.type === "equip") {
        if (r.stage !== "deck" ||
            new Set(c.ids).size !== c.ids.length ||
            c.ids.length > capacity(r) ||
            c.ids.some((id) => !r.owned.includes(id)))
            throw Error("덱 편성 오류");
        r.equipped = [...c.ids];
    }
    else if (c.type === "startBattle") {
        if (r.stage !== "deck" ||
            r.equipped.length < 8 ||
            r.equipped.length > capacity(r))
            throw Error("8장부터 최대 편성 매수까지 필요합니다");
        r.battle = createBattle(r.chosen!, `${r.seed}/${r.completed.length + 1}/${r.chosen}`, r.equipped, r.hp, r.maxHp, r.relics, r.upgrades, r.chosenVariant, { items: r.equippedItems });
        r.initialBattle = structuredClone(r.battle);
        r.stage = "battle";
    }
    else if (c.type === "battle") {
        if (r.stage !== "battle" || !r.battle)
            throw Error("전투 중 아님");
        r.battle = applyCommand(r.battle, c.command);
    }
    else if (c.type === "report") {
        if (r.stage !== "battle" ||
            !r.battle ||
            !["victory", "defeat"].includes(r.battle.phase))
            throw Error("종료 전투 필요");
        r.hp = r.battle.player.hp;
        r.reports.push(structuredClone(r.battle));
        if (r.battle.phase === "defeat")
            r.stage = "failure";
        else {
            r.completed.push(r.chosen!);
            if (r.completed.length === 10)
                r.stage = "success";
            else {
                r.stage = "reward";
                offer(r);
            }
        }
    }
    return r;
}
