import type { Status, Unit } from "./types";
export const statusKeys: Status[] = [
    "exposed",
    "weak",
    "poison",
    "disarm",
    "bind",
    "bleed",
];
export const statusNames: Record<Status, string> = {
    exposed: "노출",
    weak: "약화",
    poison: "중독",
    disarm: "무장해제",
    bind: "속박",
    bleed: "출혈",
};
export const statusHelp: Record<Status, string> = {
    exposed: "공격에 맞을 때 피해 +2, 1 감소. 방어도로 막아도 감소합니다.",
    weak: "유효한 공격 이벤트의 피해 -2(최소 0), 1 감소. 광역은 모든 대상에 적용하고 한 번만 소비합니다.",
    poison: "자기 행동 종료 시 방어도를 무시하고 HP -2, 1 감소합니다.",
    disarm: "해당 차례 모든 공격 단계 생략. 이동·방어·치료·독립 상태 부여는 유지. 자기 행동 종료 시 1 감소합니다.",
    bind: "이동 단계 하나를 통째로 생략하고 1 감소. 이동 시도가 없으면 유지됩니다.",
    bleed: "자기 행동 종료 시 방어도를 무시하고 수치만큼 HP 감소. 자동 감소 없음. 다음 양수 방어도 또는 치료 효과 하나를 대신 소모해 전부 제거합니다.",
};
export function statusText(u: Unit) {
    return (statusKeys
        .filter((k) => u[k] > 0)
        .map((k) => `${statusNames[k]} ${u[k]}`)
        .join(" · ") || "상태이상 없음");
}
export function replaceRecovery(u: Unit, amount: number, kind: "block" | "heal") {
    if (u.hp <= 0 ||
        amount <= 0 ||
        u.bleed <= 0 ||
        (kind === "heal" && u.hp >= u.maxHp))
        return false;
    u.bleed = 0;
    return true;
}
