export const enemySymbols: Readonly<Record<string, string>> = {
  duelist: "C",
  grunt: "P",
  guard: "L",
  harrier: "S",
  marksman: "U",
  poisoner: "J",
  brute: "W",
  clockmaker: "T",
  hunter: "H",
  arbiter: "E",
  boss: "D",
  dust: "F",
};
export const enemySymbol = (archetype?: string) =>
  enemySymbols[archetype ?? ""] ?? "?";
