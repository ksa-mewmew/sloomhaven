import { statusKeys, statusNames, statusHelp } from "../game/status";
export function StatusHelp() {
    return (<section className="status-help">
      <h3>상태이상 도움말 · 확정 6종</h3>
      <dl>
        {statusKeys.map((k) => (<div key={k}>
            <dt>{statusNames[k]}</dt>
            <dd>{statusHelp[k]}</dd>
          </div>))}
      </dl>
      <p>
        자기 행동 종료: 중독 → 출혈 → 무장해제 순서. 기절 및 관리인 오사 유도는
        이번 버전에 포함되지 않습니다.
      </p>
      <p>
        Tab으로 카드·적·버튼 이동, Enter/Space로 선택. Esc로 선택형 모달 닫기.
        피해 결제·휴식은 화면 버튼으로 결정합니다.
      </p>
    </section>);
}
