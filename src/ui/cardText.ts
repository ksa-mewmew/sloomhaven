import { statusNames } from "../game/status";
import type { Step, IntentStep } from "../game/types";
import type { Battle } from "../game/types";
import { faceSteps } from "../game/engine";
import type { simulateIntentPreview } from "../game/preview";
export function projectedIntentText(steps: ReturnType<typeof simulateIntentPreview>["steps"], buff = 0, weak = 0) {
    return steps.map(x => {
        const text = intentText(x.step, buff, weak);
        weak = Math.max(0, weak - x.hits.length);
        if (x.step.kind === "buff_attack") buff += x.step.amount ?? 0;
        return text;
    }).join(" → ");
}
function attackAmounts(i: IntentStep, buff: number, weak: number) {
    const values = Array.from({ length: i.hits ?? 1 }, (_, hit) => Math.max(0, (i.damage ?? 0) + buff - (weak > hit ? 2 : 0)));
    return new Set(values).size === 1
        ? `${values[0]} ×${values.length}`
        : `${values.join("→")} (${values.length}회)`;
}
export function executionInfo(s: Battle) {
    const p = s.prompt;
    if (p?.kind !== "effect")
        return undefined;
    const finish = s.queue.find((t) => t.kind === "finish");
    const action = finish?.kind === "finish" && (p.card || p.step.type === "push")
        ? finish.action
        : undefined;
    const card = p.card ?? action?.card, side = p.side ?? action?.side;
    const count = p.stepCount ?? (action ? faceSteps(s, action).length : 1);
    const remaining = s.queue.filter((t) => t.kind === "step" && t.card === card).length;
    return {
        card,
        side,
        count,
        index: p.stepIndex ?? Math.max(1, count - remaining),
    };
}
export function compactIntent(i: IntentStep, buff = 0, weak = 0): string {
    if (i.kind === "sequence") {
        let bonus = buff;
        return (i.steps ?? [])
            .map((step) => {
            const label = compactIntent(step, bonus, weak);
            if (step.kind === "buff_attack")
                bonus += step.amount ?? 0;
            return label;
        })
            .join(" → ");
    }
    if (i.kind === "move")
        return `${{ approach: "접근", retreat: "후퇴", maintain_range: "거리 유지" }[i.mode ?? "approach"]} ${i.maxSteps}${i.mode === "maintain_range" ? `(R${i.preferredRange})` : ""}`;
    if (i.kind === "push" || i.kind === "pull")
        return `${i.kind === "push" ? "밀치기" : "당기기"} ${i.distance} · 적중 대상`;
    if (i.kind === "status")
        return `상태 부여 · 추적 (사거리 ${i.range ?? 1}) ${i.status ? statusNames[i.status.status] : "상태"} ${i.status?.stacks} · 직접 피해 없음`;
    if (i.kind === "attack" || i.kind === "marked" || i.kind === "adjacent_all")
        return `${i.kind === "marked" ? `표식${i.range ?? 1}` : i.kind === "attack" ? `추적R${i.range ?? 1}` : "인접"} 공${attackAmounts(i, buff, weak).replaceAll(" ", "")}${i.status ? ` ${statusNames[i.status.status]}${i.status.stacks}` : ""}`;
    return `${i.kind === "block" ? "방" : i.kind === "heal" ? "회복" : "공격력+"}${i.amount}`;
}
export function describe(x: Step): string {
    const range = x.range === "any"
        ? " · 거리 무제한"
        : x.range && !(x.type === "attack" && x.range === 1)
            ? ` · 사거리 ${x.range}`
            : "";
    const cond: Record<string, string> = {
        gained_block_this_turn: "이번 턴 방어도 획득 시",
        target_original_intent_nonattack: "대상의 원래 의도가 비공격이면",
        target_intent_nonattack: "대상이 비공격 의도라면",
        no_adjacent_enemies_after_move: "인접 적이 없으면",
        adjacent_enemy_after_move: "인접 적이 있으면",
        no_hp_loss_during_enemy_phase: "적 단계 HP 피해 없으면",
    };
    const text: Record<string, string> = {
        attack: `공격 ${x.damage}${x.pierce_block ? " (방어 무시)" : ""}${x.bonus_damage ? ` / ${cond[x.condition!] ?? x.condition} +${x.bonus_damage}` : ""}${range}${x.target === "all_adjacent_enemies" ? " · 모든 인접 적" : ""}`,
        move: `이동 ${x.distance}`,
        block: `방어도 ${x.amount}`,
        status: `${statusNames[x.status ?? "exposed"]} ${x.stacks}${range}${x.target === "all_adjacent_enemies" ? " · 모든 인접 적" : x.target === "all_enemies" ? " · 모든 적" : x.target === "last_attack_target" ? " · 직전 공격 대상" : ""}`,
        push: `밀치기 ${x.distance}${x.target === "last_attack_target" ? " · 직전 공격 대상" : " · 인접 적 새로 선택"}`,
        pull: `당기기 ${x.distance}${x.target === "last_attack_target" ? " · 직전 공격 대상" : " · 적 새로 선택"}`,
        heal: `체력 회복 ${x.amount}${x.timing ? " (적 단계 종료)" : ""}`,
        self_hp_loss: `체력 ${x.amount} 지불 (필수)`,
        retain_block: "전투 동안 방어도 보존",
        counter: `첫 인접 피격 반격 ${x.damage}`,
    };
    return (text[x.type] +
        (x.condition && !x.bonus_damage ? ` · ${cond[x.condition]}` : ""));
}
export function intentText(i: IntentStep, buff = 0, weak = 0): string {
    if (i.kind === "sequence") {
        let attackBuff = buff;
        return (i.steps ?? [])
            .map((step) => {
            const text = intentText(step, attackBuff, weak);
            if (step.kind === "buff_attack")
                attackBuff += step.amount ?? 0;
            return text;
        })
            .join(" → ");
    }
    if (i.kind === "move" ||
        i.kind === "push" ||
        i.kind === "pull" ||
        i.kind === "status")
        return compactIntent(i, buff, weak);
    return ["attack", "marked", "adjacent_all"].includes(i.kind)
        ? `${i.kind === "marked" ? `지정 칸 (사거리 ${i.range ?? 1}) ` : i.kind === "attack" && (i.range ?? 1) > 1 ? `사거리 ${i.range} ` : i.kind === "adjacent_all" ? "인접 전체 " : ""}공격 ${attackAmounts(i, buff, weak).replace(" ×1", "")}${i.status ? ` + ${statusNames[i.status.status]} ${i.status.stacks}` : ""}`
        : i.kind === "block"
            ? `방어도 ${i.amount}`
            : i.kind === "heal"
                ? `회복 ${i.amount}`
                : `공격력 +${i.amount}`;
}
