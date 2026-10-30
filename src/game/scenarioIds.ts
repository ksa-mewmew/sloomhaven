import type { Run } from "./campaign";
import type { Battle } from "./types";
export const SCENARIO_ID_SCHEME = "sequential-s09-stage9-s10-boss-v1";
export const SCENARIO_SAVE_BACKUP_KEY = "askew-apartment/archive/v3.2-before-sequential-ids";
const mapping: Record<string, string> = {
  S09: "S10", S10: "S09", "S09-A": "S10-A", "S10-A": "S09-A", "S10-B": "S09-B",
};
export const remapOldScenarioId = (id: string) => mapping[id] ?? id;
function remapBattle(b: Battle) {
  b.scenario = remapOldScenarioId(b.scenario);
  b.variant = remapOldScenarioId(b.variant);
}
export function remapOldRun(r: Run) {
  r.completed = r.completed.map(remapOldScenarioId);
  r.choices = r.choices.map(remapOldScenarioId);
  if (r.chosen) r.chosen = remapOldScenarioId(r.chosen);
  if (r.chosenVariant) r.chosenVariant = remapOldScenarioId(r.chosenVariant);
  if (r.battle) remapBattle(r.battle);
  if (r.initialBattle) remapBattle(r.initialBattle);
  r.reports.forEach(remapBattle);
  return r;
}
type Store = Pick<Storage, "getItem" | "setItem">;
export function preserveScenarioSave(store: Store, key: string) {
  const text = store.getItem(key);
  if (!text) return;
  let scheme: unknown;
  try { scheme = JSON.parse(text).scenarioIdScheme; } catch { scheme = undefined; }
  if (scheme !== SCENARIO_ID_SCHEME && store.getItem(SCENARIO_SAVE_BACKUP_KEY) === null)
    store.setItem(SCENARIO_SAVE_BACKUP_KEY, text);
}
export function migrateLocalScenarioRecords(store: Store) {
  for (const key of ["third-day/discovered", "third-day/practice-log"]) {
    const marker = key + "/scenario-id-scheme";
    const scheme = store.getItem(marker);
    if (scheme === SCENARIO_ID_SCHEME) continue;
    if (scheme !== null) throw Error("알 수 없는 발견 기록 ID 버전: " + scheme);
    const text = store.getItem(key);
    if (text !== null) {
      const backup = key + "/before-sequential-ids";
      if (store.getItem(backup) === null) store.setItem(backup, text);
      const value = JSON.parse(store.getItem(backup)!);
      if (key === "third-day/discovered") {
        if (!Array.isArray(value) || value.some(id => typeof id !== "string"))
          throw Error("발견 기록 구조 오류 · 원본은 보존되었습니다");
        store.setItem(key, JSON.stringify(value.map(remapOldScenarioId)));
      } else if (value !== null) {
        if (typeof value.scenario !== "string" || typeof value.variant !== "string")
          throw Error("연습 기록 구조 오류 · 원본은 보존되었습니다");
        remapBattle(value);
        store.setItem(key, JSON.stringify(value));
      }
    }
    store.setItem(marker, SCENARIO_ID_SCHEME);
  }
}
