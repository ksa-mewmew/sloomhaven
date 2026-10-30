import type { Run } from "./campaign";
import { ECONOMY_VERSION, itemById, relicById, economyTrial } from "./economy";
import { assertBattle } from "./engine";
import { cards, content, encounters } from "./data";
import { SCENARIO_ID_SCHEME, preserveScenarioSave, remapOldRun } from "./scenarioIds";
import legacyPhase0 from "../content/legacy-phase0.json";
import { LEGACY_RULES, PHASE1 } from "./rulesets";
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
        scenarioIdScheme: SCENARIO_ID_SCHEME,
        foundationVersion: 1,
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
        if (d.scenarioIdScheme === undefined) remapOldRun(r);
        else if (d.scenarioIdScheme !== SCENARIO_ID_SCHEME)
            throw Error("지원하지 않는 시나리오 ID 버전");
        if (d.foundationVersion === undefined) {
            if (r.maxHp < 40) throw Error("이전 HP 규칙을 안전하게 식별할 수 없습니다");
            r.ruleset = LEGACY_RULES;
            r.medkits = 0;
            for (const b of [r.battle, r.initialBattle, ...(r.reports ?? [])]) if (b) {
                b.ruleset = LEGACY_RULES;
                b.boardId = legacyPhase0.encounters.find(e => e.id === b.scenario)?.board;
                b.partyMode = "solo";
                b.medkits = 0;
            }
        } else if (d.foundationVersion !== 1) throw Error("지원하지 않는 전장/HP 규칙 버전");
        if (![LEGACY_RULES, PHASE1].includes(r.ruleset) || !Number.isInteger(r.medkits) || r.medkits < 0)
            throw Error("방문 규칙 또는 응급약 저장 오류");
        if (r.battle && (r.battle.ruleset !== r.ruleset || (r.stage === "battle" && r.battle.medkits !== r.medkits)))
            throw Error("전투와 방문의 응급약/규칙 불일치");
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
        const variantIds = new Set(Object.values(encounters).flatMap(e => e.variants.map(v => v.id)));
        if (!Array.isArray(r.choices) || r.choices.some(id => !variantIds.has(id)) ||
            (r.chosen !== undefined && !encounters[r.chosen]) ||
            (r.chosenVariant !== undefined && !encounters[r.chosen!]?.variants.some(v => v.id === r.chosenVariant)))
            throw Error("시나리오 선택 저장 오류");
        for (const b of [r.initialBattle, ...r.reports].filter(Boolean)) {
            if (!b || !encounters[b.scenario]?.variants.some(v => v.id === b.variant))
                throw Error("전투 기록 시나리오 오류");
            assertBattle(b);
        }
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
export function loadRun(store: Pick<Storage, "getItem" | "setItem">): Run {
    preserveScenarioSave(store, SAVE_KEY);
    const text = store.getItem(SAVE_KEY);
    if (!text) throw Error("저장된 방문이 없습니다");
    const run = deserializeRun(text);
    const old = JSON.parse(text);
    if (old.scenarioIdScheme === undefined && old.run.battle && run.battle) {
        const before = "askew-apartment/timing/" + old.run.battle.seed + "/" + old.run.battle.variant;
        const after = "askew-apartment/timing/" + run.battle.seed + "/" + run.battle.variant;
        const timing = store.getItem(before);
        if (before !== after && timing !== null && store.getItem(after) === null)
            store.setItem(after, timing);
    }
    return run;
}
