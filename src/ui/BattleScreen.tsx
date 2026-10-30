import { EconomyControls } from "./EconomyControls";
import { statusText } from "../game/status";
import { StatusHelp } from "./StatusHelp";
import { useEffect, useRef, useState, type ReactNode, type CSSProperties, } from "react";
import { createPortal } from "react-dom";
import { planForcedMove } from "../game/movement";
import { simulateIntentPreview, attackPreview, playerAttackPreview, } from "../game/preview";
import { battleSummary } from "../game/telemetry";
import { useBattleMetrics } from "./useBattleMetrics";
import { archetypes, cards, encounters } from "../game/data";
import { flavor, enemyFlavor, cardFlavor, logText } from "../game/presentation";
import { boardOf, living, threats } from "../game/board";
import { projectEnemyPhase, faceSteps, itemAvailable } from "../game/engine";
import type { Action, Battle, Board, Command, Side } from "../game/types";
import { compactIntent, describe, intentText, executionInfo } from "./cardText";
export { describe, intentText } from "./cardText";
export const scenarioName = (id: string) => (flavor.scenarios as Record<string, {
    name: string;
}>)[id]?.name ??
    encounters[id]?.name ??
    id;
const sideName = (side: Side) => (side === "top" ? "▲ 상단" : "▼ 하단");
export function Modal({ title, children, close, }: {
    title: string;
    children: ReactNode;
    close?: () => void;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const restore = useRef(document.activeElement as HTMLElement | null);
    useEffect(() => {
        const before = restore.current;
        ref.current?.showModal();
        const trap = (event: KeyboardEvent) => {
            if (event.key !== "Tab")
                return;
            const items = [
                ...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? []),
            ].filter((element) => element.getClientRects().length);
            const first = items[0], last = items.at(-1);
            if (!first) {
                event.preventDefault();
                ref.current?.focus();
                return;
            }
            if (!ref.current?.contains(document.activeElement) ||
                (event.shiftKey && document.activeElement === first) ||
                (!event.shiftKey && document.activeElement === last)) {
                event.preventDefault();
                (event.shiftKey ? last : first)?.focus();
            }
        };
        document.addEventListener("keydown", trap, true);
        return () => {
            document.removeEventListener("keydown", trap, true);
            ref.current?.close();
            queueMicrotask(() => {
                if (before?.isConnected)
                    before.focus();
            });
        };
    }, []);
    return createPortal(<dialog ref={ref} className="terminal-modal" aria-label={title} onCancel={(e) => {
            e.preventDefault();
            close?.();
        }}>
      <header>
        <h2>{title}</h2>
        {close && <button onClick={close}>닫기 [Esc]</button>}
      </header>
      {children}
    </dialog>, document.body);
}
export function CardView({ id, onPick, selected, upgrade = [], }: {
    id: string;
    onPick?: (side: Side) => void;
    selected?: string;
    upgrade?: Side[];
}) {
    const c = cards[id];
    return (<article className={"card " + (selected ? "selected" : "")} data-card={id}>
      <header>
        <small>{id}</small> <strong>{c.name}</strong>
      </header>
      {(["top", "bottom"] as const).map((side) => (<div className="face" key={side}>
          <b>
            {sideName(side)} {upgrade.includes(side) ? "＋ 강화" : ""}{" "}
            {c[side].loss && <em>소실</em>}
          </b>
          <p>
            {faceSteps({ upgrades: { [id]: upgrade } }, { card: id, side, basic: false })
                .map(describe)
                .join(" → ")}
          </p>
          {onPick && (<button onClick={() => onPick(side)}>
              {side === "top" ? "상단" : "하단"} 배정
            </button>)}
        </div>))}
      <p className="card-flavor">{cardFlavor(id)}</p>
    </article>);
}
export function boardProjection(b: Board) {
    const foldedLine = [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
        [4, 1],
        [3, 1],
        [2, 1],
        [1, 1],
    ];
    const ring = [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [3, 1],
        [2, 1],
        [1, 1],
        [0, 1],
    ];
    const minY = Math.min(...b.nodes.map((n) => n.y ?? 0));
    return b.nodes.map((n, i) => ({
        id: n.id,
        x: b.kind === "ring"
            ? ring[i][0]
            : b.kind === "line"
                ? foldedLine[i][0]
                : (n.x ?? 0),
        y: b.kind === "ring"
            ? ring[i][1]
            : b.kind === "line"
                ? foldedLine[i][1]
                : (n.y ?? 0) - minY,
    }));
}
export function BoardView({ battle: s, onNode, active = [], showThreats = true, showMarks = true, damage = {}, predicted = [], }: {
    battle: Battle;
    onNode?: (id: string) => void;
    active?: string[];
    showThreats?: boolean;
    showMarks?: boolean;
    damage?: Record<string, number>;
    predicted?: string[];
}) {
    const b = boardOf(s), coords = boardProjection(b), danger = new Set(showThreats
        ? projectEnemyPhase(s)
            .log.filter((l) => l.event === "enemy_attack_attempt")
            .flatMap((l) => (l.threatNodes ?? []) as string[])
        : []), marks = new Set(showMarks
        ? living(s).flatMap((e) => e.marks?.filter((m): m is string => !!m) ??
            (e.mark ? [e.mark] : []))
        : []);
    const maxX = Math.max(...coords.map((n) => n.x)), maxY = Math.max(...coords.map((n) => n.y));
    const at = (v: number) => `calc(${v} * var(--board-step) + var(--node-size) / 2)`;
    return (<div className="text-board" aria-label={`${b.id} 전장`} style={{
            "--board-step": maxX > 5 ? "48px" : "54px",
            "--node-size": maxX > 5 ? "36px" : "40px",
            width: `calc(${maxX} * var(--board-step) + var(--node-size))`,
            height: `calc(${maxY} * var(--board-step) + var(--node-size))`,
        } as CSSProperties}>
      {b.edges.map(([a, c]) => {
            let f = coords.find((n) => n.id === a)!, t = coords.find((n) => n.id === c)!;
            const x = f.x, y = f.y, xx = t.x, yy = t.y;
            return (<span key={a + c} data-edge={`${a}:${c}`} aria-hidden="true">
            <span className="text-edge" style={{
                    left: at(Math.min(x, xx)),
                    top: `calc(${at(y)} - 9px)`,
                    width: `calc(${Math.abs(xx - x)} * var(--board-step))`,
                    height: 18,
                }}>
              {"-".repeat(16)}
            </span>
            {y !== yy && (<span className="text-edge vertical" style={{
                        left: `calc(${at(xx)} - 5px)`,
                        top: at(Math.min(y, yy)),
                        height: `calc(${Math.abs(yy - y)} * var(--board-step))`,
                    }}>
                {"|\n".repeat(16)}
              </span>)}
            {x !== xx && y !== yy && (<span className="text-edge" style={{
                        left: `calc(${at(xx)} - 5px)`,
                        top: `calc(${at(y)} - 9px)`,
                    }}>
                +
              </span>)}
          </span>);
        })}
      {coords.map((n) => {
            const e = s.enemies.find((e) => e.hp > 0 && e.node === n.id), glyph = s.player.node === n.id
                ? "@"
                : e
                    ? String.fromCharCode(97 + s.enemies.indexOf(e))
                    : ".";
            return (<button key={n.id} data-node={n.id} className={`text-node ${predicted.includes(n.id) ? "predicted" : ""} ${danger.has(n.id) ? "danger" : ""} ${active.includes(n.id) ? "active" : ""} ${glyph === "@" ? "player" : e ? "enemy-node" : ""} ${e && s.prompt?.kind === "effect" && s.prompt.targets.includes(e.id) ? "target" : ""}`} style={{
                    left: `calc(${n.x} * var(--board-step))`,
                    top: `calc(${n.y} * var(--board-step))`,
                }} title={`${n.id}${e && damage[e.id] !== undefined ? ` / 예상 HP −${damage[e.id]}` : ""}`} aria-label={`${n.id} ${glyph}${danger.has(n.id) ? " 위험" : ""}${active.includes(n.id) ? " 이동 후보" : ""}${e && s.prompt?.kind === "effect" && s.prompt.targets.includes(e.id) ? " 유효 대상" : ""}`} onClick={() => onNode?.(n.id)}>
            <b>{glyph}</b>
            <small>
              {predicted.includes(n.id) ? "~" : ""}
              {active.includes(n.id) ? "+" : ""}
              {e &&
                    s.prompt?.kind === "effect" &&
                    s.prompt.targets.includes(e.id)
                    ? "?"
                    : ""}
              {danger.has(n.id) ? "!" : ""}
              {marks.has(n.id) ? "*" : ""}
            </small>
          </button>);
        })}
    </div>);
}
export function BattleScreen({ battle: s, dispatch, onExit, onRetry, onResult, progress, }: {
    battle: Battle;
    dispatch: (c: Command) => void;
    onExit: () => void;
    onRetry: () => void;
    onResult: (metrics: {
        seconds: number;
        inputs: number;
    }) => void;
    progress?: string;
}) {
    const [top, setTop] = useState<Action>(), [bottom, setBottom] = useState<Action>(), [reverse, setReverse] = useState(false), [path, setPath] = useState<string[]>([]), [hover, setHover] = useState(""), [pin, setPin] = useState(""), [view, setView] = useState<"all" | "log" | "zones" | "enemy" | "help" | null>(null), [loss, setLoss] = useState<string[]>([]), [selectedEnemy, setEnemy] = useState(s.enemies[0]?.id), [tab, setTab] = useState("tactics");
    const host = useRef<HTMLDivElement>(null);
    const p = s.prompt, ended = ["victory", "defeat"].includes(s.phase), timer = useBattleMetrics(s.seed + "/" + s.variant, ended), ready = s.phase === "ready" && !p && !s.reason && !s.economy?.startPending.length;
    const currentEffect = executionInfo(s);
    useEffect(() => {
        const sync = () => {
            const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
            host.current?.style.setProperty("--ui-zoom", String(zoom));
        };
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["style"],
        });
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        const listener = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === "h" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !(e.target instanceof HTMLInputElement) &&
                !p &&
                !view) {
                e.preventDefault();
                setView("all");
            }
        };
        window.addEventListener("keydown", listener);
        return () => window.removeEventListener("keydown", listener);
    }, [p, view]);
    useEffect(() => {
        setPath([]);
        setLoss([]);
        if (p) {
            setView(null);
            setTab("cards");
        }
    }, [p]);
    const inspect = (p?.kind === "effect" && currentEffect?.card
        ? currentEffect.card
        : s.zones.hand.includes(hover)
            ? hover
            : s.zones.hand.includes(pin)
                ? pin
                : top && s.zones.hand.includes(top.card)
                    ? top.card
                    : s.zones.hand[0]) ?? s.zones.inPlay[0];
    const actions = [top, bottom].filter((a): a is Action => !!a);
    if (reverse)
        actions.reverse();
    const send = (c: Command) => {
        dispatch(c);
        setPath([]);
        setLoss([]);
    };
    function assign(id: string, side: Side, basic: boolean) {
        if (!ready)
            return;
        const a = { card: id, side, basic };
        if (side === "top") {
            setTop(a);
            if (bottom?.card === id)
                setBottom(undefined);
        }
        else {
            setBottom(a);
            if (top?.card === id)
                setTop(undefined);
        }
        setPin(id);
    }
    const chooseButtons = (id: string) => (<div className="four-choices">
      {(["top", "bottom"] as const).flatMap((side) => [false, true].map((basic) => (<button key={side + basic} data-choice={`${id}:${side}:${basic ? "basic" : "printed"}`} disabled={!ready} aria-pressed={(side === "top" ? top : bottom)?.card === id &&
                (side === "top" ? top : bottom)?.basic === basic} onClick={() => assign(id, side, basic)}>
            {sideName(side)}{" "}
            {basic
                ? side === "top"
                    ? "기본 공격 3"
                    : "기본 이동 1"
                : "인쇄 효과"}
          </button>)))}
    </div>);
    const available = p?.kind === "effect"
        ? p.paths
            .filter((x) => path.every((n, i) => x[i] === n) && x.length > path.length)
            .map((x) => x[path.length])
        : [];
    function onNode(node: string) {
        const enemy = s.enemies.find((e) => e.hp > 0 && e.node === node);
        if (enemy)
            setEnemy(enemy.id);
        if (p?.kind !== "effect")
            return;
        if (p.paths.length) {
            if (available.includes(node))
                setPath([...path, node]);
            else if (path.includes(node))
                setPath(path.slice(0, path.indexOf(node) + 1));
        }
        else if (enemy && p.targets.includes(enemy.id))
            send({ type: "choose", target: enemy.id });
    }
    const previewStep = p?.kind === "effect" && p.step.type === "attack"
        ? p.step
        : top
            ? faceSteps(s, top).find((x) => x.type === "attack")
            : undefined, playerPreview = previewStep ? playerAttackPreview(s, previewStep) : [];
    const enemy = s.enemies.find((e) => e.id === selectedEnemy) ?? s.enemies[0], skin = enemyFlavor(enemy?.archetype ?? ""), a = archetypes[enemy?.archetype ?? ""], encounter = encounters[s.scenario];
    const forecast = simulateIntentPreview(s, enemy);
    const execution = (<div className="execution decision" aria-live="polite">
      {p?.kind === "effect" ? (<>
          <h3>
            {currentEffect?.card ?? "추가 행동"}{" "}
            {currentEffect?.side ? sideName(currentEffect.side) : ""}{" "}
            {currentEffect?.index ?? 1}/{currentEffect?.count ?? 1}단계
          </h3>
          <p>
            <strong>{describe(p.step)}</strong>
          </p>
          {p.paths.length ? (<>
              <p>
                {p.forced
                    ? `${p.forced.direction} · 최대 ${p.forced.max}칸 / 실제 ${p.forced.path.length}칸 · ${[p.forced.target, ...p.forced.path].join(" → ")}`
                    : [s.player.node, ...path].join(" → ")}
              </p>
              <button className="primary" disabled={(p.step.type === "push" || p.step.type === "pull") &&
                    !p.paths.some((x) => JSON.stringify(x) === JSON.stringify(path))} onClick={() => send({ type: "choose", path })}>
                경로 확정 ({path.length}칸)
              </button>
              <button onClick={() => setPath([])}>경로 지우기</button>
            </>) : (<div>
              {p.targets.map((id) => (<button className="primary" key={id} onClick={() => send({ type: "choose", target: id })}>
                  {id} [
                  {String.fromCharCode(97 + s.enemies.findIndex((e) => e.id === id))}
                  ] ?
                  {(p.step.type === "push" || p.step.type === "pull") &&
                        (() => {
                            const target = s.enemies.find((e) => e.id === id)!;
                            const f = planForcedMove(s, s.player, target, p.step.distance ?? 1, p.step.type);
                            return ` · ${f.direction} ${f.path.length}/${f.max}칸`;
                        })()}
                </button>))}
            </div>)}
          <button onClick={() => send({ type: "choose", skip: true })}>
            이 단계 건너뛰기
          </button>
          <small>
            해결한 효과는 되돌릴 수 없습니다. 필수 비용은 자동 지불합니다.
          </small>
        </>) : s.reason && !ended ? (<>
          <h3>{s.reason}</h3>
          <button onClick={() => send(s.economy?.pauseFaces
                ? { type: "continueFace" }
                : { type: "endPlayer" })}>
            {s.economy?.pauseFaces ? "다음 카드 행동 계속" : "플레이어 턴 종료"}
          </button>
          {!s.economy && !s.relicMoved && (<button onClick={() => send({ type: "relicMove" })}>
              돌아보는 발걸음 · 추가 이동 1
            </button>)}
        </>) : (<p>{flavor.messages.previewInstruction}</p>)}
    </div>);
    return (<div ref={host} className={`battleScreen terminal-battle tab-${tab}`} onClickCapture={timer.input}>
      <header className="battleHeader">
        <div>
          <small>
            {flavor.story.title} / {progress ?? "전투 연습"} / {s.variant} · AI
            시험
          </small>
          <h1>
            {scenarioName(s.scenario)}{" "}
            <small>
              T{s.turn}
              {encounter.turnLimit ? ` / ${encounter.turnLimit}` : ""}
            </small>
          </h1>
        </div>
        <div className="vitals">
          <b>
            방문자 HP {s.player.hp}/{s.player.maxHp} · 방어 {s.player.block}
            {s.retain ? " 보존" : ""}
          </b>
          <span>{statusText(s.player)}</span>
        </div>
        <button onClick={onExit}>메뉴</button>
      </header>
      <nav className="battle-toolbar" aria-label="AI 행동표 시험 적용 · 수치/가중치 미확정">
        <span>
          손 {s.zones.hand.length} / 사용 중 {s.zones.inPlay.length} / 버림{" "}
          {s.zones.discard.length} / 소실 {s.zones.lost.length}
        </span>
        <button onClick={() => setView("all")}>
          {flavor.menus.showAll} [H]
        </button>
        <EconomyControls s={s} send={send}/>
        <button onClick={() => setView("zones")}>카드 구역</button>
        <button onClick={() => setView("log")}>전투 기록</button>
        <button onClick={() => setView("help")}>상태 도움말</button>
        <button onClick={() => download({
            ...s,
            elapsedSeconds: timer.seconds,
            summary: battleSummary(s),
        })}>
          로그 JSON
        </button>
        <button onClick={() => {
            timer.reset();
            setTop(undefined);
            setBottom(undefined);
            setPin("");
            setPath([]);
            onRetry();
        }}>
          같은 시드로 전투 초기화
        </button>
      </nav>
      <nav className="small-tabs">
        <button onClick={() => setTab("tactics")} aria-pressed={tab === "tactics"}>
          전장 · 적 예고
        </button>
        <button onClick={() => setTab("cards")} aria-pressed={tab === "cards"}>
          카드 상세 · 실행
        </button>
      </nav>
      <div className="battle-top">
        <section className="enemy-station">
          <header>
            <h2>적 상태 · 행동 예고</h2>
            <button onClick={() => setView("enemy")}>
              선택 적 자세히 보기
            </button>
          </header>
          <div className="enemy-list" aria-label="모든 적의 상태와 예고">
            {s.enemies.map((u, i) => {
            const k = enemyFlavor(u.archetype!);
            return (<button key={u.id} className={u.hp <= 0 ? "dead" : ""} aria-pressed={enemy.id === u.id} onClick={() => setEnemy(u.id)} onFocus={() => setEnemy(u.id)} onMouseEnter={() => setEnemy(u.id)}>
                  <strong>
                    {enemy.id === u.id ? "선택 · " : ""}[
                    {String.fromCharCode(97 + i)}]{" "}
                    {k?.name ?? archetypes[u.archetype!].name}{" "}
                    <small>
                      HP {Math.max(0, u.hp)}/{u.maxHp} 방{u.block}
                      {` · ${statusText(u)}`}
                    </small>
                  </strong>
                  <span>
                    {u.disarm > 0 && "[무장해제: 공격 생략 예정] "}
                    {u.hp <= 0
                    ? "처치됨"
                    : u.intent
                        ? `${k?.intents[u.intent.id] ?? u.intent.id} · ${compactIntent(u.intent, u.buff, u.weak)}`
                        : "예고 없음"}
                  </span>
                </button>);
        })}
          </div>
          {s.enemies.length <= 2 && (<div className="enemy-context">
              <p>{skin?.flavor}</p>
              <h3>선택 적의 행동 후보</h3>
              {a.intents.map((i) => (<p key={i.id}>
                  <b>{skin?.intents[i.id] ?? i.id}</b> · 가중치 {i.weight}/
                  {a.intents.reduce((sum, x) => sum + x.weight, 0)}
                  <br />
                  {intentText(i)}
                </p>))}
            </div>)}
        </section>
        <section className="tactical-station">
          <h2>전장 / {boardOf(s).id}</h2>
          <p>
            {encounter.objective === "survive"
            ? `${encounter.turnLimit}턴 생존 또는 적 전멸`
            : encounter.objective === "kill_target"
                ? `${encounter.turnLimit}턴 내 ${encounter.targetEnemyId} 처치`
                : "모든 적 처치"}
          </p>
          <div className="board-wrap">
            <BoardView battle={s} onNode={onNode} active={[...new Set(available)]} predicted={forecast.steps.flatMap((x) => x.path)} damage={Object.fromEntries(playerPreview.map((p) => [p.id, p.hp]))}/>
          </div>
          <p className="legend">
            @ 방문자 / a–e 적<br />! 전체 적 순서 예상 위협 / * 고정 칸 / + 이동
            후보 / ~ 선택 적 예상 경로
          </p>
          <div className="forecast">
            {enemy?.hp > 0 && (<>
                <b>{skin?.name ?? a.name} · 패턴 확정</b>
                <p className="preview-contract">
                  개별 적 단독 예상 · 현재 전장/피해 그대로 받기 기준. 실제
                  경로는 이동 단계 시작에 결정됩니다.
                </p>
                <p>
                  {enemy.disarm > 0 && "[무장해제: 공격 생략 예정] "}
                  {enemy.bind > 0 && "[속박: 다음 이동 생략] "}
                  {enemy.intent &&
                intentText(enemy.intent, enemy.buff, enemy.weak)}
                </p>
                <p>
                  표식{" "}
                  {enemy.marks?.filter(Boolean).join(", ") ||
                enemy.mark ||
                "없음"}{" "}
                  / 예상 위협 {forecast.threats.join(", ") || "없음"}
                </p>
                <ol className="intent-steps">
                  {forecast.steps.map((x) => (<li key={x.index} data-intent-step={x.index}>
                      {intentText(x.step, enemy.buff, enemy.weak)} ·{" "}
                      {x.step.kind === "move"
                    ? `${x.start} → ${x.path.join(" → ") || "제자리"}${x.reason === "bind_consumed" ? " (속박 생략)" : ""}`
                    : ["attack", "marked", "adjacent_all"].includes(x.step.kind)
                        ? x.hits.length
                            ? "현재 상태에서 공격 가능"
                            : enemy.disarm > 0
                                ? "무장해제로 생략"
                                : "현재 상태에서 사거리 밖/고정 칸 이탈"
                        : "독립 효과"}
                    </li>))}
                </ol>
                <p>
                  {attackPreview(s, enemy)
                .map((p) => `방문자: ${p.hits.map((h) => `공격 ${h.damage} / 방어 ${h.blocked} / HP −${h.hp}`).join(" → ")}`)
                .join(" / ") || "현재 위치 방문자 피격 없음"}
                </p>
              </>)}
          </div>
          {playerPreview.length > 0 && (<p className="attackSummary">
              {previewStep?.target === "all_adjacent_enemies" ||
                previewStep?.target === "all_enemies"
                ? "광역 자동 지정"
                : "공격 가능"}{" "}
              {playerPreview.length}명
              {previewStep?.target === "all_adjacent_enemies" ||
                previewStep?.target === "all_enemies"
                ? ` · 인쇄 피해 합계 ${playerPreview.reduce((n, p) => n + p.base, 0)}`
                : ""}
              :{" "}
              {playerPreview
                .map((p) => `${p.id} 공격 ${p.damage} / 방어 ${p.blocked} / HP −${p.hp}`)
                .join("; ")}
              <small>현재 위치의 첫 공격 기준</small>
            </p>)}
        </section>
        <section className="card-inspector" aria-label="카드 양면 상세">
          <h2>
            {p
            ? "현재 실행 단계"
            : `카드 상세 ${pin === inspect ? "[고정]" : ""}`}
          </h2>
          {p || s.reason ? execution : null}
          {inspect ? (<>
              <CardView id={inspect} upgrade={s.upgrades[inspect]}/>
              {chooseButtons(inspect)}
            </>) : (<p>손에 남은 카드가 없습니다.</p>)}
          {!p && !s.reason && (<small>이름에 호버·포커스하여 확인. 클릭·Enter로 고정.</small>)}
        </section>
      </div>
      <div className="battle-bottom">
        <section className="hand-list" aria-label="손패 이름 목록" onMouseLeave={() => setHover("")}>
          <h2>
            {flavor.menus.showHand} [{s.zones.hand.length}]
          </h2>
          <div>
            {s.zones.hand.map((id) => (<button key={id} data-hand={id} aria-pressed={pin === id} onMouseEnter={() => setHover(id)} onFocus={() => setHover(id)} onBlur={() => setHover("")} onClick={() => {
                setPin(id);
                setHover("");
            }}>
                <small>{id}</small> {cards[id].name}{" "}
                <b>
                  {top?.card === id
                ? `▲ ${top.basic ? "기본" : "인쇄"}`
                : bottom?.card === id
                    ? `▼ ${bottom.basic ? "기본" : "인쇄"}`
                    : ""}
                </b>
              </button>))}
          </div>
          <button onClick={() => setView("all")}>전체 카드 보기</button>
        </section>
        <section className="plan-station">
          <header>
            <h2>이번 턴 계획</h2>
            <span>{reverse ? "하단 → 상단" : "상단 → 하단"}</span>
            <button disabled={!ready} onClick={() => setReverse(!reverse)}>
              순서 변경
            </button>
            <button disabled={!ready} onClick={() => {
            setTop(undefined);
            setBottom(undefined);
        }}>
              선택 취소
            </button>
          </header>
          <div className="persistent-plan">
            {(reverse ? ["bottom", "top"] : ["top", "bottom"]).map((side) => {
            const action = side === "top" ? top : bottom;
            return (<article key={side}>
                  <b>
                    {sideName(side as Side)}{" "}
                    {action
                    ? `${action.card} ${cards[action.card].name} [${action.basic ? "기본" : "인쇄"}]`
                    : "미선택"}
                  </b>
                  {action && (<>
                      <ol>
                        {faceSteps(s, action).map((step, i) => (<li key={i}>{describe(step)}</li>))}
                      </ol>
                      <em>
                        {!action.basic && cards[action.card][action.side].loss
                        ? "소실"
                        : "사용 후 버림"}
                      </em>
                    </>)}
                </article>);
        })}
          </div>
          <div className="plan-controls">
            <span className="plan-reason" role="status">
              {!ready
            ? "현재 단계의 대상·경로·피해 선택을 먼저 마치세요."
            : !top || !bottom
                ? "서로 다른 카드의 상단·하단을 선택하세요."
                : top.card === bottom.card
                    ? "같은 카드는 두 번 사용할 수 없습니다."
                    : "✓ 두 행동 실행 가능"}
            </span>
            <button className="primary" disabled={!ready ||
            !top ||
            !bottom ||
            top.card === bottom.card ||
            !s.zones.hand.includes(top.card) ||
            !s.zones.hand.includes(bottom.card)} onClick={() => send({ type: "play", actions })}>
              두 행동 실행
            </button>
            <button disabled={!ready || s.rested || s.zones.discard.length < 2} onClick={() => {
            setTop(undefined);
            setBottom(undefined);
            send({ type: "rest" });
        }}>
              짧은 휴식 (무작위 1장 소실)
            </button>
          </div>
        </section>
      </div>
      <div className="battle-logline">
        <small>
          시드 {s.seed} / RNG {s.rng}
        </small>{" "}
        {s.log.at(-1) && logText(s, s.log.at(-1)!)}
      </div>
      {view === "all" && (<Modal title={flavor.menus.showAll} close={() => setView(null)}>
          <p>
            인쇄 양면과 기본 행동을 비교하고 배정하세요. 닫아도 선택은
            유지됩니다.
          </p>
          <div className="full-card-grid">
            {s.zones.hand.map((id) => (<div key={id}>
                <CardView id={id} upgrade={s.upgrades[id]}/>
                {chooseButtons(id)}
              </div>))}
          </div>
        </Modal>)}
      {view === "help" && (<Modal title="상태이상 / 조작 도움말" close={() => setView(null)}>
          <StatusHelp />
        </Modal>)}
      {view === "zones" && (<Modal title="카드 구역" close={() => setView(null)}>
          {Object.entries(s.zones).map(([zone, ids]) => (<section key={zone}>
              <h3>
                {{
                    hand: "손",
                    inPlay: "사용 중",
                    discard: "버림",
                    lost: "소실",
                }[zone]}
              </h3>
              <p>
                {ids.map((id) => `${id} ${cards[id].name}`).join(" / ") ||
                    "없음"}
              </p>
            </section>))}
        </Modal>)}
      {view === "log" && (<Modal title="전투 기록" close={() => setView(null)}>
          {s.log.map((l, i) => (<p key={i}>
              T{l.turn} · {logText(s, l)}
            </p>))}
        </Modal>)}
      {view === "enemy" && (<Modal title={skin?.name ?? a.name} close={() => setView(null)}>
          <p>
            HP {Math.max(0, enemy.hp)}/{enemy.maxHp} · 방어 {enemy.block} ·{" "}
            {statusText(enemy)}
          </p>
          <p>
            {skin?.location} · {skin?.encounter}
          </p>
          <p>{skin?.flavor}</p>
          {a.unkillable && <p>불사: HP 최소 1</p>}
          {a.intents.map((i) => (<p key={i.id}>
              {skin?.intents[i.id] ?? i.id} — {intentText(i)} · 가중치{" "}
              {i.weight}/{a.intents.reduce((n, x) => n + x.weight, 0)}
            </p>))}
        </Modal>)}
      {p?.kind === "damage" && (<Modal title="피해 무효화">
          <div className="decision damage-decision">
            <h3>개별 타격 · 체력 피해 {p.damage}</h3>
            {s.economy?.items.includes("I02") && (<button disabled={!itemAvailable(s, "I02")} onClick={() => send({ type: "item", id: "I02" })}>
                두꺼운 외투 사용 · 이번 HP 피해 −1{" "}
                {s.relics.includes("R07") ? "/ R07 방어 +2 (확정 순서)" : ""}
              </button>)}
            <p>카드를 소실하면 이번 타격의 피해를 무효화합니다.</p>
            <button className="primary" onClick={() => send({ type: "damage" })}>
              그대로 받기 ({p.damage})
            </button>
            <button disabled={!loss.length} onClick={() => setLoss([])}>
              선택 비우기
            </button>
            <div className="loss-options">
              {(["hand", "discard"] as const).map((zone) => {
                const required = zone === "hand" ? 1 : 2;
                const valid = loss.length === required &&
                    loss.every((id) => s.zones[zone].includes(id));
                const reason = s.zones[zone].length < required
                    ? `${zone === "hand" ? "손" : "버림"} 카드가 ${required}장 이상 필요합니다.`
                    : loss.some((id) => !s.zones[zone].includes(id))
                        ? "다른 구역의 카드와 함께 선택할 수 없습니다. 선택을 비우고 다시 고르세요."
                        : loss.length !== required
                            ? `현재 ${loss.length}장 선택 · 정확히 ${required}장을 선택하세요.`
                            : `${required}장 소실로 이번 피해를 무효화할 수 있습니다.`;
                return (<fieldset key={zone} data-loss-zone={zone}>
                    <legend>
                      {zone === "hand" ? "손 카드 1장" : "버림 카드 2장"} 소실
                    </legend>
                    <div className="loss-cards">
                      {s.zones[zone].map((id) => (<label className="lossChoice" key={id}>
                          <input type="checkbox" checked={loss.includes(id)} onChange={() => setLoss(loss.includes(id)
                            ? loss.filter((x) => x !== id)
                            : [...loss, id])}/>
                          <span>
                            {id} <strong>{cards[id].name}</strong>
                          </span>
                        </label>))}
                    </div>
                    <p id={`loss-reason-${zone}`} className="selection-reason" role="status">
                      {reason}
                    </p>
                    <button aria-describedby={`loss-reason-${zone}`} disabled={!valid} onClick={() => send({ type: "damage", zone, cards: loss })}>
                      선택한 카드 소실 / 피해 무효화
                    </button>
                  </fieldset>);
            })}
            </div>
          </div>
        </Modal>)}
      {p?.kind === "rest" && (<Modal title="휴식 소실 선택">
          <h3>예언자의 눈 · 소실할 카드 선택</h3>
          {p.cards.map((id) => (<button key={id} onClick={() => send({ type: "rest", card: id })}>
              {cards[id].name} 소실
            </button>))}
        </Modal>)}
      {ended && (<Modal title={flavor.menus.battleResult}>
          <h2>{s.phase === "victory" ? "승리" : "패배"}</h2>
          <p>
            {s.reason} · {s.turn}턴 · HP {s.startHp} → {s.player.hp}
          </p>
          <p>
            {s.phase === "victory"
                ? (flavor.scenarios as Record<string, {
                    outro: string;
                }>)[s.scenario]?.outro
                : flavor.messages.battleLost}
          </p>
          <p>
            실제 소요 {timer.seconds.toFixed(1)}초 · 입력 {timer.inputs()}회 ·
            체력 피해 {battleSummary(s).hpLost}
          </p>
          <button className="primary" onClick={() => onResult({ seconds: timer.seconds, inputs: timer.inputs() })}>
            결과 확인 / 계속
          </button>
          <button onClick={() => {
                timer.reset();
                setTop(undefined);
                setBottom(undefined);
                onRetry();
            }}>
            같은 시드 재시작
          </button>
          <button onClick={() => download({ ...s, summary: battleSummary(s) })}>
            로그 JSON
          </button>
        </Modal>)}
    </div>);
}
export function download(value: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "bigger-green-vill-log.json";
    a.click();
    URL.revokeObjectURL(url);
}
