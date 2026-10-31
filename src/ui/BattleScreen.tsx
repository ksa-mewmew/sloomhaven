import { LEGACY_RULES } from "../game/rulesets";
import { RulesGuide } from "./RulesGuide";
import { enemySymbol } from "./enemySymbols";
import { EconomyControls } from "./EconomyControls";
import { statusText } from "../game/status";
import { StatusHelp } from "./StatusHelp";
import {
  useEffect,
  useRef,
  useState,
  useId,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { planForcedMove } from "../game/movement";
import {
  simulateIntentPreview,
  attackPreview,
  playerAttackPreview,
} from "../game/preview";
import { battleSummary } from "../game/telemetry";
import { useBattleMetrics } from "./useBattleMetrics";
import { archetypes, cards, encounters } from "../game/data";
import { flavor, enemyFlavor, cardFlavor, logText } from "../game/presentation";
import { boardOf, living, threats } from "../game/board";
import { projectEnemyPhase, faceSteps, itemAvailable, medkitUnavailable } from "../game/engine";
import type { Action, Battle, Board, Command, Side } from "../game/types";
import { compactIntent, describe, intentText, executionInfo, projectedIntentText } from "./cardText";
export { describe, intentText } from "./cardText";
export const scenarioName = (id: string) =>
  (
    flavor.scenarios as Record<
      string,
      {
        name: string;
      }
    >
  )[id]?.name ??
  encounters[id]?.name ??
  id;
const sideName = (side: Side) => (side === "top" ? "▲ 상단" : "▼ 하단");
export function Modal({
  title,
  children,
  close,
}: {
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
      if (event.key !== "Tab") return;
      const items = [
        ...(ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ) ?? []),
      ].filter((element) => element.getClientRects().length);
      const first = items[0],
        last = items.at(-1);
      if (!first) {
        event.preventDefault();
        ref.current?.focus();
        return;
      }
      if (
        !ref.current?.contains(document.activeElement) ||
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    document.addEventListener("keydown", trap, true);
    return () => {
      document.removeEventListener("keydown", trap, true);
      ref.current?.close();
      queueMicrotask(() => {
        if (before?.isConnected) before.focus();
      });
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="terminal-modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close?.();
      }}
    >
      <header>
        <h2>{title}</h2>
        {close && <button onClick={close}>닫기 [Esc]</button>}
      </header>
      {children}
    </dialog>,
    document.body,
  );
}
export function CardView({
  id,
  onPick,
  selected,
  selectedSide,
  upgrade = [],
  ruleset,
}: {
  id: string;
  onPick?: (side: Side) => void;
  selected?: string;
  selectedSide?: Side;
  upgrade?: Side[];
  ruleset?: Battle["ruleset"];
}) {
  const c = cards[id];
  const descriptionId = useId();
  return (
    <article className={"card " + (selected ? "selected" : "")} data-card={id}>
      <header>
        <strong>{c.name}</strong>
      </header>
      {(["top", "bottom"] as const).map((side) => (
        <div className={"face" + (selectedSide === side ? " face-selected" : "")} key={side} aria-pressed={onPick ? selectedSide === side : undefined} role={onPick ? "button" : undefined} tabIndex={onPick ? 0 : undefined} aria-describedby={onPick ? descriptionId + side : undefined} aria-label={c.name + " " + (side === "top" ? "상단" : "하단") + " 선택" + (c[side].loss ? " · 소실" : "")} onClick={onPick ? (e) => { e.stopPropagation(); onPick(side); } : undefined} onKeyDown={onPick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onPick(side); } } : undefined}>
          <b>
            <span className="sr-only">{sideName(side)}</span>{upgrade.includes(side) ? "＋ 강화" : ""}{" "}
            {c[side].loss && <em>소실</em>}
          </b>
          <p id={descriptionId + side}>
            {faceSteps(
              { upgrades: { [id]: upgrade }, ruleset },
              { card: id, side, basic: false },
            )
              .map(describe)
              .join(" → ")}
          </p>
        </div>
      ))}

    </article>
  );
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
  const columns = Math.max(1, Math.ceil(b.nodes.length / 4)), rows = Math.max(1, Math.ceil(b.nodes.length / 2) - columns);
  const perimeter = [
    ...Array.from({length: columns}, (_,i) => [i,0]),
    ...Array.from({length: rows}, (_,i) => [columns,i]),
    ...Array.from({length: columns}, (_,i) => [columns-i,rows]),
    ...Array.from({length: rows}, (_,i) => [0,rows-i]),
  ];
  return b.nodes.map((n, i) => ({
    id: n.id,
    x:
      b.kind === "ring"
        ? (b.nodes.length === 8 ? ring[i][0] : perimeter[i][0])
        : b.kind === "line"
          ? foldedLine[i][0]
          : (n.x ?? 0),
    y:
      b.kind === "ring"
        ? (b.nodes.length === 8 ? ring[i][1] : perimeter[i][1])
        : b.kind === "line"
          ? foldedLine[i][1]
          : (n.y ?? 0) - minY,
  }));
}
export function BoardView({
  battle: s,
  onNode,
  active = [],
  showThreats = true,
  showMarks = true,
  damage = {},
  predicted = [],
  inspected,
  onEnemyHover,
}: {
  battle: Battle;
  onNode?: (id: string) => void;
  active?: string[];
  showThreats?: boolean;
  showMarks?: boolean;
  damage?: Record<string, number>;
  predicted?: string[];
  inspected?: string;
  onEnemyHover?: (id: string | null) => void;
}) {
  const b = boardOf(s),
    coords = boardProjection(b),
    danger = new Set(
      showThreats
        ? projectEnemyPhase(s)
            .log.filter((l) => ["enemy_attack_attempt", "enemy_status_attempt"].includes(l.event))
            .flatMap((l) => (l.threatNodes ?? []) as string[])
        : [],
    ),
    marks = new Set(
      showMarks
        ? living(s).flatMap(
            (e) =>
              e.marks?.filter((m): m is string => !!m) ??
              (e.mark ? [e.mark] : []),
          )
        : [],
    );
  const maxX = Math.max(...coords.map((n) => n.x)),
    maxY = Math.max(...coords.map((n) => n.y));
  const at = (v: number) =>
    `calc(${v} * var(--board-step) + var(--node-size) / 2)`;
  return (
    <div
      className="text-board"
      aria-label={`${b.id} 전장`}
      style={
        {
          "--board-step":
            maxY >= 4 ? "clamp(46px, 5.5vh, 62px)" : maxX > 5 ? "clamp(46px, 4vw, 66px)" : "clamp(46px, 6vh, 68px)",
          "--node-size": "clamp(38px, 5.6vh, 60px)",
          width: `calc(${maxX} * var(--board-step) + var(--node-size))`,
          height: `calc(${maxY} * var(--board-step) + var(--node-size))`,
        } as CSSProperties
      }
    >
      {b.edges.map(([a, c]) => {
        const f = coords.find(n => n.id === a)!, t = coords.find(n => n.id === c)!;
        const dx = t.x - f.x, dy = t.y - f.y;
        return <span key={a + c} data-edge={a + ":" + c} className="graph-link" aria-hidden="true" style={{ left: at(f.x), top: at(f.y), width: "calc(" + Math.hypot(dx, dy) + " * var(--board-step))", transform: "rotate(" + Math.atan2(dy, dx) + "rad)" }} />;
      })}
      {coords.map((n) => {
        const e = s.enemies.find((e) => e.hp > 0 && e.node === n.id),
          glyph =
            s.player.node === n.id
              ? "@"
              : e
                ? enemySymbol(e.archetype)
                : ".";
        return (
          <button
            key={n.id}
            data-node={n.id}
            className={`text-node ${e && e.id === inspected ? "inspected" : ""} ${predicted.includes(n.id) ? "predicted" : ""} ${danger.has(n.id) ? "danger" : ""} ${active.includes(n.id) ? "active" : ""} ${glyph === "@" ? "player" : e ? "enemy-node" : ""} ${e && s.prompt?.kind === "effect" && s.prompt.targets.includes(e.id) ? "target" : ""}`}
            style={{
              left: `calc(${n.x} * var(--board-step))`,
              top: `calc(${n.y} * var(--board-step))`,
            }}
            title={`${n.id}${e ? ` / [${glyph}] ${enemyFlavor(e.archetype!)?.name ?? e.archetype} · ${e.id}` : ""}${e && damage[e.id] !== undefined ? ` / 예상 HP −${damage[e.id]}` : ""}`}
            aria-label={`${n.id} ${glyph}${e ? ` ${enemyFlavor(e.archetype!)?.name ?? e.archetype} ${e.id}` : ""}${danger.has(n.id) ? " 위험" : ""}${active.includes(n.id) ? " 이동 후보" : ""}${e && s.prompt?.kind === "effect" && s.prompt.targets.includes(e.id) ? " 유효 대상" : ""}`}
            onMouseEnter={() => onEnemyHover?.(e?.id ?? null)}
            onMouseLeave={() => onEnemyHover?.(null)}
            onFocus={() => onEnemyHover?.(e?.id ?? null)}
            onBlur={() => onEnemyHover?.(null)}
            onClick={() => onNode?.(n.id)}
          >
            <b>{glyph}</b>
            <small>
              {e ? `${e.id} ` : ""}
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
          </button>
        );
      })}
    </div>
  );
}
export function BattleScreen({
  battle: s,
  dispatch,
  onExit,
  onRetry,
  onResult,
  progress,
  gold,
  onMedkit,
}: {
  battle: Battle;
  dispatch: (c: Command) => void;
  onExit: () => void;
  onRetry: () => void;
  onResult: (metrics: { seconds: number; inputs: number }) => void;
  progress?: string;
  gold?: number;
  onMedkit?: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [top, setTop] = useState<Action>(),
    [bottom, setBottom] = useState<Action>(),
    [reverse, setReverse] = useState(false),
    [path, setPath] = useState<string[]>([]),
    [hover, setHover] = useState(""),
    [focusCard, setFocusCard] = useState(""),
    [view, setView] = useState<
      "all" | "log" | "zones" | "enemy" | "help" | "settings" | null
    >(null),
    [loss, setLoss] = useState<string[]>([]),
    [hoverEnemy, setHoverEnemy] = useState<string | null>(null),
    [pinnedEnemy, setPinnedEnemy] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null),
    p = s.prompt,
    ended = ["victory", "defeat"].includes(s.phase),
    timer = useBattleMetrics(s.seed + "/" + s.variant, ended),
    ready =
      s.phase === "ready" && !p && !s.reason && !s.economy?.startPending.length,
    currentEffect = executionInfo(s);
  const enemyId = pinnedEnemy ?? hoverEnemy;
  const enemy = s.enemies.find((e) => e.id === enemyId) ?? s.enemies[0],
    skin = enemyFlavor(enemy?.archetype ?? ""),
    a = archetypes[enemy?.archetype ?? ""],
    encounter = encounters[s.scenario];
  const forecast = simulateIntentPreview(s, enemy);
  const actions = [top, bottom].filter((x): x is Action => !!x);
  if (reverse) actions.reverse();
  const clearSelection = () => {
    setSelected([]);
    setTop(undefined);
    setBottom(undefined);
    setHover("");
    setFocusCard("");
  };
  useEffect(() => {
    clearSelection();
    setPath([]);
  }, [s.turn]);
  useEffect(() => {
    setPath([]);
    setLoss([]);
    if (p) setView(null);
  }, [p]);
  useEffect(() => {
    const sync = () =>
      host.current?.style.setProperty(
        "--ui-zoom",
        String(Number(getComputedStyle(document.documentElement).zoom) || 1),
      );
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
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (
        e.key.toLowerCase() === "h" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !p &&
        !view
      ) {
        e.preventDefault();
        setView("help");
      }
      if (
        e.key === "Escape" &&
        !view &&
        !p &&
        !s.economy?.startPending.length
      ) {
        setPinnedEnemy(null);
        setHoverEnemy(null);
        if (ready) clearSelection();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [p, view, ready, s.economy?.startPending.length]);
  const send = (c: Command) => {
    dispatch(c);
    setPath([]);
    setLoss([]);
    if (c.type === "play" || c.type === "rest") clearSelection();
  };
  function toggleCard(id: string, side?: Side) {
    if (!ready) return;
    const existing = top?.card === id ? top : bottom?.card === id ? bottom : undefined;
    if (selected.includes(id) && (!side || existing?.side === side)) {
      setSelected(selected.filter(x => x !== id));
      if (top?.card === id) setTop(undefined);
      if (bottom?.card === id) setBottom(undefined);
      return;
    }
    if (!selected.length || (selected.length === 1 && selected[0] === id)) {
      const chosen = side ?? "top";
      setSelected([id]); setTop(chosen === "top" ? {card:id, side:"top", basic:false} : undefined);
      setBottom(chosen === "bottom" ? {card:id, side:"bottom", basic:false} : undefined); setReverse(false); return;
    }
    const anchor = selected.includes(id) ? selected.find(x => x !== id)! : selected[0];
    const anchorAction = top?.card === anchor ? top : bottom?.card === anchor ? bottom : undefined;
    const chosen = side ?? (anchorAction?.side === "top" ? "bottom" : "top");
    const other: Side = chosen === "top" ? "bottom" : "top";
    const first = {card:anchor, side:other, basic:anchorAction?.side === other ? anchorAction.basic : false};
    const second = {card:id, side:chosen, basic:false};
    setSelected([anchor,id]);setTop(chosen === "top" ? second : first);setBottom(chosen === "bottom" ? second : first);
  }
  const available =
    p?.kind === "effect"
      ? p.paths
          .filter(
            (x) => path.every((n, i) => x[i] === n) && x.length > path.length,
          )
          .map((x) => x[path.length])
      : [];
  function onNode(node: string) {
    const target = s.enemies.find((e) => e.hp > 0 && e.node === node);
    if (target) setPinnedEnemy(target.id);
    if (p?.kind !== "effect") return;
    if (p.paths.length) {
      if (available.includes(node)) setPath([...path, node]);
      else if (path.includes(node))
        setPath(path.slice(0, path.indexOf(node) + 1));
    } else if (target && p.targets.includes(target.id))
      send({ type: "choose", target: target.id });
  }
  const previewStep =
    p?.kind === "effect" && p.step.type === "attack"
      ? p.step
      : top
        ? faceSteps(s, top).find((x) => x.type === "attack")
        : undefined;
  const playerPreview = previewStep ? playerAttackPreview(s, previewStep) : [];
  const execution = (
    <div className="execution decision" aria-live="polite">
      {p?.kind === "effect" ? (
        <>
          <h3>
            {currentEffect?.card ?? "추가 행동"}{" "}
            {currentEffect?.side ? sideName(currentEffect.side) : ""}{" "}
            {currentEffect?.index ?? 1}/{currentEffect?.count ?? 1}단계
          </h3>
          <p>
            <strong>{describe(p.step)}</strong>
          </p>
          {p.paths.length ? (
            <>
              <p>
                {p.forced
                  ? `${p.forced.direction} · 최대 ${p.forced.max}칸 / 실제 ${p.forced.path.length}칸 · ${[p.forced.target, ...p.forced.path].join(" → ")}`
                  : [s.player.node, ...path].join(" → ")}
              </p>
              <button
                className="primary"
                disabled={
                  (p.step.type === "push" || p.step.type === "pull") &&
                  !p.paths.some(
                    (x) => JSON.stringify(x) === JSON.stringify(path),
                  )
                }
                onClick={() => send({ type: "choose", path })}
              >
                경로 확정 ({path.length}칸)
              </button>
              <button onClick={() => setPath([])}>경로 지우기</button>
            </>
          ) : (
            <div>
              {p.targets.map((id) => (
                <button
                  className="primary"
                  key={id}
                  onClick={() => send({ type: "choose", target: id })}
                >
                  {id} [
                  {enemySymbol(s.enemies.find((e) => e.id === id)?.archetype)}
                  ] ?
                  {(p.step.type === "push" || p.step.type === "pull") &&
                    (() => {
                      const target = s.enemies.find((e) => e.id === id)!;
                      const f = planForcedMove(
                        s,
                        s.player,
                        target,
                        p.step.distance ?? 1,
                        p.step.type,
                      );
                      return ` · ${f.direction} ${f.path.length}/${f.max}칸`;
                    })()}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => send({ type: "choose", skip: true })}>
            이 단계 건너뛰기
          </button>
          <small>
            해결한 효과는 되돌릴 수 없습니다. 필수 비용은 자동 지불합니다.
          </small>
        </>
      ) : s.reason && !ended ? (
        <>
          <h3>{s.reason}</h3>
          <button
            onClick={() =>
              send(
                s.economy?.pauseFaces
                  ? { type: "continueFace" }
                  : { type: "endPlayer" },
              )
            }
          >
            {s.economy?.pauseFaces ? "다음 카드 행동 계속" : "플레이어 턴 종료"}
          </button>
          {!s.economy && !s.relicMoved && (
            <button onClick={() => send({ type: "relicMove" })}>
              돌아보는 발걸음 · 추가 이동 1
            </button>
          )}
        </>
      ) : (
        <p>{flavor.messages.previewInstruction}</p>
      )}
    </div>
  );
  return (
    <div
      ref={host}
      className="battleScreen airy-battle"
      onClickCapture={timer.input}
    >
      <header className="airy-header">
        <div>
          <small>
            {s.ruleset === LEGACY_RULES ? "이전 규칙 · " : ""}
            {flavor.story.title} / {progress ?? "전투 연습"} / {s.variant}
          </small>
          <h1>
            {scenarioName(s.scenario)}{" "}
            <small>
              T{s.turn}
              {encounter.turnLimit ? " / " + encounter.turnLimit : ""}
            </small>
          </h1>
        </div>
        <nav aria-label="전투 메뉴">
          <button onClick={() => setView("help")}>규칙 안내 [H]</button>
          <button onClick={() => setView("all")}>카드 전체 보기</button>
          <EconomyControls s={s} send={send} />
          <button onClick={() => setView("log")}>전투 기록</button>
          <button onClick={() => setView("settings")}>설정</button>
          <button onClick={onExit}>메뉴</button>
        </nav>
      </header>
      <div className="airy-stage">
        <aside className="context-slot left-slot" aria-label="행동 구성 영역">
          {!ended && (p?.kind === "effect" || s.reason) ? (
            <section className="context-panel action-composer">
              {execution}
            </section>
          ) : (
            selected.length === 2 && (
              <section className="context-panel action-composer">
                <header>
                  <h2>
                    행동 구성
                    <small className="composer-card-names">
                      {selected.map((id) => cards[id].name).join(" / ")}
                    </small>
                  </h2>
                  <button onClick={clearSelection}>선택 초기화</button>
                </header>
                <div className="plan-summary">
                  {(reverse ? [bottom,top] : [top,bottom]).map(action => action && <article key={action.side}>
                    <h3>{cards[action.card].name} · {sideName(action.side)}</h3>
                    <p>{faceSteps(s,action).map(describe).join(" → ")}{!action.basic && cards[action.card][action.side].loss && <em className="loss-label"> 소실</em>}</p>
                    <button data-basic-for={action.side} aria-pressed={!!action.basic} aria-label={cards[action.card].name + " " + sideName(action.side) + " 기본 행동"} onClick={() => {const next={...action,basic:!action.basic}; if(action.side === "top")setTop(next);else setBottom(next);}}>기본 행동 {action.basic ? "사용 중" : "대신 사용"}</button>
                  </article>)}
                </div>
                <footer>
                  <button onClick={() => setReverse(!reverse)}>
                    순서 변경 · {reverse ? "하단 → 상단" : "상단 → 하단"}
                  </button>
                  <button
                    className="primary"
                    disabled={
                      !ready ||
                      !top ||
                      !bottom ||
                      top.card === bottom.card ||
                      !s.zones.hand.includes(top.card) ||
                      !s.zones.hand.includes(bottom.card)
                    }
                    onClick={() => send({ type: "play", actions })}
                  >
                    이 턴 실행
                  </button>
                </footer>
              </section>
            )
          )}
        </aside>
        <section className="airy-center" aria-label="중앙 전장">
          <div className="battle-objective">
            {encounter.objective === "survive"
              ? encounter.turnLimit + "번의 적 행동 단계 생존 또는 적 전멸"
              : encounter.objective === "kill_target"
                ? (encounter.turnLimit === undefined ? "턴 제한 없음 · " : encounter.turnLimit + "턴 내 ") +
                  encounter.targetEnemyId +
                  " 처치"
                : "승리 조건: 모든 적 처치"}
          </div>
          <div className="airy-board-space">
            <BoardView
              battle={s}
              onNode={onNode}
              onEnemyHover={setHoverEnemy}
              inspected={enemyId ?? undefined}
              active={[...new Set(available)]}
              showThreats={!!enemyId || !!p}
              predicted={enemyId ? forecast.steps.flatMap((x) => x.path) : []}
              damage={Object.fromEntries(
                playerPreview.map((x) => [x.id, x.hp]),
              )}
            />
          </div>
          <p className="airy-legend">
            @ 방문자 · 적 기호는 종류별 고정 · e번호: 개체 · + 이동 · ! 위협 · * 고정 칸 · ~ 예상 경로
          </p>
          <div className="resource-hud" aria-label="전투 자원">
            <strong>
              HP {s.player.hp}/{s.player.maxHp}
            </strong>
            <span>
              방어 {s.player.block}
              {s.retain ? " · 보존" : ""}
            </span>
            <span title={statusText(s.player)}>{statusText(s.player)}</span>
            <button className="medkit-button" disabled={!onMedkit || !!medkitUnavailable(s)} onClick={onMedkit} aria-label={"응급약 ×" + (s.medkits ?? 0) + " · " + (!onMedkit ? "런에서만 사용합니다" : medkitUnavailable(s) || "HP 6 회복")} title={!onMedkit ? "런에서만 사용합니다" : medkitUnavailable(s) || "HP 6 회복"}>응급약 ×{s.medkits ?? 0}</button>
            <strong data-gold>
              {gold === undefined ? "골드 — (연습)" : "G " + gold}
            </strong>
          </div>
        </section>
        <aside className="context-slot right-slot" aria-label="적 상세 영역">
          {enemyId && (
            <section
              className="context-panel enemy-detail"
              onMouseEnter={() => setHoverEnemy(enemyId)}
              onMouseLeave={() => setHoverEnemy(null)}
            >
              <header>
                <h2>
                  [{enemySymbol(enemy.archetype)}] {skin?.name ?? a.name}
                </h2>
                <button
                  aria-label="적 상세 닫기"
                  onClick={() => {
                    setPinnedEnemy(null);
                    setHoverEnemy(null);
                  }}
                >
                  닫기
                </button>
              </header>
              <p>HP {Math.max(0,enemy.hp)}/{enemy.maxHp}{enemy.block > 0 ? " · 방어 " + enemy.block : ""}</p>
              {statusText(enemy) !== "상태이상 없음" && <p>{statusText(enemy)}</p>}
              <p className="enemy-intent-summary">{enemy.intent && projectedIntentText(forecast.steps,enemy.buff,enemy.weak)}</p>
              <button onClick={() => setView("enemy")}>상세 보기</button>
            </section>
          )}
        </aside>
      </div>
      <section className="airy-hand" aria-label="실제 카드 손패">
        <header>
          <span>
            손패 {s.zones.hand.length} · 버림 {s.zones.discard.length} · 소실{" "}
            {s.zones.lost.length}
          </span>
          <button
            disabled={!ready || s.rested || s.zones.discard.length < 2}
            onClick={() => send({ type: "rest" })}
          >
            짧은 휴식
          </button>
        </header>
        <div
          className="hand-fan"
          style={
            {
              "--hand-count": Math.max(1, s.zones.hand.length),
            } as CSSProperties
          }
        >
          {s.zones.hand.map((id, index) => (
            <div
              key={id}
              className={
                "hand-card " +
                (selected.includes(id) ? "chosen " : "") +
                ((hover || focusCard) === id ? "expanded" : "")
              }
              data-hand={id}
              role="group"
              tabIndex={ready ? 0 : -1}
              aria-disabled={!ready}
              aria-label={
                cards[id].name +
                (selected.includes(id) ? " 선택됨" : " 선택")
              }
              onMouseEnter={() => setHover(id)}
              onMouseLeave={() => setHover("")}
              onFocus={() => {
                setHover("");
                setFocusCard(id);
              }}
              onBlur={() => setFocusCard("")}
              onClick={() => {
                toggleCard(id);
                setFocusCard(id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleCard(id);
                }
              }}
              style={
                {
                  "--fan-offset": index - (s.zones.hand.length - 1) / 2,
                } as CSSProperties
              }
            >
              <CardView id={id} upgrade={s.upgrades[id]} ruleset={s.ruleset} selectedSide={top?.card === id ? "top" : bottom?.card === id ? "bottom" : undefined} onPick={ready ? side => toggleCard(id,side) : undefined} />
              {(hover || focusCard) === id && <div className="card-hover-copy" aria-hidden="true"><CardView id={id} upgrade={s.upgrades[id]} ruleset={s.ruleset} selectedSide={top?.card === id ? "top" : bottom?.card === id ? "bottom" : undefined} /></div>}
              <span className="hand-selection">
                {selected.includes(id)
                  ? "✓ 선택 " + (selected.indexOf(id) + 1)
                  : ""}
                {top?.card === id ? " · ▲" : ""}
                {bottom?.card === id ? " · ▼" : ""}
              </span>
            </div>
          ))}
        </div>
        {s.zones.hand.length === 0 && (
          <p>
            손에 남은 카드가 없습니다. 가능한 경우 짧은 휴식으로 회수하세요.
          </p>
        )}
      </section>
      {view === "settings" && (
        <Modal title="전투 설정" close={() => setView(null)}>
          <p>
            시드 {s.seed} · 턴 {s.turn}
          </p>
          <button onClick={() => setView("zones")}>카드 구역</button>
          <button onClick={() => download({ ...s, summary: battleSummary(s) })}>
            로그 JSON
          </button>
          <button
            onClick={() => {
              timer.reset();
              clearSelection();
              setPinnedEnemy(null);
              setHoverEnemy(null);
              setView(null);
              onRetry();
            }}
          >
            같은 시드로 전투 초기화
          </button>
        </Modal>
      )}
      {view === "all" && (
        <Modal title={flavor.menus.showAll} close={() => setView(null)}>
          <p>
            인쇄 양면과 기본 행동을 비교하고 배정하세요. 닫아도 선택은
            유지됩니다.
          </p>
          <div className="full-card-grid">
            {s.zones.hand.map((id) => (
              <div key={id}>
                <CardView id={id} upgrade={s.upgrades[id]} ruleset={s.ruleset} selectedSide={top?.card === id ? "top" : bottom?.card === id ? "bottom" : undefined} onPick={side => toggleCard(id,side)} />
                <button onClick={() => toggleCard(id)} disabled={!ready}>
                  {selected.includes(id) ? "✓ 선택 해제" : "이 카드 선택"}
                </button>

              </div>
            ))}
          </div>
        </Modal>
      )}
      {view === "help" && (
        <Modal title="규칙 안내" close={() => setView(null)}>
          <RulesGuide legacy={s.ruleset === LEGACY_RULES} />
        </Modal>
      )}
      {view === "zones" && (
        <Modal title="카드 구역" close={() => setView(null)}>
          {Object.entries(s.zones).map(([zone, ids]) => (
            <section key={zone}>
              <h3>
                {
                  {
                    hand: "손",
                    inPlay: "사용 중",
                    discard: "버림",
                    lost: "소실",
                  }[zone]
                }
              </h3>
              <p>
                {ids.map((id) => `${id} ${cards[id].name}`).join(" / ") ||
                  "없음"}
              </p>
            </section>
          ))}
        </Modal>
      )}
      {view === "log" && (
        <Modal title="전투 기록" close={() => setView(null)}>
          {s.log.map((l, i) => (
            <p key={i}>
              T{l.turn} · {logText(s, l)}
            </p>
          ))}
        </Modal>
      )}
      {view === "enemy" && (
        <Modal title={skin?.name ?? a.name} close={() => setView(null)}>
          <p>
            HP {Math.max(0, enemy.hp)}/{enemy.maxHp} · 방어 {enemy.block} ·{" "}
            {statusText(enemy)}
          </p>
          <p>
            {skin?.location} · {skin?.encounter}
          </p>
          <p>{skin?.flavor}</p>
          {a.unkillable && <p>불사: HP 최소 1</p>}
          {a.intents.map((i) => (
            <p key={i.id}>
              {skin?.intents[i.id] ?? i.id} — {intentText(i)} · 가중치{" "}
              {i.weight}/{a.intents.reduce((n, x) => n + x.weight, 0)}
            </p>
          ))}
        </Modal>
      )}
      {p?.kind === "damage" && (
        <Modal title="피해 무효화">
          <div className="decision damage-decision">
            <h3>개별 타격 · 체력 피해 {p.damage}</h3>
            {s.economy?.items.includes("I02") && (
              <button
                disabled={!itemAvailable(s, "I02")}
                onClick={() => send({ type: "item", id: "I02" })}
              >
                두꺼운 외투 사용 · 이번 HP 피해 −1{" "}
                {s.relics.includes("R07") ? "/ R07 방어 +2 (확정 순서)" : ""}
              </button>
            )}
            <p>카드를 소실하면 이번 타격의 피해를 무효화합니다.</p>
            <button
              className="primary"
              onClick={() => send({ type: "damage" })}
            >
              그대로 받기 ({p.damage})
            </button>
            <button disabled={!loss.length} onClick={() => setLoss([])}>
              선택 비우기
            </button>
            <div className="loss-options">
              {(["hand", "discard"] as const).map((zone) => {
                const required = zone === "hand" ? 1 : 2;
                const valid =
                  loss.length === required &&
                  loss.every((id) => s.zones[zone].includes(id));
                const reason =
                  s.zones[zone].length < required
                    ? `${zone === "hand" ? "손" : "버림"} 카드가 ${required}장 이상 필요합니다.`
                    : loss.some((id) => !s.zones[zone].includes(id))
                      ? "다른 구역의 카드와 함께 선택할 수 없습니다. 선택을 비우고 다시 고르세요."
                      : loss.length !== required
                        ? `현재 ${loss.length}장 선택 · 정확히 ${required}장을 선택하세요.`
                        : `${required}장 소실로 이번 피해를 무효화할 수 있습니다.`;
                return (
                  <fieldset key={zone} data-loss-zone={zone}>
                    <legend>
                      {zone === "hand" ? "손 카드 1장" : "버림 카드 2장"} 소실
                    </legend>
                    <div className="loss-cards">
                      {s.zones[zone].map((id) => (
                        <label className="lossChoice" key={id}>
                          <input
                            type="checkbox"
                            checked={loss.includes(id)}
                            onChange={() =>
                              setLoss(
                                loss.includes(id)
                                  ? loss.filter((x) => x !== id)
                                  : [...loss, id],
                              )
                            }
                          />
                          <span>
                            {id} <strong>{cards[id].name}</strong>
                          </span>
                        </label>
                      ))}
                    </div>
                    <p
                      id={`loss-reason-${zone}`}
                      className="selection-reason"
                      role="status"
                    >
                      {reason}
                    </p>
                    <button
                      aria-describedby={`loss-reason-${zone}`}
                      disabled={!valid}
                      onClick={() =>
                        send({ type: "damage", zone, cards: loss })
                      }
                    >
                      선택한 카드 소실 / 피해 무효화
                    </button>
                  </fieldset>
                );
              })}
            </div>
          </div>
        </Modal>
      )}
      {p?.kind === "rest" && (
        <Modal title="휴식 소실 선택">
          <h3>예언자의 눈 · 소실할 카드 선택</h3>
          {p.cards.map((id) => (
            <button key={id} onClick={() => send({ type: "rest", card: id })}>
              {cards[id].name} 소실
            </button>
          ))}
        </Modal>
      )}
      {ended && (
        <Modal title={flavor.menus.battleResult}>
          <h2>{s.phase === "victory" ? "승리" : "패배"}</h2>
          <p>
            {s.reason} · {s.turn}턴 · HP {s.startHp} → {s.player.hp}
          </p>
          <p>
            {s.phase === "victory"
              ? (
                  flavor.scenarios as Record<
                    string,
                    {
                      outro: string;
                    }
                  >
                )[s.scenario]?.outro
              : flavor.messages.battleLost}
          </p>
          <p>
            실제 소요 {timer.seconds.toFixed(1)}초 · 입력 {timer.inputs()}회 ·
            체력 피해 {battleSummary(s).hpLost}
          </p>
          <button
            className="primary"
            onClick={() =>
              onResult({ seconds: timer.seconds, inputs: timer.inputs() })
            }
          >
            결과 확인 / 계속
          </button>
          <button
            onClick={() => {
              timer.reset();
              setTop(undefined);
              setBottom(undefined);
              onRetry();
            }}
          >
            같은 시드 재시작
          </button>
          <button onClick={() => download({ ...s, summary: battleSummary(s) })}>
            로그 JSON
          </button>
        </Modal>
      )}
    </div>
  );
}
export function download(value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "bigger-green-vill-log.json";
  a.click();
  URL.revokeObjectURL(url);
}
