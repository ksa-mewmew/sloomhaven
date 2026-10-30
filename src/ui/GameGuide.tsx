import { StatusHelp } from "./StatusHelp";

/** Public-facing rules; keep this aligned with the live engine and economy rules. */
export function GameGuide() {
    return (<div className="game-guide">
      <section className="guide-section">
        <h2>목표와 진행</h2>
        <p>
          낯선 아파트를 빠져나가세요. 방문자 한 명으로 총 10번의 전투를
          치릅니다. 전투 사이에는 카드를 편성하고 보상을 획득할 수 있습니다.
          체력이 0이 되거나 더 이상 싸울 카드가 없으면 패배할 수 있습니다.
        </p>
        <p>
          시작 자금은 <strong>100G</strong>입니다. 시작 전에 상점을 방문하고,
          3·7번째 전투 뒤에는 <strong>체력 8 회복</strong>,
          5·9번째 전투 뒤에는 <strong>상점 방문</strong> 기회가 있습니다.
          구역 휴식에서는 현재 카드를 강화할 수 없습니다.
        </p>
      </section>
      <section className="guide-section">
        <h2>한 턴에 카드 두 장</h2>
        <ol>
          <li>적이 이번 턴에 할 행동과 그 <strong>순서</strong>를 먼저 확인합니다.</li>
          <li>손에 있는 서로 다른 카드 두 장을 선택해, 한 장의 <strong>상단</strong>과 다른 한 장의 <strong>하단</strong>을 사용합니다.</li>
          <li>상단→하단 또는 하단→상단 순서를 정합니다. 한 면에 여러 단계가 있으면 그 면의 단계를 순서대로 모두 처리합니다.</li>
          <li>플레이어의 행동이 끝나면 살아 있는 적들이 예고한 행동을 차례대로 실행합니다.</li>
        </ol>
        <p>
          카드에 적힌 행동 대신 상단은 <strong>기본 공격 3</strong>,
          하단은 <strong>기본 이동 1</strong>로 바꿀 수 있습니다.
          손패는 전투 시작 시 출전 카드 전부이며, 매 턴 새 카드를 뽑지 않습니다.
        </p>
      </section>
      <section className="guide-section">
        <h2>이동과 공격</h2>
        <p>
          전장에서는 연결된 칸으로 움직입니다. 별도 사거리가 적히지 않은
          공격은 인접한 적을 대상으로 합니다. 적의 이동은 예고 시 미리
          실행되지 않으며, 실제 이동 단계가 시작될 때 <strong>그때의 위치</strong>를
          기준으로 경로를 계산합니다.
        </p>
        <p>
          적의 <strong>추적 공격</strong>은 공격할 때의 플레이어 위치를 노립니다.
          <strong> 지정 칸 공격</strong>은 예고된 칸을 노리므로 그 칸에서 벗어나면
          피할 수 있습니다. 적의 공격 예고와 예상 경로를 비교해 카드를 고르세요.
          밀치기·당기기는 정해진 한 방향으로만 이동하며 장애물에서 멈춥니다.
        </p>
      </section>
      <section className="guide-section">
        <h2>버림·소실·짧은 휴식</h2>
        <p>
          사용한 카드는 보통 버림으로 갑니다. <strong>소실</strong> 표기가 있는
          행동을 사용하면 그 카드는 이번 전투 동안 돌아오지 않습니다.
          버림 카드가 두 장 이상이면 <strong>짧은 휴식</strong>으로 버림 카드를
          회수하되, 그중 무작위 한 장이 소실됩니다.
        </p>
        <p>
          적의 공격으로 받을 HP 피해는 <strong>손에 있는 카드 1장</strong> 또는
          <strong> 버림 카드 2장</strong>을 소실해 해당 한 번의 피해를
          무효화할 수 있습니다. 체력과 카드를 함께 관리하는 것이 중요합니다.
        </p>
      </section>
      <section className="guide-section">
        <h2>아이템·유물·상점</h2>
        <div className="guide-kind-list">
          <p><strong>카드</strong> — 전투에서 사용할 상단/하단 행동. 보유 카드 가운데
            출전 카드 8장을 편성합니다(「여분의 장부」가 있으면 최대 9장).</p>
          <p><strong>아이템</strong> — 전투 중 버튼으로 직접 쓰거나 공격을 받을
            때 반응해 쓰는 장비. 최대 <strong>2개 장착</strong>하며, 사용 횟수는
            <strong> 다음 전투에 회복</strong>됩니다. 「두꺼운 외투」와
            「손전등」은 전투 중 짧은 휴식 후에도 다시 사용할 수 있습니다.
            아이템을 써도 카드 상·하단 행동은 소비하지 않습니다.</p>
          <p><strong>유물</strong> — 획득하면 지속적으로 적용되는 특별한 효과.
            아이템처럼 사용 버튼을 누르거나 전투마다 장착할 필요가 없습니다.
            일부 유물은 전투 시작 시 선택하거나 정해진 조건에서 자동 발동합니다.</p>
        </div>
        <p>
          전투 1~9에서 승리하면 <strong>12G와 보상 한 종류</strong>를
          받습니다. 보상 유형은 카드 60%, 아이템 30%, 유물 10%로 결정됩니다.
          카드라면 최대 3장 중 1장, 아이템이라면 최대 2개 중 1개를 고르고,
          유물은 제시된 하나를 받습니다. 상점에서는
          <strong> 카드 3종 / 아이템 3종 / 유물 2종</strong>을 판매합니다.
          시작 상점에는 일반 유물만 등장합니다.
        </p>
      </section>
      <section className="guide-section">
        <h2>상태이상과 조작</h2>
        <StatusHelp />
      </section>
    </div>);
}
