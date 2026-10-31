import legacyPhase0 from "../content/legacy-phase0.json";
import { LEGACY_RULES } from "../game/rulesets";
import { validateFoundation } from "../game/foundation";
import { RulesGuide } from "./RulesGuide";
import { economy, itemById, relicById } from "../game/economy";
import { DeckEditor, CardComparison, UpgradePicker } from "./DeckEditor";
import { StatusHelp } from "./StatusHelp";
import {
  flavor,
  variantFlavor,
  relicFlavor,
  enemyFlavor,
} from "../game/presentation";
import React, { useEffect, useState } from "react";
import {
  archetypes,
  cards,
  content,
  encounters,
  presentation,
  validateContent,
} from "../game/data";
import { createBattle, applyCommand } from "../game/engine";
import {
  applyRunCommand,
  capacity,
  createRun,
  upgradesAvailable,
  zoneFor,
} from "../game/campaign";
import type { Run, RunCommand, Reward } from "../game/campaign";
import {
  SAVE_KEY,
  preserveV031,
  V031_ARCHIVE_KEY,
  loadRun,
  serializeRun,
  preserveLegacy,
  LEGACY_ARCHIVE_KEY,
  preservePrevious,
  PREVIOUS_ARCHIVE_KEY,
  preserveV03,
  V03_ARCHIVE_KEY,
} from "../game/save";
import type { Battle, Command } from "../game/types";
import { migrateLocalScenarioRecords, preserveScenarioSave } from "../game/scenarioIds";
import { battleSummary, runSummary } from "../game/telemetry";
import {
  BattleScreen,
  Modal,
  CardView,
  download,
  intentText,
  scenarioName,
} from "./BattleScreen";
type Page =
  | "menu"
  | "new"
  | "practice"
  | "codex"
  | "cards"
  | "settings"
  | "run"
  | "practiceBattle";
