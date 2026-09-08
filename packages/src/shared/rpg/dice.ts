/**
 * Deterministic random number generator based on seed
 * Uses xorshift32 algorithm for simplicity and speed
 */
class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    // xorshift32 requires non-zero state
    this.state = seed || Date.now();
    if (this.state === 0) this.state = 1;
  }

  nextInt(): number {
    // xorshift32 algorithm
    this.state ^= this.state << 13;
    this.state ^= this.state >>> 17;
    this.state ^= this.state << 5;
    return this.state >>> 0; // Ensure unsigned 32-bit
  }

  /**
   * Returns random integer in [min, max] inclusive
   */
  intInRange(min: number, max: number): number {
    if (min > max) [min, max] = [max, min];
    const range = max - min + 1;
    // Use modulo with bias correction for better distribution
    const limit = 0xffffffff - (0xffffffff % range);
    let rand;
    do {
      rand = this.nextInt();
    } while (rand > limit);
    return min + (rand % range);
  }
}

/**
 * Dice roll result type
 */
export type DiceRollResult = {
  expression: string;
  normalized: string;
  total: number;
  rolls: number[];
  kept: number[];
  dropped: number[];
  modifier: number;
  detail: string;
};

/**
 * Regular expression for parsing dice expressions
 * Supports: XdY, XdY+Z, XdY-Z, XdYkhZ (keep highest), XdYklZ (keep lowest)
 */
const diceExpressionRegex = /^\\s*(\\d*)d(\\d+)(?:(kh|kl)(\\d+))?\\s*([+-]\\s*\\d+)?\\s*$/i;

/**
 * Parses modifier from string (handles whitespace)
 */
function parseModifier(value: string | undefined): number {
  if (!value) return 0;
  return Number(value.replace(/\\s/g, ""));
}

/**
 * Selects which rolls to keep based on keep mode and count
 */
function selectKeptRolls(
  rolls: number[],
  keepMode: string | undefined,
  keepCount: number | undefined
): number[] {
  if (!keepMode || !keepCount) return rolls;

  const sorted = [...rolls].sort((a, b) =>
    keepMode.toLowerCase() === "kh" ? b - a : a - b
  );
  return sorted.slice(0, keepCount);
}

/**
 * Rolls dice expression deterministically if seed is provided
 * 
 * @param expression - Dice expression (e.g., "1d20", "2d6+3", "4d6kh3")
 * @param seed - Optional seed for deterministic results (for testing)
 * @returns Dice roll result
 */
export function rollDiceExpression(
  expression: string,
  seed?: number
): DiceRollResult {
  // Use deterministic random if seed provided, otherwise fallback to Math.random
  const rng = seed !== undefined ? new DeterministicRandom(seed) : null;

  const getRandomInt = (min: number, max: number): number => {
    if (rng) return rng.intInRange(min, max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  const match = diceExpressionRegex.exec(expression);
  if (!match) {
    throw new Error(
      'Invalid expression. Use formats like "1d20", "1d20+3", "2d6" or "4d6kh3".'
    );
  }

  const count = match[1] ? Number(match[1]) : 1;
  const sides = Number(match[2]);
  const keepMode = match[3];
  const keepCount = match[4] ? Number(match[4]) : undefined;
  const modifier = parseModifier(match[5]);

  // Validation
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error("Dice count must be between 1 and 100.");
  }

  if (!Number.isInteger(sides) || sides < 2 || sides > 1000) {
    throw new Error("Dice sides must be between 2 and 1000.");
  }

  if (
    keepCount !== undefined &&
    (!Number.isInteger(keepCount) || keepCount < 1 || keepCount > count)
  ) {
    throw new Error(
      "Number of dice to keep must be between 1 and the number rolled."
    );
  }

  // Generate rolls
  const rolls = Array.from({ length: count }, () =>
    getRandomInt(1, sides)
  );
  const kept = selectKeptRolls(rolls, keepMode, keepCount);
  const total =
    kept.reduce((sum, roll) => sum + roll, 0) + modifier;
  const dropped = [...rolls]; // Copy to manipulate

  // Remove kept rolls from dropped (to show what was discarded)
  for (const roll of kept) {
    const index = dropped.indexOf(roll);
    if (index >= 0) dropped.splice(index, 1);
  }

  // Build normalized expression
  const normalized = `${count}d${sides}${keepMode && keepCount ? `${keepMode.toLowerCase()}${keepCount}` : ""}${modifier ? modifier > 0 ? `+${modifier}` : `${modifier}` : ""}`;
  const keptText =
    kept.length === rolls.length
      ? rolls.join(", ")
      : `${kept.join(", ")} kept; ${dropped.join(", ")} dropped`;
  const detail = `${normalized}: [${keptText}]${modifier ? ` ${modifier > 0 ? "+" : ""}${modifier}` : ""} = ${total}`;

  return {
    expression,
    normalized,
    total,
    rolls,
    kept,
    dropped,
    modifier,
    detail,
  };
}