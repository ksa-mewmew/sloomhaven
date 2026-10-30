import { boardOf, distance, living, neighbors } from "./board";
import { intentSteps } from "./intents";
import ports from "./forced-directions.v0.3.1.json";
import type { Battle, Board, IntentStep, Unit } from "./types";
export const nodeOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function reachable(b: Board, start: string, max: number, occupied: Set<string>) {
    const found = new Map<string, string[]>([[start, []]]), queue = [start];
    for (let i = 0; i < queue.length; i++) {
        const n = queue[i], path = found.get(n)!;
        if (path.length >= max)
            continue;
        for (const next of neighbors(b, n).sort(nodeOrder))
            if (!occupied.has(next) && !found.has(next)) {
                found.set(next, [...path, next]);
                queue.push(next);
            }
    }
    return found;
}
export function movementTarget(s: Battle, actor: Unit, index: number) {
    const following = intentSteps(actor.intent)
        .map((step, i) => ({ step, i }))
        .slice(index + 1)
        .find(({ step }) => ["attack", "adjacent_all", "marked"].includes(step.kind));
    return following?.step.kind === "marked"
        ? (actor.marks?.[following.i] ?? actor.mark ?? s.player.node)
        : s.player.node;
}
function distancesFrom(b: Board, sources: string[]) {
    const result = new Map(sources.map((n) => [n, 0])), queue = [...sources];
    for (let i = 0; i < queue.length; i++)
        for (const next of neighbors(b, queue[i]))
            if (!result.has(next)) {
                result.set(next, result.get(queue[i])! + 1);
                queue.push(next);
            }
    return result;
}
export function planEnemyMove(s: Battle, actor: Unit, step: IntentStep, index = 0) {
    const b = boardOf(s), target = step.mode === "maintain_range"
        ? movementTarget(s, actor, index)
        : s.player.node;
    const occupied = new Set([s.player, ...living(s)]
        .filter((u) => u.id !== actor.id)
        .map((u) => u.node));
    const targetDistances = distancesFrom(b, [target]);
    const candidates = [
        ...reachable(b, actor.node, step.maxSteps ?? 0, occupied),
    ].map(([node, path]) => ({
        node,
        path,
        d: targetDistances.get(node) ?? Infinity,
    }));
    const range = step.preferredRange ?? 1, inRange = candidates.filter((c) => c.d <= range);
    const firingNodes = b.nodes
        .filter((n) => (targetDistances.get(n.id) ?? Infinity) <= range)
        .map((n) => n.id);
    const firingDistances = step.mode === "maintain_range" && !inRange.length
        ? distancesFrom(b, firingNodes)
        : new Map<string, number>();
    const firingDistance = (node: string) => firingDistances.get(node) ?? Infinity;
    const score = (c: (typeof candidates)[number]) => step.mode === "retreat"
        ? [-c.d]
        : step.mode === "maintain_range"
            ? inRange.length
                ? [c.d <= range ? 0 : 1, -c.d]
                : [firingDistance(c.node), c.d]
            : [c.d];
    candidates.sort((a, b) => {
        const aa = score(a), bb = score(b);
        for (let i = 0; i < aa.length; i++)
            if (aa[i] !== bb[i])
                return aa[i] - bb[i];
        return (a.path.length - b.path.length ||
            nodeOrder(a.node, b.node) ||
            nodeOrder(a.path.join("/"), b.path.join("/")));
    });
    const best = candidates[0];
    return {
        path: best?.path ?? [],
        end: best?.node ?? actor.node,
        target,
        reason: best?.path.length ? "moved" : "no_better_reachable_tile",
    };
}
export type ForcedPlan = {
    path: string[];
    direction: string;
    reason: string;
    source: string;
    target: string;
    max: number;
};
export function planForcedMove(s: Battle, source: Unit, target: Unit, max: number, kind: "push" | "pull" = "push"): ForcedPlan {
    if (source.node === target.node)
        throw Error("강제 이동 시전자/대상 점유 충돌");
    const b = boardOf(s), occupied = new Set([s.player, ...living(s)]
        .filter((u) => u.id !== target.id)
        .map((u) => u.node));
    const path: string[] = [], start = target.node;
    let current = start, previous: string | undefined, direction = "정의 없음", reason = "maximum_reached";
    let nextNode: (node: string) => string | undefined;
    if (b.kind === "ring") {
        const ring = [...b.nodes].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)), n = ring.length;
        const si = ring.findIndex((v) => v.id === source.node), ti = ring.findIndex((v) => v.id === start);
        let sign = (ti - si + n) % n <= (si - ti + n) % n ? 1 : -1;
        if (kind === "pull")
            sign *= -1;
        direction = sign === 1 ? "시계 방향 ↻" : "반시계 방향 ↺";
        nextNode = (node) => ring[(ring.findIndex((v) => v.id === node) + sign + n) % n]?.id;
    }
    else if (b.kind === "line" || b.kind === "grid") {
        const a = b.nodes.find((n) => n.id === source.node)!, t = b.nodes.find((n) => n.id === start)!;
        const dx = t.x! - a.x!, dy = t.y! - a.y!, horizontal = Math.abs(dx) >= Math.abs(dy);
        const sign = (kind === "push" ? 1 : -1) * (horizontal ? Math.sign(dx) : Math.sign(dy));
        const vx = horizontal ? sign : 0, vy = horizontal ? 0 : sign;
        direction =
            vx > 0 ? "동쪽 →" : vx < 0 ? "서쪽 ←" : vy > 0 ? "남쪽 ↓" : "북쪽 ↑";
        nextNode = (node) => {
            const p = b.nodes.find((n) => n.id === node)!;
            return b.nodes.find((n) => n.x === p.x! + vx && n.y === p.y! + vy)?.id;
        };
    }
    else {
        const routes = reachable(b, source.node, b.nodes.length, new Set()), route = routes.get(start);
        previous = route?.length ? [source.node, ...route].at(-2) : undefined;
        const straight = (ports as Record<string, Record<string, string>>)[b.id] ?? {};
        const first = kind === "pull"
            ? previous
            : previous
                ? straight[`${previous}>${start}`]
                : undefined;
        direction = first ? `고정 포트 ${start} → ${first}` : "직진 포트 없음";
        let initial = true;
        nextNode = (node) => {
            if (initial) {
                initial = false;
                return first;
            }
            return previous ? straight[`${previous}>${node}`] : undefined;
        };
    }
    for (let i = 0; i < max; i++) {
        const next = nextNode(current);
        if (!next || !neighbors(b, current).includes(next)) {
            reason = "no_straight_continuation";
            break;
        }
        if (occupied.has(next)) {
            reason = "occupied";
            break;
        }
        if (path.includes(next) || next === start) {
            reason = "cycle_stopped";
            break;
        }
        const before = distance(b, current, source.node), after = distance(b, next, source.node);
        if (kind === "push" ? after <= before : after >= before) {
            reason = "distance_would_reverse";
            break;
        }
        path.push(next);
        previous = current;
        current = next;
    }
    return { path, direction, reason, source: source.node, target: start, max };
}
