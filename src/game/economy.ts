import data from "../content/rewards.v0.3.2.json";
export const economy = data;
export const ECONOMY_VERSION = "0.3.2-economy-trial-1" as const;
export const economyTrial = {
    approval: "user_confirmed_decisions",
    goldPerWin: 12,
    cardChoices: 3,
    itemChoices: 2,
    itemSlots: 2,
    duplicatePolicy: "no_duplicates",
    exhaustion: "claim_additional_30_gold",
    exhaustionGold: 30,
    pricePolicy: "seeded_integer_in_confirmed_range",
    restock: false,
    startBoon: "preserved_screen_no_extra_grant",
    shopServices: false,
    activeTiming: "ready_or_between_card_faces",
    reactiveOrder: "item_then_R07_then_effect",
    startTile: "any_unoccupied_graph_node_enemy_layout_visible",
    unusedShoeRefund: false,
    finalReward: false,
} as const;
export const itemById = Object.fromEntries(economy.items.map((x) => [x.id, x]));
export const relicById = Object.fromEntries(economy.relics.map((x) => [x.id, x]));
