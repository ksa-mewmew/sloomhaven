import { cards, encounters, content } from "./data";
import { assertBattle } from "./engine";
import type { Run } from "./campaign-v031";
export const LEGACY_SAVE_KEY = "third-day-holiday/run/v1";
export const LEGACY_ARCHIVE_KEY = "askew-apartment/archive/v0.1";
export const PREVIOUS_SAVE_KEY = "askew-apartment/run/v2";
export const PREVIOUS_ARCHIVE_KEY = "askew-apartment/archive/v0.2";
export const V03_SAVE_KEY = "askew-apartment/run/v3";
export const V03_ARCHIVE_KEY = "askew-apartment/archive/v0.3";
export const SAVE_KEY = "askew-apartment/run/v3.1";
export function preserveV03(storage: Pick<Storage, "getItem" | "setItem">) {
    const old = storage.getItem(V03_SAVE_KEY);
    if (old && !storage.getItem(V03_ARCHIVE_KEY))
        storage.setItem(V03_ARCHIVE_KEY, old);
    return !!old;
}
export function preservePrevious(storage: Pick<Storage, "getItem" | "setItem">) {
    const old = storage.getItem(PREVIOUS_SAVE_KEY);
    if (old && !storage.getItem(PREVIOUS_ARCHIVE_KEY))
        storage.setItem(PREVIOUS_ARCHIVE_KEY, old);
    return !!old;
}
export function preserveLegacy(storage: Pick<Storage, "getItem" | "setItem">) {
    const old = storage.getItem(LEGACY_SAVE_KEY);
    if (old && !storage.getItem(LEGACY_ARCHIVE_KEY))
        storage.setItem(LEGACY_ARCHIVE_KEY, old);
    return !!old;
}
export function serializeRun(r: Run) {
    return JSON.stringify({
        saveVersion: 3,
        dataVersion: 3,
        contentVersion: "0.3.1-proposal-1",
        run: r,
    });
}
export function deserializeRun(text: string): Run {
    try {
        const data = JSON.parse(text);
        if (data.saveVersion !== 3 ||
            data.dataVersion !== 3 ||
            data.contentVersion !== "0.3.1-proposal-1")
            throw Error("구버전 저장은 별도 보존됩니다. v0.3에서는 새 런을 시작하세요");
        const r = data.run as Run;
        if (r.version !== 3 ||
            r.schemaVersion !== 3 ||
            r.contentVersion !== "0.3.1-proposal-1" ||
            ![
                "start",
                "map",
                "deck",
                "battle",
                "report",
                "reward",
                "zoneRest",
                "success",
                "failure",
            ].includes(r.stage) ||
            !Number.isInteger(r.rng) ||
            r.rng < 0 ||
            typeof r.seed !== "string" ||
            !Number.isFinite(r.hp) ||
            r.maxHp <= 0 ||
            r.hp > r.maxHp ||
            !Array.isArray(r.owned) ||
            r.owned.some((id) => !cards[id]) ||
            new Set(r.owned).size !== r.owned.length ||
            !Array.isArray(r.equipped) ||
            r.equipped.some((id) => !r.owned.includes(id)) ||
            new Set(r.equipped).size !== r.equipped.length ||
            r.equipped.length > 8 + (r.relics.includes("R02") ? 1 : 0) ||
            !Array.isArray(r.completed) ||
            r.completed.length > content.run.totalBattles ||
            r.completed.some((id, i) => id !== content.run.stages[i].encounter) ||
            !Array.isArray(r.history) ||
            !Array.isArray(r.breaksTaken) ||
            !Number.isInteger(r.rngCount))
            throw Error("저장 구조 불일치");
        if (r.battle) {
            if (!encounters[r.battle.scenario] ||
                r.battle.version !== 3 ||
                r.battle.contentVersion !== "0.3.1-proposal-1" ||
                !encounters[r.battle.scenario].variants.some((v) => v.id === r.battle!.variant) ||
                !Array.isArray(r.battle.queue) ||
                !Array.isArray(r.battle.commands))
                throw Error("전투 저장 구조 오류");
            assertBattle(r.battle);
        }
        return r;
    }
    catch (e) {
        throw Error(`저장 파일을 읽을 수 없습니다. ${String(e)}. 새 방문을 시작할 수 있습니다.`);
    }
}
