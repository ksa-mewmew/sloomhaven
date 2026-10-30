import type { Ruleset } from "../game/rulesets";
import { useEffect, useState } from "react";
import { cards, content } from "../game/data";
import type { Side } from "../game/types";
import { CardView, Modal } from "./BattleScreen";
export function CardComparison({ owned, equipped, upgrades = {}, ruleset, }: {
    owned: string[];
    equipped: string[];
    upgrades?: Record<string, Side[]>;
    ruleset?: Ruleset;
}) {
    const [open, setOpen] = useState(false);
    return (<>
      <button onClick={() => setOpen(true)}>보유 / 출전 전체 카드 비교</button>
      {open && (<Modal title="보유 / 출전 카드 비교" close={() => setOpen(false)}>
          <div className="full-card-grid">
            {owned.map((id) => (<div key={id}>
                <p>{equipped.includes(id) ? "✓ 출전" : "보유 · 예비"}</p>
                <CardView id={id} upgrade={upgrades[id]} ruleset={ruleset}/>
              </div>))}
          </div>
        </Modal>)}
    </>);
}
export function DeckEditor({ owned, equipped, capacity, minimum = capacity, upgrades = {}, onSave, onStart, ruleset, }: {
    owned: string[];
    equipped: string[];
    capacity: number;
    minimum?: number;
    upgrades?: Record<string, Side[]>;
    ruleset?: Ruleset;
    onSave: (ids: string[]) => void;
    onStart?: () => void;
}) {
    const [draft, setDraft] = useState(equipped), [inspect, setInspect] = useState(owned[0]), [notice, setNotice] = useState("");
    useEffect(() => {
        setDraft(equipped);
    }, [equipped]);
    const dirty = JSON.stringify(draft) !== JSON.stringify(equipped);
    const valid = draft.length >= minimum &&
        draft.length <= capacity &&
        new Set(draft).size === draft.length &&
        draft.every((id) => owned.includes(id));
    function toggle(id: string) {
        setInspect(id);
        if (draft.includes(id)) {
            setDraft(draft.filter((x) => x !== id));
            setNotice("카드를 뺐습니다. 빈 칸을 채운 뒤 저장하세요.");
        }
        else if (draft.length >= capacity)
            setNotice(`정원 ${capacity}장입니다. 출전 카드 한 장을 먼저 빼세요.`);
        else {
            setDraft([...draft, id]);
            setNotice("편성 변경 · 저장 대기");
        }
    }
    return (<section className="deck-editor panel" aria-label="출전 덱 편집">
      <header className="deck-controls">
        <div>
          <h2>
            출전 덱 편집 ·{" "}
            <output>
              {draft.length}/{capacity}
            </output>
          </h2>
          <p role="status">
            {valid
            ? "✓ 유효한 구성"
            : `미완성 · ${capacity - draft.length}장을 더 넣으세요`}
            {dirty ? " · 저장 전 변경 있음" : " · 저장된 구성"}
          </p>
        </div>
        <div>
          <button disabled={!valid} onClick={() => {
            onSave([...draft]);
            setNotice("✓ 편성을 저장했습니다.");
        }}>
            편성 저장
          </button>
          <button onClick={() => {
            setDraft(equipped);
            setNotice("마지막 저장 구성으로 되돌렸습니다.");
        }}>
            되돌리기
          </button>
          <button onClick={() => {
            setDraft([...content.character.initialEquippedCards]
                .filter((id) => owned.includes(id))
                .slice(0, capacity));
            setNotice(capacity === 9
                ? "기본 8장을 복원했습니다. 추가 한 장을 고르세요."
                : "기본 구성을 복원했습니다. 저장하세요.");
        }}>
            기본 구성 복원
          </button>
          {onStart && (<button className="primary" disabled={!valid || dirty} onClick={onStart}>
              편성 확정 / 전투 시작
            </button>)}
        </div>
      </header>
      <p className="deck-notice" role="status">
        {notice ||
            "보유 카드에 포커스하거나 마우스를 올리면 양면 능력이 보입니다."}
        {onStart && dirty ? " · 전투 시작 전에 편성을 저장하세요." : ""}
      </p>
      <div className="deck-columns">
        <section className="deck-owned">
          <h3>보유 카드 {owned.length}장</h3>
          {owned.map((id) => (<div className="deck-row" key={id} onMouseEnter={() => setInspect(id)} onFocus={() => setInspect(id)}>
              <button data-deck-card={id} aria-pressed={draft.includes(id)} onClick={() => toggle(id)}>
                {draft.includes(id) ? "✓ 출전 · 빼기" : "+ 넣기"} · {id}{" "}
                {cards[id].name}
                {cards[id].top.loss || cards[id].bottom.loss
                ? " [소실 면 있음]"
                : ""}
              </button>
            </div>))}
        </section>
        <section className="deck-slots">
          <h3>출전 {capacity}칸</h3>
          <ol>
            {Array.from({ length: capacity }, (_, i) => (<li key={i}>
                {draft[i] ? (<button data-deck-slot={draft[i]} onMouseEnter={() => setInspect(draft[i])} onFocus={() => setInspect(draft[i])} onClick={() => toggle(draft[i])}>
                    {cards[draft[i]].name} · 빼기
                  </button>) : (<span className="empty-slot">빈 칸</span>)}
              </li>))}
          </ol>
        </section>
        <section className="deck-preview" aria-label="카드 상세">
          {inspect && <CardView id={inspect} upgrade={upgrades[inspect]} ruleset={ruleset}/>}
          <CardComparison owned={owned} equipped={draft} upgrades={upgrades} ruleset={ruleset}/>
        </section>
      </div>
    </section>);
}
export function UpgradePicker({ options, upgrades, onChoose, ruleset, }: {
    options: {
        id: string;
        side: Side;
    }[];
    upgrades: Record<string, Side[]>;
    ruleset?: Ruleset;
    onChoose: (id: string, side: Side) => void;
}) {
    const [pick, setPick] = useState<{
        id: string;
        side: Side;
    }>();
    return (<>
      <div className="upgrade-options">
        {options.map((x) => (<button key={x.id + x.side} onClick={() => setPick(x)}>
            {cards[x.id].name} · {x.side === "top" ? "상단 공격" : "하단 방어"}{" "}
            +1 비교
          </button>))}
      </div>
      {pick && (<Modal title="강화 전 / 후 확인" close={() => setPick(undefined)}>
          <div className="upgrade-comparison">
            <section>
              <h3>현재 능력</h3>
              <CardView id={pick.id} upgrade={upgrades[pick.id]} ruleset={ruleset}/>
            </section>
            <section>
              <h3>
                강화 후 · {pick.side === "top" ? "첫 공격 +1" : "첫 방어도 +1"}
              </h3>
              <CardView id={pick.id} upgrade={[...(upgrades[pick.id] ?? []), pick.side]} ruleset={ruleset}/>
            </section>
          </div>
          <button className="primary" onClick={() => onChoose(pick.id, pick.side)}>
            이 강화 확정
          </button>
        </Modal>)}
    </>);
}
