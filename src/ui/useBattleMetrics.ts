import { useEffect, useRef, useState } from "react";
export function useBattleMetrics(key: string, ended: boolean) {
    const store = "askew-apartment/timing/" + key;
    const [elapsed, setElapsed] = useState(0);
    const state = useRef({ start: performance.now(), prior: 0, inputs: 0 });
    useEffect(() => {
        let saved = { seconds: 0, inputs: 0 };
        try {
            saved = JSON.parse(localStorage.getItem(store) ?? '{"seconds":0,"inputs":0}');
        }
        catch { }
        state.current = {
            start: performance.now(),
            prior: saved.seconds,
            inputs: saved.inputs,
        };
        const tick = () => {
            const seconds = state.current.prior + (performance.now() - state.current.start) / 1000;
            setElapsed(seconds);
            localStorage.setItem(store, JSON.stringify({ seconds, inputs: state.current.inputs }));
        };
        tick();
        if (ended)
            return;
        const timer = setInterval(tick, 1000);
        return () => {
            clearInterval(timer);
            tick();
        };
    }, [store, ended]);
    return {
        seconds: elapsed,
        input: () => state.current.inputs++,
        inputs: () => state.current.inputs,
        reset: () => {
            state.current = { start: performance.now(), prior: 0, inputs: 0 };
            localStorage.removeItem(store);
            setElapsed(0);
        },
    };
}
