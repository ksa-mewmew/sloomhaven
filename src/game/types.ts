export type Status = "poison" | "weak" | "exposed" | "disarm" | "bind" | "bleed";
export type Side = "top" | "bottom";
export type PartyMode = "solo" | "duo";
export type CharacterId = "wanderer" | "mail_carrier";
export type EncounterModeConfig = {
    boardId: string;
    playerStartNodes: string[];
    enemies: { id: string; archetype: string; node: string }[];
};
export interface Step {
    basic?: boolean;
    type: string;
    damage?: number;
    amount?: number;
    distance?: number;
    range?: number | "any";
    target?: string;
    status?: Status;
    stacks?: number;
    condition?: string;
    bonus_damage?: number;
    pierce_block?: boolean;
    timing?: string;
    trigger?: string;
}
export interface Face {
    loss: boolean;
    steps: Step[];
}
export interface Card {
    id: string;
    name: string;
    pool: string;
    top: Face;
    bottom: Face;
}
export interface Board {
    id: string;
    kind: string;
    nodes: {
        id: string;
        x?: number;
        y?: number;
        index?: number;
    }[];
    edges: string[][];
}
export interface IntentStep {
    kind: string;
    mode?: "approach" | "retreat" | "maintain_range";
    maxSteps?: number;
    preferredRange?: number;
    targetPolicy?: "player_current" | "marked_tile" | "last_attack_target";
    distance?: number;
    damage?: number;
    amount?: number;
    range?: number;
    hits?: number;
    status?: {
        status: Status;
        stacks: number;
    };
    steps?: IntentStep[];
}
export interface Intent extends IntentStep {
    id: string;
    weight: number;
    previewLabel?: string;
}
export interface Archetype {
    id: string;
    name: string;
    hp: number;
    intents: Intent[];
    unkillable?: boolean;
    phase2AtHp?: number;
    phase2AttackBonus?: number;
}
export interface Encounter {
    id: string;
    name: string;
    board: string;
    playerStart: string;
    enemies: {
        id: string;
        archetype: string;
        node: string;
    }[];
    objective: string;
    turnLimit?: number;
    targetEnemyId?: string;
    variants: {
        id: string;
        label: string;
        enemies: Encounter["enemies"];
    }[];
}
export interface Unit {
    id: string;
    node: string;
    hp: number;
    maxHp: number;
    block: number;
    poison: number;
    weak: number;
    exposed: number;
    disarm: number;
    bind: number;
    bleed: number;
    buff: number;
    archetype?: string;
    intent?: Intent;
    mark?: string;
    marks?: (string | null)[];
    phase2?: boolean;
    poisonFresh?: number;
    lastHitTarget?: string;
}
export interface Action {
    card: string;
    side: Side;
    basic: boolean;
}
export type Task = {
    kind: "step";
    step: Step;
    card?: string;
    side?: Side;
    stepIndex?: number;
    stepCount?: number;
} | {
    kind: "finish";
    action: Action;
    loss: boolean;
} | {
    kind: "playerEnd";
} | {
    kind: "forceApply";
    source: string;
    target: string;
    max: number;
    mode: "push" | "pull";
} | {
    kind: "enemy";
    id: string;
} | {
    kind: "enemyStep";
    id: string;
    step: IntentStep;
    index: number;
} | {
    kind: "hit";
    source: string;
    target: string;
    damage: number;
    pierce?: boolean;
    status?: {
        status: Status;
        stacks: number;
    };
    cardId?: string;
    basic?: boolean;
    stepIndex?: number;
} | {
    kind: "tick";
    id: string;
} | {
    kind: "end";
};
export type Prompt = {
    kind: "effect";
    stepIndex?: number;
    stepCount?: number;
    step: Step;
    targets: string[];
    paths: string[][];
    card?: string;
    side?: Side;
    forced?: {
        direction: string;
        reason: string;
        path: string[];
        max: number;
        target: string;
        source: string;
    };
} | {
    kind: "damage";
    damage: number;
    source: string;
    status?: {
        status: Status;
        stacks: number;
    };
    base?: number;
    exposedHpDamage?: number;
} | {
    kind: "rest";
    cards: string[];
} | {
    kind: "forceReaction";
    source: string;
    max: number;
    mode: "push" | "pull";
};
export interface Battle {
    economy?: {
        items: string[];
        used: string[];
        moveBonus: number;
        startPending: ("tile" | "enemy")[];
        r05: boolean;
        r08: boolean;
        pauseFaces: boolean;
    };
    version: 3;
    contentVersion: "0.3.1-proposal-1" | "0.3.2-economy-trial-1";
    ruleset?: import("./rulesets").Ruleset;
    boardId?: string;
    partyMode?: PartyMode;
    medkits?: number;
    scenario: string;
    variant: string;
    seed: string;
    rng: number;
    rngCount: number;
    turn: number;
    phase: "ready" | "resolving" | "victory" | "defeat";
    reason?: string;
    player: Unit;
    enemies: Unit[];
    zones: {
        hand: string[];
        inPlay: string[];
        discard: string[];
        lost: string[];
    };
    deck: string[];
    relics: string[];
    upgrades: Record<string, Side[]>;
    queue: Task[];
    prompt?: Prompt;
    rested: boolean;
    retain: boolean;
    gainedBlock: boolean;
    counter: number;
    counterUsed: boolean;
    hpLostEnemy: boolean;
    delayedHeal: number;
    lastTarget?: string;
    topDone: boolean;
    relicMoved: boolean;
    firstLoss: boolean;
    log: {
        turn: number;
        event: string;
        detail: string;
        rng: number;
        rngCount: number;
        seed: string;
        actorId?: string;
        targetId?: string;
        cardId?: string;
        base?: number;
        actualHpDamage?: number;
        [key: string]: unknown;
    }[];
    commands: Command[];
    stats: Record<string, number>;
    startHp: number;
    elapsedSeconds?: number;
}
export type Command = { type: "medkit" } | {
    type: "item";
    id: string;
    target?: string;
    status?: Status;
} | {
    type: "forceReaction";
    use: boolean;
} | {
    type: "startChoice";
    node?: string;
    target?: string;
} | {
    type: "continueFace";
} | {
    type: "play";
    actions: Action[];
} | {
    type: "choose";
    target?: string;
    path?: string[];
    skip?: boolean;
} | {
    type: "rest";
    card?: string;
} | {
    type: "damage";
    cards?: string[];
    zone?: "hand" | "discard";
} | {
    type: "relicMove";
} | {
    type: "endPlayer";
} | {
    type: "recordMetrics";
    elapsedSeconds: number;
    inputCount: number;
};
