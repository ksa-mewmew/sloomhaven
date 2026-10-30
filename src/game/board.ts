import { boards, encounters } from "./data";
import type { Battle, Board, IntentStep, Step } from "./types";
import { planForcedMove } from "./movement";
import { intentSteps } from "./intents";
export const boardOf = (s: Battle) => boards[s.boardId ?? encounters[s.scenario].board];
export function neighbors(b: Board, node: string) {
    return b.edges
        .flatMap(([a, c]) => (a === node ? [c] : c === node ? [a] : []))
        .sort();
}
export function distance(b: Board, a: string, c: string) {
    const q: [
        string,
        number
    ][] = [[a, 0]], seen = new Set([a]);
    for (let i = 0; i < q.length; i++) {
        const [n, d] = q[i];
        if (n === c)
            return d;
        for (const k of neighbors(b, n))
            if (!seen.has(k)) {
                seen.add(k);
                q.push([k, d + 1]);
            }
    }
    return Infinity;
}
export const living = (s: Battle) => s.enemies.filter((e) => e.hp > 0);
export function paths(s: Battle, start: string, max: number) {
    const occupied = new Set([s.player, ...living(s)].map((e) => e.node).filter((n) => n !== start)), out: string[][] = [[]];
    function walk(p: string[], n: string) {
        if (p.length >= max)
            return;
        for (const k of neighbors(boardOf(s), n))
            if (!occupied.has(k) && !p.includes(k) && k !== start) {
                const next = [...p, k];
                out.push(next);
                walk(next, k);
            }
    }
    walk([], start);
    return out;
}
export function pushNodes(s: Battle, target: string) {
    const e = s.enemies.find((e) => e.id === target);
    return e && e.hp > 0 ? planForcedMove(s, s.player, e, 1, "push").path : [];
}
export function playerTargets(s: Battle, step: Step) {
    return living(s)
        .filter((e) => step.target === "all_adjacent_enemies"
        ? distance(boardOf(s), s.player.node, e.node) === 1
        : step.range === "any" ||
            distance(boardOf(s), s.player.node, e.node) <= (step.range ?? 1))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((e) => e.id);
}
export function threats(s: Battle, e: Battle["player"]) {
    if (e.disarm > 0)
        return [];
    return [
        ...new Set(intentSteps(e.intent).flatMap((step, index) => stepThreats(s, e, step, index))),
    ];
}
export function stepThreats(s: Battle, e: Battle["player"], i: IntentStep, index: number) {
    const mark = e.intent?.kind === "sequence" ? e.marks?.[index] : e.mark;
    if (i.kind === "adjacent_all")
        return neighbors(boardOf(s), e.node);
    if (i.kind === "attack" || i.kind === "status")
        return boardOf(s)
            .nodes.filter((n) => distance(boardOf(s), e.node, n.id) <= (i.range ?? 1))
            .map((n) => n.id);
    if (i.kind === "marked" &&
        mark &&
        distance(boardOf(s), e.node, mark) <= (i.range ?? 1))
        return [mark];
    return [];
}
export function enemyTargets(s: Battle, e: Battle["enemies"][number], step: IntentStep, index = 0) {
    return s.player.hp > 0 &&
        stepThreats(s, e, step, index).includes(s.player.node)
        ? [s.player]
        : [];
}
