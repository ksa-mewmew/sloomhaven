import { StatusHelp } from "./StatusHelp";
import { content } from "../game/data";
import { economy, economyTrial } from "../game/economy";
export function RulesGuide() {
  return (
    <div className="rules-guide">
      <section>
        <h3>방문 기록과 출전 덱</h3>
        <p>
          {content.run.totalBattles}개의 전투를 거쳐 마지막 전투를 마치세요.
          기본 출전은 8장, 여분의 장부가 있으면 최대 9장입니다. 전투 시작 시
          출전 카드 전체를 손에 받습니다.
        </p>
      </section>
      <section>
        <h3>두 장으로 한 턴 구성</h3>
        <p>
          손패에서 서로 다른 두 장을 고르면 왼쪽에 행동 구성 창이 열립니다. 한
          장의 상단과 다른 장의 하단을 배정하세요. 인쇄 효과 대신 상단 기본 공격
          3 또는 하단 기본 이동 1을 쓸 수 있습니다. 상단→하단, 하단→상단 순서를
          고를 수 있으며 한 면 안의 효과 순서는 바뀌지 않습니다.
        </p>
      </section>
      <section>
        <h3>버림·소실·짧은 휴식</h3>
        <p>
          사용한 카드는 보통 버림으로, 소실 효과는 소실 구역으로 갑니다. 버림이
          2장 이상이면 짧은 휴식으로 무작위 1장을 소실하고 나머지를 회수합니다.
          예언자의 눈은 후보 2장 중 소실할 1장을 고릅니다. 손과 버림에 사용할
          카드가 부족하면 카드 탈진으로 패배합니다.
        </p>
        <p>
          한 공격의 HP 피해를 받기 전에 손 카드 1장 또는 버림 카드 2장을 소실해
          그 타격의 피해를 무효화할 수 있습니다. 다단 공격의 다른 타격까지 함께
          막지는 않습니다.
        </p>
      </section>
      <section>
        <h3>전장과 적 행동</h3>
        <p>
          연결된 노드를 따라 이동하고 그래프 거리로 사거리를 판정합니다. @는
          방문자, 문자는 적입니다. 적을 가리키거나 포커스하면 상세를 읽고
          클릭하면 고정합니다. 적 패턴과 단계 순서는 확정되지만 경로는 실제 이동
          단계 시작 시 현재 위치와 점유로 다시 계산합니다. 추적 공격은 현재
          방문자 위치, 지정 칸 공격은 예고한 칸을 겨냥합니다.
        </p>
        <p>
          밀치기와 당기기는 처음 정한 방향으로만 진행하며 장애물·점유·경계에서
          멈춥니다. 우회나 기본 충돌 피해는 없습니다. 적은 서로를 공격하지
          않습니다.
        </p>
      </section>
      <StatusHelp />
      <section>
        <h3>보상과 상점</h3>
        <p>
          시작 자금 {economy.starting_economy.initial_gold}G로 시작 상점에
          갑니다. 마지막 전투 이전의 승리마다 {economyTrial.goldPerWin}G와 카드{" "}
          {economy.battle_rewards.bonus_type_one_roll.card * 100}%·아이템{" "}
          {economy.battle_rewards.bonus_type_one_roll.item * 100}%·유물{" "}
          {economy.battle_rewards.bonus_type_one_roll.relic * 100}% 중 한 유형을
          받습니다. 후보가 없으면 추가 {economyTrial.exhaustionGold}G를
          받습니다. 중복 보유는 불가합니다.
        </p>
        <p>
          3·7전투 뒤 HP {economy.regional_rest.heal_hp} 회복, 시작·5·9전투 뒤
          상점이 있습니다. 상점의 카드3·아이템3·유물2 중 시작 유물은 일반만
          나옵니다. 가격은 정해진 범위에서 시드로 정하고 방문 중 유지합니다.
          구매하면 품절이며 재입고·환불은 없습니다. 카드 강화 획득과 상점
          강화·회복 서비스는 현재 비활성화되어 있습니다.
        </p>
      </section>
      <section>
        <h3>아이템과 유물</h3>
        <p>
          아이템은 {economyTrial.itemSlots}개까지 장착하고 카드 행동을 소모하지
          않고 사용합니다. 능동 아이템은 자기 턴 시작이나 두 카드 면 사이,
          두꺼운 외투는 피해 선택창, 무릎 보호대는 강제 이동 직전에 사용합니다.
          다음 전투에 충전되고 두꺼운 외투·손전등은 짧은 휴식 후에도
          재사용합니다. 유물은 지속 또는 조건부 효과이며 전투의 아이템/유물
          창에서 확인할 수 있습니다.
        </p>
      </section>
      <section>
        <h3>마우스·키보드</h3>
        <p>
          카드 호버·포커스로 양면을 확대합니다. 클릭·Enter·Space로 선택/해제하고
          두 장을 고른 뒤 행동을 배정하세요. 적도 호버·포커스로 읽고
          클릭·Enter·Space로 고정할 수 있습니다. Esc는 일반 창이나 선택을 닫으며
          피해·휴식 등 필수 결정은 취소하지 않습니다. H는 규칙 안내입니다. 카드
          전체 보기는 보조 열람 창입니다.
        </p>
      </section>
    </div>
  );
}
