import type { Run } from "./campaign";
import { ECONOMY_VERSION, itemById, relicById, economyTrial } from "./economy";
import { assertBattle } from "./engine";
import { cards, content, encounters } from "./data";
export { LEGACY_SAVE_KEY, LEGACY_ARCHIVE_KEY, PREVIOUS_SAVE_KEY, PREVIOUS_ARCHIVE_KEY, V03_SAVE_KEY, V03_ARCHIVE_KEY, preserveLegacy, preservePrevious, preserveV03, } from "./save-v031";
export const V031_SAVE_KEY = "askew-apartment/run/v3.1";
export const V031_ARCHIVE_KEY = "askew-apartment/archive/v0.3.1";
export const SAVE_KEY = "askew-apartment/run/v3.2";
export function preserveV031(s: Pick<Storage, "getItem" | "setItem">) {
    const old = s.getItem(V031_SAVE_KEY);
    if (old && !s.getItem(V031_ARCHIVE_KEY))
        s.setItem(V031_ARCHIVE_KEY, old);
    return !!old;
}
export function serializeRun(run: Run) {
    return JSON.stringify({
        saveVersion: 3,
        dataVersion: 3,
        contentVersion: ECONOMY_VERSION,
        run,
    });
}
export function deserializeRun(text: string): Run {
    try {
        const d = JSON.parse(text), r = d.run as Run;
        if (d.contentVersion !== ECONOMY_VERSION ||
            d.saveVersion !== 3 ||
            d.dataVersion !== 3 ||
            r.contentVersion !== ECONOMY_VERSION)
            throw Error("이전 저장은 원본 보존되며 새 경제로 변환하지 않습니다");
        if (![
            "start",
            "shop",
            "map",
            "deck",
            "battle",
            "report",
            "reward",
            "zoneRest",
            "success",
            "failure",
        ].includes(r.stage) ||
            r.version !== 3 ||
            r.schemaVersion !== 3 ||
            !Array.isArray(r.completed) ||
            r.completed.length > 10 ||
            r.completed.some((id, i) => id !== content.run.stages[i].encounter) ||
            !Array.isArray(r.reports) ||
            !Array.isArray(r.breaksTaken) ||
            !Array.isArray(r.shopsTaken) ||
            !Number.isInteger(r.gold) ||
            r.gold < 0 ||
            !Number.isFinite(r.hp) ||
            r.hp > r.maxHp ||
            r.maxHp <= 0 ||
            !Number.isInteger(r.rng) ||
            !Number.isInteger(r.rngCount))
            throw Error("저장 구조 오류");
        for (const [ids, known] of [
            [r.owned, cards],
            [r.items, itemById],
            [r.relics, relicById],
        ] as const)
            if (!Array.isArray(ids) ||
                new Set(ids).size !== ids.length ||
                ids.some((id) => !known[id]))
                throw Error("보유 목록 오류");
        if (!Array.isArray(r.equipped) ||
            new Set(r.equipped).size !== r.equipped.length ||
            r.equipped.length > 8 + (r.relics.includes("R03") ? 1 : 0) ||
            r.equipped.some((id) => !r.owned.includes(id)) ||
            !Array.isArray(r.equippedItems) ||
            r.equippedItems.length > economyTrial.itemSlots ||
            r.equippedItems.some((id) => !r.items.includes(id)) ||
            new Set(r.equippedItems).size !== r.equippedItems.length ||
            !Array.isArray(r.stock) ||
            !Array.isArray(r.history))
            throw Error("경제 저장 오류");
        if (r.battle) {
            if (!encounters[r.battle.scenario] ||
                !encounters[r.battle.scenario].variants.some((v) => v.id === r.battle!.variant) ||
                !Array.isArray(r.battle.queue) ||
                !Array.isArray(r.battle.commands) ||
                r.battle.contentVersion !== ECONOMY_VERSION ||
                !r.battle.economy)
                throw Error("전투 콘텐츠 오류");
            assertBattle(r.battle);
        }
        return r;
    }
    catch (e) {
        throw Error("저장 파일을 읽을 수 없습니다: " + String(e));
    }
}
