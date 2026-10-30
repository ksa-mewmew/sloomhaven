export const PHASE1 = "phase1-foundation-v1";
export const LEGACY_RULES = "legacy-v033";
export type Ruleset = typeof PHASE1 | typeof LEGACY_RULES;
export const rulesDefaults: { ruleset: Ruleset } = { ruleset: PHASE1 };
