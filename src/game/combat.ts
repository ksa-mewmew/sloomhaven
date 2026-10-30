import type { Unit } from "./types";
export function calculateHit(attacker: Unit, target: Unit, base: number, pierce = false) {
    let damage = Math.max(0, base + attacker.buff - (attacker.weak > 0 ? 2 : 0));
    if (target.exposed > 0)
        damage += 2;
    const blocked = pierce ? 0 : Math.min(target.block, damage);
    return {
        damage,
        blocked,
        hp: damage - blocked,
        weak: Math.max(0, attacker.weak - 1),
        exposed: Math.max(0, target.exposed - 1),
        block: target.block - blocked,
    };
}
