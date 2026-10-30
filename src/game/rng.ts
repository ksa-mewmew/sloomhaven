export function seedNumber(seed: string) {
    let n = 2166136261;
    for (const c of seed) {
        n ^= c.charCodeAt(0);
        n = Math.imul(n, 16777619);
    }
    return n >>> 0 || 1;
}
export function random(state: {
    rng: number;
    rngCount?: number;
}) {
    let x = state.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    state.rng = x >>> 0;
    state.rngCount = (state.rngCount ?? 0) + 1;
    return state.rng / 4294967296;
}
export function sample<T>(state: {
    rng: number;
}, items: T[], count = 1): T[] {
    const pool = [...items], out: T[] = [];
    while (pool.length && out.length < count)
        out.push(pool.splice(Math.floor(random(state) * pool.length), 1)[0]);
    return out;
}
