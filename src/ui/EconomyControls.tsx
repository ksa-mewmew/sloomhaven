import { useState } from "react";
import { Modal } from "./BattleScreen";
import { economy, itemById } from "../game/economy";
import { itemAvailable } from "../game/engine";
import { boardOf, distance, living } from "../game/board";
import type { Battle, Command, Status } from "../game/types";
export function EconomyControls({ s, send, }: {
    s: Battle;
    send: (c: Command) => void;
}) {
    const [open, setOpen] = useState(false), [target, setTarget] = useState(""), [cleanse, setCleanse] = useState<Status>("poison");
    const e = s.economy;
    if (!e)
        return null;
    const pending = e.startPending[0];
    const reaction = s.prompt?.kind === "forceReaction";
    return (<>
      <button onClick={() => setOpen(true)}>
        아이템 · {e.items.length} / 유물
      </button>
      {pending && (<Modal title={pending === "tile"
                ? "그림자 발걸음 · 시작 칸 선택"
                : "고장 난 인터폰 · 적 선택"}>
          <p>
            확정 정책: 배치를 공개한 뒤 선택합니다. 선택은 카드 행동을 소모하지
            않습니다.
          </p>
          {pending === "tile" ? (<div className="grid">
              {boardOf(s)
                    .nodes.filter((n) => !living(s).some((x) => x.node === n.id))
                    .map((n) => (<button key={n.id} onClick={() => send({ type: "startChoice", node: n.id })}>
                    {n.id}에서 시작
                  </button>))}
            </div>) : (living(s).map((x) => (<button key={x.id} onClick={() => send({ type: "startChoice", target: x.id })}>
                {x.id} · 약화 1
              </button>)))}
        </Modal>)}
      {reaction && (<Modal title="강제 이동 반응">
          <p>
            무릎 보호대로 이번 밀치기/당기기 전체를 취소할 수 있습니다. 적용
            순서: 아이템 사용 → R07 방어 → 강제 이동 취소.
          </p>
          <button onClick={() => send({ type: "forceReaction", use: true })}>
            I09 사용 · 강제 이동 무효화
          </button>
          <button onClick={() => send({ type: "forceReaction", use: false })}>
            강제 이동 그대로 받기
          </button>
        </Modal>)}
      {open && (<Modal title="아이템 / 유물" close={() => setOpen(false)}>
          <p>
            장착 장비는 전투당 1회, I02/I04는 짧은 휴식 후 재사용. 장착 2칸·반응
            순서는 확정 정책입니다.
          </p>
          <label>
            아이템 대상{" "}
            <select aria-label="아이템 대상" value={target} onChange={(x) => setTarget(x.target.value)}>
              <option value="">적 선택</option>
              {living(s).map((x) => (<option value={x.id} key={x.id}>
                  {x.id} · 거리 {distance(boardOf(s), s.player.node, x.node)}
                </option>))}
            </select>
          </label>
          <label>
            제거할 상태{" "}
            <select aria-label="제거할 상태" value={cleanse} onChange={(x) => setCleanse(x.target.value as Status)}>
              {(["poison", "bleed", "weak", "exposed"] as Status[]).map((x) => (<option key={x} value={x}>
                  {({
                    poison: "중독",
                    bleed: "출혈",
                    weak: "약화",
                    exposed: "노출",
                } as Record<string, string>)[x]}
                </option>))}
            </select>
          </label>
          {e.items.length === 0 && <p>장착한 아이템이 없습니다.</p>}
          {e.items.map((id) => {
                const item = itemById[id];
                let reason = e.used.includes(id)
                    ? "사용함"
                    : !itemAvailable(s, id)
                        ? "현재 사용 시점 아님"
                        : "";
                const victim = living(s).find((x) => x.id === target), range = victim
                    ? distance(boardOf(s), s.player.node, victim.node)
                    : Infinity;
                if (!reason &&
                    ["I04", "I05", "I06"].includes(id) &&
                    range > (id === "I05" ? 2 : 1))
                    reason = "범위 안의 적을 선택하세요";
                if (!reason &&
                    id === "I07" &&
                    !living(s).some((x) => distance(boardOf(s), s.player.node, x.node) === 1))
                    reason = "인접 적 없음";
                if (!reason &&
                    ["I03", "I08"].includes(id) &&
                    (!(id === "I03" ? ["poison", "bleed"] : ["weak", "exposed"]).includes(cleanse) ||
                        !s.player[cleanse]))
                    reason = "제거 가능한 상태를 선택하세요";
                return (<section className="panel" key={id}>
                <h3>
                  {id} {item.name}
                </h3>
                <p>{item.description}</p>
                <p>
                  {reason || "사용 가능"} ·{" "}
                  {item.recharge_on_short_rest
                        ? "짧은 휴식 재충전"
                        : "다음 전투 재충전"}
                </p>
                <button disabled={!!reason || id === "I09"} onClick={() => send({ type: "item", id, target, status: cleanse })}>
                  {item.name} 사용
                </button>
              </section>);
            })}
          <h2>유물 · 전투 발동 기록</h2>
          {s.relics.map((id) => {
                const r = economy.relics.find((x) => x.id === id)!;
                return (<section className="panel" key={id}>
                <h3>
                  {r.name} · {r.rarity}
                </h3>
                <p>
                  {r.description} ·{" "}
                  {r.acquisition === "shop_only"
                        ? "상점 전용"
                        : r.acquisition === "battle_reward_only"
                            ? "전투 보상 전용"
                            : "상점/전투"}
                </p>
                <p>
                  기록 {s.log.filter((x) => x.event === "relic_" + id).length}회
                </p>
              </section>);
            })}
        </Modal>)}
    </>);
}
