import { tool } from "ai";
import { z } from "zod";
import { saveDiceRoll } from "../db/campaignRepository";

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

const diceExpressionRegex = /^\s*(\d*)d(\d+)(?:(kh|kl)(\d+))?\s*([+-]\s*\d+)?\s*$/i;

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseModifier(value: string | undefined) {
  if (!value) return 0;
  return Number(value.replace(/\s/g, ""));
}

function selectKeptRolls(rolls: number[], keepMode: string | undefined, keepCount: number | undefined) {
  if (!keepMode || !keepCount) return rolls;

  const sorted = [...rolls].sort((a, b) => keepMode.toLowerCase() === "kh" ? b - a : a - b);
  return sorted.slice(0, keepCount);
}

export function rollDiceExpression(expression: string): DiceRollResult {
  const match = diceExpressionRegex.exec(expression);
  if (!match) {
    throw new Error('Expressão inválida. Use formatos como "1d20", "1d20+3", "2d6" ou "4d6kh3".');
  }

  const count = match[1] ? Number(match[1]) : 1;
  const sides = Number(match[2]);
  const keepMode = match[3];
  const keepCount = match[4] ? Number(match[4]) : undefined;
  const modifier = parseModifier(match[5]);

  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error("A quantidade de dados deve ficar entre 1 e 100.");
  }

  if (!Number.isInteger(sides) || sides < 2 || sides > 1000) {
    throw new Error("A quantidade de faces deve ficar entre 2 e 1000.");
  }

  if (keepCount !== undefined && (!Number.isInteger(keepCount) || keepCount < 1 || keepCount > count)) {
    throw new Error("A quantidade de dados mantidos deve ficar entre 1 e a quantidade rolada.");
  }

  const rolls = Array.from({ length: count }, () => randomInt(1, sides));
  const kept = selectKeptRolls(rolls, keepMode, keepCount);
  const total = kept.reduce((sum, roll) => sum + roll, 0) + modifier;
  const dropped = [...rolls];

  for (const roll of kept) {
    const index = dropped.indexOf(roll);
    if (index >= 0) dropped.splice(index, 1);
  }

  const normalized = `${count}d${sides}${keepMode && keepCount ? `${keepMode.toLowerCase()}${keepCount}` : ""}${modifier ? modifier > 0 ? `+${modifier}` : `${modifier}` : ""}`;
  const keptText = kept.length === rolls.length ? rolls.join(", ") : `${kept.join(", ")} mantidos; ${dropped.join(", ")} descartados`;
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

export function createRollDiceTool(context: { campaignId: string; authorId?: string }) {
  return tool({
    description:
      'Rola dados de RPG de forma determinística pelo código. Use para testes, ataques, dano, sorte e riscos. Formatos: "1d20", "1d20+3", "2d6", "4d6kh3".',
    inputSchema: z.object({
      expression: z.string().min(1).describe('Expressão de dados, ex: "1d20+3"'),
      reason: z.string().optional().describe("Motivo narrativo da rolagem"),
    }),
    execute: async ({ expression, reason }) => {
      const result = rollDiceExpression(expression);
      await saveDiceRoll({
        campaignId: context.campaignId,
        authorId: context.authorId,
        expression,
        result: { ...result, reason },
      });

      return { ...result, reason };
    },
  });
}