export default function App() {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [hasV031] = useState(() => preserveV031(localStorage));
  const [hasV03] = useState(() => preserveV03(localStorage));
  const [hasPrevious] = useState(() => preservePrevious(localStorage));
  const [hasLegacy] = useState(() => preserveLegacy(localStorage));
  const [page, setPage] = useState<Page>("menu"),
    [run, setRun] = useState<Run>(),
    [battle, setBattle] = useState<Battle>(),
    [practiceInitial, setPI] = useState<Battle>(),
    [error, setError] = useState(""),
    [seed, setSeed] = useState("holiday-2026"),
    [hp, setHp] = useState(20),
    [practiceOwned, setPO] = useState<string[]>([
      ...content.character.initialOwnedCards,
    ]),
    [practiceDeck, setPD] = useState<string[]>([
      ...content.character.initialEquippedCards,
    ]),
    [practiceCap, setPC] = useState(8),
    [relics, setRelics] = useState<string[]>([]),
    [textScale, setTextScale] = useState(
      () => localStorage.getItem("third-day/text-scale") ?? "100",
    ),
    [hasSave, setHasSave] = useState(() => !!localStorage.getItem(SAVE_KEY));
  useEffect(() => {
    try {
      preserveScenarioSave(localStorage, SAVE_KEY);
      migrateLocalScenarioRecords(localStorage);
    } catch (e) {
      setError("기록 변환 실패 · 원본을 보존했습니다: " + String(e));
    }
  }, []);
  useEffect(() => {
    const sync = () =>
      document.body.style.setProperty(
        "--app-zoom",
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
    document.documentElement.style.fontSize = textScale + "%";
    localStorage.setItem("third-day/text-scale", textScale);
  }, [textScale]);
  useEffect(() => {
    if (run) {
      try {
        preserveScenarioSave(localStorage, SAVE_KEY);
        localStorage.setItem(SAVE_KEY, serializeRun(run));
        setHasSave(true);
      } catch (e) {
        setError("로컬 저장 실패: " + String(e));
      }
    }
  }, [run]);
  function safe(fn: () => void) {
    try {
      fn();
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }
  function send(c: RunCommand) {
    safe(() => {
      const next = applyRunCommand(run!, c);
      if (c.type === "startBattle")
        localStorage.removeItem(
          "askew-apartment/timing/" +
            next.battle!.seed +
            "/" +
            next.battle!.variant,
        );
      setRun(next);
    });
  }
  function dispatch(c: Command) {
    safe(() => {
      if (page === "practiceBattle") setBattle(applyCommand(battle!, c));
      else setRun(applyRunCommand(run!, { type: "battle", command: c }));
    });
  }
  useEffect(() => {
    if (run && ["success", "failure"].includes(run.stage)) {
      const history = JSON.parse(
        localStorage.getItem("third-day/history") ?? "[]",
      );
      localStorage.setItem(
        "third-day/history",
        JSON.stringify([
          ...history,
          {
            seed: run.seed,
            result: run.stage,
            battles: run.completed.length,
            date: new Date().toISOString(),
          },
        ]),
      );
    }
  }, [run?.stage]);
  const menu = () => {
    setPage("menu");
    setError("");
  };
  const current =
    page === "practiceBattle"
      ? battle
      : page === "run" && run?.stage === "battle"
        ? run.battle
        : undefined;
  useEffect(() => {
    if (current) {
      const discovered: string[] = JSON.parse(
        localStorage.getItem("third-day/discovered") ?? "[]",
      );
      if (!discovered.includes(current.scenario))
        localStorage.setItem(
          "third-day/discovered",
          JSON.stringify([...discovered, current.scenario]),
        );
      if (page === "practiceBattle")
        localStorage.setItem("third-day/practice-log", JSON.stringify(current));
    }
  }, [current, page]);
  const banner = error && (
    <p className="error" role="alert">
      {error}
    </p>
  );
  if (current)
    return (
      <main className="battleHost">
        {banner}
        <BattleScreen
          key={current.scenario + current.seed + page}
          battle={current}
          gold={page === "run" ? run?.gold : undefined}
          onMedkit={page === "run" ? () => send({type:"medkit"}) : undefined}
          progress={
            page === "run" && run
              ? `${
                  (
                    flavor.story.zones as Record<
                      string,
                      {
                        name: string;
                      }
                    >
                  )[zoneFor(run).id]?.name ?? zoneFor(run).name
                } · ${run.completed.length + 1}/${content.run.totalBattles}`
              : "전투 연습 · " + current.variant
          }
          dispatch={dispatch}
          onExit={menu}
          onRetry={() =>
            safe(() => {
              if (page === "practiceBattle")
                setBattle(structuredClone(practiceInitial!));
              else
                setRun(applyRunCommand(run!, { type: "retryBattle" }));
            })
          }
          onResult={(metrics) =>
            safe(() => {
              const command: Command = {
                type: "recordMetrics",
                elapsedSeconds: metrics.seconds,
                inputCount: metrics.inputs,
              };
              if (page === "run") {
                setRun(
                  applyRunCommand(
                    applyRunCommand(run!, { type: "battle", command }),
                    { type: "report" },
                  ),
                );
              } else {
                const measured = applyCommand(current, command);
                localStorage.setItem(
                  "third-day/practice-log",
                  JSON.stringify({
                    ...measured,
                    summary: battleSummary(measured),
                  }),
                );
                setBattle(measured);
                setPage("practice");
              }
            })
          }
        />
      </main>
    );
  return (
    <main
      className={
        page === "run" && run?.stage === "deck" ? "deck-page" : undefined
      }
    >
      {banner}
      {rulesOpen && (
        <Modal title="규칙 안내" close={() => setRulesOpen(false)}>
          <RulesGuide legacy={page === "run" && run?.ruleset === LEGACY_RULES} />
        </Modal>
      )}
      {page === "menu" ? (
        <section className="menu panel">
          <small>
            v0.3.3
          </small>
          <h1>{flavor.story.title}</h1>
          <p>{flavor.story.tagline}</p>
          {hasV031 && (
            <p role="status">
              v0.3.1 저장은 원본과 백업으로 보존했습니다. 새 경제는 새 방문으로
              시작합니다.
            </p>
          )}
          {hasV03 && (
            <p role="status">
              v0.3 저장은 원본/백업으로 보존했습니다. AI 처리 규칙이 달라 새
              런으로 v0.3.1 시험 행동표를 적용합니다.
            </p>
          )}
          {hasPrevious && (
            <p role="status">
              v0.2 저장을 원본과 별도 백업으로 보존했습니다. 카드 효과가 달라
              v0.3으로 변환하지 않습니다. 새 방문을 시작하세요. 설정에서 이전
              저장을 내보낼 수 있습니다.
            </p>
          )}
          {hasLegacy && (
            <p role="status">
              v0.1의 5전투 저장은 원본과 별도 백업으로 보존했습니다. v0.3에서는
              새 방문을 시작하세요.
            </p>
          )}
          <p>
            {presentation.opening.map((line, i) => (
              <React.Fragment key={i}>
                {line}
                <br />
              </React.Fragment>
            ))}
          </p>
          <div className="menuButtons">
            <button onClick={() => setRulesOpen(true)}>규칙 안내</button>
            <button className="primary" onClick={() => setPage("new")}>
              들어가기
            </button>
            <button onClick={() => setPage("practice")}>전투 연습</button>
            <button
              disabled={!hasSave}
              onClick={() =>
                safe(() => {
                  setRun(loadRun(localStorage));
                  setPage("run");
                })
              }
            >
              이어하기
            </button>
            <button onClick={() => setPage("codex")}>
              {flavor.menus.codex}
            </button>
            <button onClick={() => setPage("cards")}>
              {flavor.menus.deck}
            </button>
            <button onClick={() => setPage("settings")}>설정 / 기록</button>
          </div>
          <p>
            <small>
              상단 한 장, 하단 한 장. 주민의 의도는 먼저 공개됩니다.
              <br />
              손의 기록이 다하면 짧은 휴식으로 회수하세요. 한 장은 돌아오지
              않습니다.
            </small>
          </p>
        </section>
      ) : (
        <>
          <div className="toolbar">
            <b>
              {flavor.story.title} <small>/ 방문자 기록</small>
            </b>
            <button onClick={() => setRulesOpen(true)}>규칙 안내</button>
            <button onClick={menu}>메인 메뉴</button>
          </div>
          {page === "new" && (
            <section className="menu panel">
              <small>새 방문 등록</small>
              <h1>{flavor.classes.visitor.title}</h1>
              <h3>방문자 · 체력 20 · 출전 8장</h3>
              <p>{flavor.classes.visitor.intro}</p>
              <p>{flavor.classes.visitor.selection}</p>
              {Object.entries(flavor.classes)
                .filter(([id]) => id !== "visitor")
                .map(([id, c]) => (
                  <details key={id}>
                    <summary>{c.name} · 미구현 / 선택 불가</summary>
                    <p>{c.intro}</p>
                    <button disabled>{c.name} 선택 불가</button>
                  </details>
                ))}
              <label>
                런 시드
                <input value={seed} onChange={(e) => setSeed(e.target.value)} />
              </label>
              <button
                onClick={() => setSeed("visit-" + Date.now().toString(36))}
              >
                시드 자동 생성
              </button>
              <p>같은 시드와 같은 선택은 같은 결과를 만듭니다.</p>
              <button
                className="primary"
                disabled={!seed.trim()}
                onClick={() =>
                  safe(() => {
                    setRun(createRun(seed));
                    setPage("run");
                  })
                }
              >
                방문자로 방문 시작
              </button>
            </section>
          )}
          {page === "codex" && (
            <>
              <StatusHelp />
              <h1>{flavor.menus.codex}</h1>
              <div className="grid">
                {Object.keys(archetypes).map((id) => {
                  const e = enemyFlavor(id);
                  return (
                    <article className="panel" key={id}>
                      <h2>{e?.name ?? archetypes[id].name}</h2>
                      <p>{e?.location}</p>
                      <p>{e?.flavor}</p>
                      <p>{e?.encounter}</p>
                      {archetypes[id].intents.map((i) => (
                        <p key={i.id}>
                          {e?.intents[i.id] ?? i.id}: {intentText(i)} · 가중치{" "}
                          {i.weight}/
                          {archetypes[id].intents.reduce(
                            (n, x) => n + x.weight,
                            0,
                          )}
                        </p>
                      ))}
                    </article>
                  );
                })}
                {economy.items.map((x) => (
                  <article className="panel" key={x.id}>
                    <h2>
                      {x.id} {x.name}
                    </h2>
                    <p>{x.description}</p>
                    <p>
                      전투당 1회 ·{" "}
                      {x.recharge_on_short_rest
                        ? "짧은 휴식 재사용"
                        : "다음 전투 재사용"}
                    </p>
                  </article>
                ))}
                {economy.relics.map((r) => (
                  <article className="panel" key={r.id}>
                    <h2>
                      {r.name} · {r.rarity}
                    </h2>
                    <p>{r.description}</p>
                    <p>{relicFlavor(r.id)}</p>
                  </article>
                ))}
              </div>
            </>
          )}
          {page === "cards" && (
            <>
              <h1>
                카드 목록 <small>20종 · v0.3</small>
              </h1>
              <div className="hand">
                {Object.keys(cards).map((id) => (
                  <CardView key={id} id={id} />
                ))}
              </div>
            </>
          )}
          {page === "settings" && (
            <section className="panel">
              <h1>설정 / 방문 기록</h1>
              {hasV031 && (
                <button
                  onClick={() => {
                    const raw = localStorage.getItem(V031_ARCHIVE_KEY)!;
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(
                      new Blob([raw], { type: "application/json" }),
                    );
                    a.download = "greenville-v0.3.1-original.json";
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  v0.3.1 원본 저장 내보내기
                </button>
              )}
              <StatusHelp />
              <label>
                글자 크기{" "}
                <select
                  value={textScale}
                  onChange={(e) => setTextScale(e.target.value)}
                >
                  <option value="100">기본</option>
                  <option value="115">크게</option>
                  <option value="130">아주 크게</option>
                </select>
              </label>
              <p>
                각 선택 직후 자동 저장됩니다. 연습 전투는 런 저장을 변경하지
                않습니다.
              </p>
              <p>
                발견한 사건:{" "}
                {JSON.parse(
                  localStorage.getItem("third-day/discovered") ?? "[]",
                ).join(", ") || "없음"}
              </p>
              <button
                onClick={() =>
                  safe(() => {
                    validateContent(); validateFoundation();
                    location.reload();
                  })
                }
              >
                데이터 다시 불러오기
              </button>
              <button
                onClick={() =>
                  download({
                    history: JSON.parse(
                      localStorage.getItem("third-day/history") ?? "[]",
                    ),
                    practice: JSON.parse(
                      localStorage.getItem("third-day/practice-log") ?? "null",
                    ),
                    run,
                  })
                }
              >
                방문 기록 JSON 내보내기
              </button>
              {hasV03 && (
                <button
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(
                      new Blob([localStorage.getItem(V03_ARCHIVE_KEY)!], {
                        type: "application/json",
                      }),
                    );
                    a.download = "greenville-v0.3-original.json";
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  v0.3 원본 저장 내보내기
                </button>
              )}
              {hasPrevious && (
                <button
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(
                      new Blob([localStorage.getItem(PREVIOUS_ARCHIVE_KEY)!], {
                        type: "application/json",
                      }),
                    );
                    a.download = "greenville-v0.2-original.json";
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  v0.2 원본 저장 내보내기
                </button>
              )}
              {hasLegacy && (
                <button
                  onClick={() =>
                    download(
                      JSON.parse(localStorage.getItem(LEGACY_ARCHIVE_KEY)!),
                    )
                  }
                >
                  v0.1 원본 저장 내보내기
                </button>
              )}
              <pre>
                {JSON.stringify(
                  JSON.parse(localStorage.getItem("third-day/history") ?? "[]"),
                  null,
                  2,
                )}
              </pre>
            </section>
          )}
          {page === "practice" && (
            <>
              <h1>
                전투 연습 <small>정상 런과 독립된 기록</small>
              </h1>
              <section className="panel">
                <label>
                  시드
                  <input
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                  />
                </label>
                <button
                  onClick={() => setSeed("practice-" + Date.now().toString(36))}
                >
                  새 시드
                </button>
                <label>
                  시작 HP
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={hp}
                    onChange={(e) =>
                      setHp(Math.max(1, Math.min(999, Number(e.target.value))))
                    }
                  />
                </label>
                <label>
                  출전 수
                  <input
                    type="number"
                    min="2"
                    max="20"
                    value={practiceCap}
                    onChange={(e) =>
                      setPC(Math.max(2, Math.min(20, Number(e.target.value))))
                    }
                  />
                </label>
                <p>
                  보유 풀:{" "}
                  <button
                    onClick={() => {
                      setPO([...content.character.initialOwnedCards]);
                      setPD([...content.character.initialEquippedCards]);
                      setPC(8);
                    }}
                  >
                    시작 카드 8장 / 초기 편성
                  </button>
                  <button onClick={() => setPO(Object.keys(cards))}>
                    전체 20종 보유
                  </button>
                </p>
                {economy.relics.map((r) => (
                  <label className="badge" key={r.id}>
                    <input
                      type="checkbox"
                      checked={relics.includes(r.id)}
                      onChange={() =>
                        setRelics(
                          relics.includes(r.id)
                            ? relics.filter((id) => id !== r.id)
                            : [...relics, r.id],
                        )
                      }
                    />
                    {r.name}
                  </label>
                ))}
              </section>
              <DeckEditor
                key={practiceCap + practiceOwned.join()}
                owned={practiceOwned}
                equipped={practiceDeck}
                capacity={practiceCap}
                onSave={setPD}
              />
              <div className="grid">
                {Object.values(encounters)
                  .flatMap((e) => e.variants.map((v) => v.id))
                  .map((id) => (
                    <Scenario
                      key={id}
                      id={id}
                      action={
                        <button
                          className="primary"
                          onClick={() =>
                            safe(() => {
                              if (practiceDeck.length !== practiceCap)
                                throw Error(
                                  `출전 카드 ${practiceCap}장을 선택하세요`,
                                );
                              const b = createBattle(
                                id.split("-")[0],
                                seed,
                                practiceDeck,
                                hp,
                                hp,
                                relics,
                                {},
                                id,
                                { items: [] },
                              );
                              localStorage.removeItem(
                                "askew-apartment/timing/" +
                                  b.seed +
                                  "/" +
                                  b.variant,
                              );
                              setBattle(b);
                              setPI(structuredClone(b));
                              setPage("practiceBattle");
                            })
                          }
                        >
                          이 전투 연습
                        </button>
                      }
                    />
                  ))}
              </div>
            </>
          )}
          {page === "run" && run && (
            <>
              <header className="battleHeader">
                <div>
                  <small>{run.ruleset === LEGACY_RULES ? "이전 규칙 · HP40/구 전장 방문 · " : ""}시드 {run.seed}</small>
                  <h1>
                    {(
                      flavor.story.zones as Record<
                        string,
                        {
                          name: string;
                        }
                      >
                    )[zoneFor(run).id]?.name ?? zoneFor(run).name}{" "}
                    ·{" "}
                    {Math.min(
                      content.run.totalBattles,
                      run.completed.length + 1,
                    )}
                    /{content.run.totalBattles} 전투
                  </h1>
                </div>
                <div className="vitals">
                  <b>
                    HP {run.hp}/{run.maxHp} · {run.gold}G
                  </b>
                  <span>
                    보유 {run.owned.length} · 출전 {capacity(run)}
                  </span>
                </div>
              </header>
              <p>
                {
                  (
                    flavor.story.zones as Record<
                      string,
                      {
                        intro: string;
                      }
                    >
                  )[zoneFor(run).id]?.intro
                }
              </p>
              <p>
                {run.relics.map((id) => (
                  <span
                    className="badge"
                    key={id}
                    title={
                      (economy.relics.find((r) => r.id === id)?.description ??
                        "") +
                      " / " +
                      relicFlavor(id)
                    }
                  >
                    {economy.relics.find((r) => r.id === id)?.name}
                  </span>
                ))}
              </p>
              {["start", "reward", "zoneRest"].includes(run.stage) && (
                <>
                  {run.stage === "zoneRest" && (
                    <p>
                      {
                        (
                          flavor.story.zones as Record<
                            string,
                            {
                              outro: string;
                            }
                          >
                        )[
                          content.run.zones.find((z) =>
                            z.stages.includes(run.completed.length),
                          )!.id
                        ]?.outro
                      }
                    </p>
                  )}
                  <h2>
                    {run.stage === "zoneRest" && run.ruleset !== LEGACY_RULES ? "응급약 1개를 보급합니다. HP 회복은 지급하지 않습니다." : run.stage === "start"
                      ? flavor.menus.startReward
                      : run.stage === "zoneRest"
                        ? (run.ruleset === LEGACY_RULES ? flavor.menus.zoneBreak + " · HP +8 전용" : "구역 보급 · 응급약 +1")
                        : flavor.menus.battleReward}
                  </h2>
                  <p>
                    {run.stage === "start"
                      ? "기본 자금 100G 지급 완료. 추가 지급 없이 시작 상점으로 진행합니다."
                      : run.stage === "reward"
                        ? `승리 골드 +${run.rewardGold}G 지급 완료. 후보 중 하나를 획득하세요.`
                        : "구역 보급을 받습니다. 강화 기능은 현재 비활성화했습니다."}
                  </p>
                  <div className="reward-offers">
                    {run.rewards.map((reward) => (
                      <section className="reward-panel" key={reward.id} data-reward={reward.kind}>
                        <h3>{rewardTitle(reward)}</h3>
                        {reward.kind === "card" ? (
                          <div className="offer-grid card-offers">
                            {reward.cards?.map((id) => (
                              <section className="offer-tile" key={id}>
                                <CardView id={id} ruleset={run.ruleset} />
                                <button className="primary" onClick={() => send({type: "reward", id: reward.id, card: id})}>{cards[id].name} 획득</button>
                              </section>
                            ))}
                          </div>
                        ) : reward.kind === "item" ? (
                          <div className="offer-grid compact-offers">
                            {reward.items?.map((id) => (
                              <section className="offer-tile panel" key={id}>
                                <h3>{itemById[id].name}</h3>
                                <p>{itemById[id].description}</p>
                                <button className="primary" onClick={() => send({type: "reward", id: reward.id, card: id})}>{itemById[id].name} 획득</button>
                              </section>
                            ))}
                          </div>
                        ) : reward.kind === "upgrade" ? (
                          <UpgradePicker options={upgradesAvailable(run)} upgrades={run.upgrades} ruleset={run.ruleset} onChoose={(card, side) => send({type: "reward", id: reward.id, card, side})} />
                        ) : (
                          <div className="offer-tile panel">
                            {reward.kind === "relic" && <p>{relicById[reward.relic!].description}</p>}
                            <button className="primary" onClick={() => send({type: "reward", id: reward.id})}>{reward.kind === "relic" ? relicById[reward.relic!].name + " 획득" : "계속"}</button>
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                  {run.stage === "reward" && <details className="reward-comparison"><summary>보유 카드 비교</summary><CardComparison owned={run.owned} equipped={run.equipped} upgrades={run.upgrades} ruleset={run.ruleset} /></details>}
                </>
              )}
              {run.stage === "shop" && (
                <section className="panel shop-screen">
                  <header className="shop-heading"><h2>상점</h2><strong>{run.gold}G</strong>{run.completed.length === 0 && <small>시작 상점 · 일반 유물</small>}</header>
                  {(["card", "item", "relic"] as const).map(kind => (
                    <section className="shop-section" key={kind} data-shop-kind={kind}>
                      <h3>{kind === "card" ? "카드" : kind === "item" ? "아이템" : "유물"}</h3>
                      <div className={"offer-grid " + (kind === "card" ? "card-offers" : "compact-offers")}>
                        {run.stock.filter(x => x.kind === kind).map(x => (
                          <section className={"offer-tile shop-product " + (kind === "card" ? "" : "panel")} key={x.key} data-stock={x.key}>
                            {kind === "card" ? <CardView id={x.id} ruleset={run.ruleset} /> : <><h4>{kind === "item" ? itemById[x.id].name : relicById[x.id].name}</h4><p>{kind === "item" ? itemById[x.id].description : relicById[x.id].description}</p></>}
                            <div className="offer-purchase"><strong>{x.price}G</strong><button disabled={x.sold || run.gold < x.price} onClick={() => send({type: "buy", key: x.key})}>{x.sold ? "품절" : run.gold < x.price ? "골드 부족" : "구매"}</button></div>
                          </section>
                        ))}
                      </div>
                      {!run.stock.some(x => x.kind === kind) && <p>재고 없음</p>}
                    </section>
                  ))}
                  <button className="primary" onClick={() => send({type: "leaveShop"})}>상점 나가기</button>
                </section>
              )}
              {run.stage === "map" && (
                <>
                  <h2>{flavor.menus.runRoute}</h2>
                  <p>
                    완료한 사건:{" "}
                    {run.completed.map(scenarioName).join(" / ") || "없음"}
                  </p>
                  <div className="grid">
                    {run.choices.map((id) => (
                      <Scenario
                        key={id}
                        id={id}
                        action={
                          <button
                            className="primary"
                            onClick={() => send({ type: "scenario", id })}
                          >
                            이 사건 선택 / 덱 편집
                          </button>
                        }
                      />
                    ))}
                  </div>
                </>
              )}
              {run.stage === "deck" && (
                <section className="panel">
                  <h2>아이템 편성 · {run.equippedItems.length}/2</h2>
                  <p>
                    보관 중인 장비는 영구 소모되지 않습니다. 장착한 아이템만
                    전투에서 사용할 수 있습니다.
                  </p>
                  {run.items.length === 0 && <p>보유 아이템 없음</p>}
                  {run.items.map((id) => (
                    <label className="lossChoice" key={id}>
                      <input
                        type="checkbox"
                        checked={run.equippedItems.includes(id)}
                        disabled={
                          !run.equippedItems.includes(id) &&
                          run.equippedItems.length >= 2
                        }
                        onChange={() =>
                          send({
                            type: "equipItems",
                            ids: run.equippedItems.includes(id)
                              ? run.equippedItems.filter((x) => x !== id)
                              : [...run.equippedItems, id],
                          })
                        }
                      />
                      {itemById[id].name} · {itemById[id].description}
                    </label>
                  ))}
                </section>
              )}
              {run.stage === "deck" && (
                <DeckEditor
                  key={run.chosenVariant}
                  owned={run.owned}
                  equipped={run.equipped}
                  capacity={capacity(run)}
                  minimum={8}
                  upgrades={run.upgrades}
                    ruleset={run.ruleset}
                  onSave={(ids) => send({ type: "equip", ids })}
                  onStart={() => send({ type: "startBattle" })}
                />
              )}
              {["success", "failure"].includes(run.stage) && (
                <section className="panel result">
                  <h1>
                    {run.stage === "success"
                      ? flavor.menus.victory
                      : flavor.menus.gameOver}
                  </h1>
                  <p>
                    {run.completed.length}/{content.run.totalBattles} 사건 종결
                    · HP {run.hp}/{run.maxHp} · 시드 {run.seed}
                  </p>
                  <p>
                    {run.stage === "success"
                      ? flavor.story.ending.success.join(" ")
                      : flavor.story.ending.defeat.join(" ") +
                        " / " +
                        run.battle?.reason}
                  </p>
                  {run.stage === "success" && (
                    <>
                      <p>{flavor.story.zones.missing.outro}</p>
                      <p>{flavor.classes.visitor.escape}</p>
                    </>
                  )}
                  <button
                    className="primary"
                    onClick={() => {
                      setRun(createRun(run.seed));
                    }}
                  >
                    같은 시드로 새 런
                  </button>
                  <button
                    onClick={() =>
                      download({ ...run, summary: runSummary(run) })
                    }
                  >
                    전체 런 로그 JSON
                  </button>
                  <button onClick={menu}>메인 메뉴</button>
                  <details>
                    <summary>런 누적 통계 / 보상·덱 기록</summary>
                    <pre>{JSON.stringify(runSummary(run), null, 2)}</pre>
                  </details>
                </section>
              )}
              {run.reports.length > 0 && (
                <details className="panel">
                  <summary>지난 전투 결과 / 로그</summary>
                  {run.reports.map((b, i) => (
                    <div key={i}>
                      <h3>
                        {b.scenario} · {b.phase} · {b.turn}턴 · HP {b.startHp} →{" "}
                        {b.player.hp}
                      </h3>
                      <button onClick={() => download(b)}>
                        이 전투 로그 JSON
                      </button>
                      <pre>{JSON.stringify(b.stats, null, 2)}</pre>
                    </div>
                  ))}
                </details>
              )}
            </>
          )}
        </>
      )}
      <footer>
        외부 이미지와 폰트 없이 기록됩니다. · v0.3.3 · 모든 선택은 마우스로
        진행할 수 있습니다.
      </footer>
    </main>
  );
}
function rewardTitle(r: Reward) {
  if (r.id === "zone-medkit") return "응급약 +1";
  if (r.kind === "continue") return "시작 상점으로 · 기본 100G";
  if (r.kind === "item") return "아이템 최대 2개 중 1개";
  if (r.kind === "empty") return "후보 풀 고갈 · 추가 30G 수령";
  return r.kind === "hp"
    ? "현재 / 최대 체력 +5"
    : r.kind === "heal"
      ? `체력 ${r.amount ?? 5} 회복`
      : r.kind === "card"
        ? "카드 최대 3장 중 1장 획득"
        : r.kind === "upgrade"
          ? "보유 카드 강화"
          : `유물 · ${economy.relics.find((x) => x.id === r.relic)?.name}`;
}
function Scenario({ id, action, ruleset }: { id: string; action?: React.ReactNode; ruleset?: Run["ruleset"] }) {
  const scenarioId = id.split("-")[0],
    s = ruleset === LEGACY_RULES ? legacyPhase0.encounters.find(e => e.id === scenarioId)! : encounters[scenarioId];
  const variant = s.variants.find((v) => v.id === id) ?? s.variants[0];
  return (
    <article className="panel">
      <small>
        {variant.id} · {s.board} · 적 {variant.enemies.length}명
      </small>
      <h2>
        {scenarioName(scenarioId)} · 배치 {variant.id.split("-")[1]}
      </h2>
      <p>
        {
          (
            presentation.scenarios as Record<
              string,
              {
                intro: string;
              }
            >
          )[scenarioId]?.intro
        }
      </p>
      <p>
        <b>
          승리 조건:{" "}
          {s.objective === "survive"
            ? `${s.turnLimit}번의 적 행동 단계 생존 또는 전멸`
            : s.objective === "kill_target"
              ? `${s.turnLimit === undefined ? "턴 제한 없음 · " : s.turnLimit + "턴 내 "}${s.targetEnemyId} 처치`
              : "적 전멸"}
        </b>
      </p>
      {variant.enemies.map((e) => {
        const a = archetypes[e.archetype],
          skin = (
            presentation.enemies as Record<
              string,
              {
                displayName: string;
              }
            >
          )[e.archetype];
        return (
          <details key={e.id}>
            <summary>
              {e.id} {skin?.displayName ?? a.name} · HP {a.hp}
              {a.unkillable ? " · 불사" : ""} · 전체 행동 후보
            </summary>
            {a.intents.map((i) => (
              <p key={i.id}>
                {intentText(i)} · 가중치 {i.weight}/
                {a.intents.reduce((n, x) => n + x.weight, 0)}
              </p>
            ))}
          </details>
        );
      })}
      <p>{variantFlavor(variant.id)}</p>
      {action}
    </article>
  );
}
