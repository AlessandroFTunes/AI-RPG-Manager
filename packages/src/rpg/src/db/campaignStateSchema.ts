import { z } from "zod";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]));

const characterSchema = z.object({
  id: z.string().min(1),
  playerId: z.string().min(1).optional(),
  playerName: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional(),
}).strict();

const relationshipPartySchema = z.object({
  type: z.enum(["character", "npc", "faction"]),
  id: z.string().min(1),
  name: z.string().min(1),
}).strict();

const relationshipScoresSchema = z.object({
  trust: z.number().int().min(0).max(100),
  friendship: z.number().int().min(0).max(100),
  fear: z.number().int().min(0).max(100),
  respect: z.number().int().min(0).max(100),
  romance: z.number().int().min(0).max(100),
  resentment: z.number().int().min(0).max(100),
  debt: z.number().int().min(0).max(100),
}).strict();

const worldCalendarSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  months: z.array(z.object({
    name: z.string().min(1),
    days: z.number().int().positive(),
  }).strict()).min(1),
  weekdays: z.array(z.string().min(1)).min(1),
  hoursPerDay: z.number().int().positive(),
  minutesPerHour: z.number().int().positive(),
}).strict();

const worldClockSchema = z.object({
  calendar: worldCalendarSchema,
  region: z.string().min(1),
  year: z.number().int().positive(),
  month: z.number().int().positive(),
  day: z.number().int().positive(),
  hour: z.number().int().nonnegative(),
  minute: z.number().int().nonnegative(),
  weekdayIndex: z.number().int().nonnegative(),
  elapsedMinutes: z.number().int().nonnegative(),
}).strict().superRefine((clock, context) => {
  const month = clock.calendar.months[clock.month - 1];
  if (!month) {
    context.addIssue({ code: "custom", path: ["month"], message: "Mês fora do calendário." });
  } else if (clock.day > month.days) {
    context.addIssue({ code: "custom", path: ["day"], message: "Dia fora do mês." });
  }
  if (clock.hour >= clock.calendar.hoursPerDay) {
    context.addIssue({ code: "custom", path: ["hour"], message: "Hora fora do dia." });
  }
  if (clock.minute >= clock.calendar.minutesPerHour) {
    context.addIssue({ code: "custom", path: ["minute"], message: "Minuto fora da hora." });
  }
  if (clock.weekdayIndex >= clock.calendar.weekdays.length) {
    context.addIssue({ code: "custom", path: ["weekdayIndex"], message: "Dia da semana inválido." });
  }
});

export const campaignStateSchema = z.object({
  stateVersion: z.literal(1),
  system: z.string().min(1),
  ruleset: z.enum(["narrative", "dnd5e-2014", "dnd5e-2024"]),
  phase: z.enum(["setup", "playing"]),
  setup: z.object({
    premise: z.string(),
    tone: z.string(),
    boundaries: z.array(z.string()),
  }).strict(),
  voice: z.object({
    enabled: z.boolean(),
    channelId: z.string().min(1).nullable(),
    provider: z.enum(["piper", "elevenlabs", "openai"]),
  }).strict(),
  voiceCast: z.record(z.string(), z.object({
    npcId: z.string().min(1),
    name: z.string().min(1),
    profile: z.enum(["deep", "high", "elder", "young", "dark", "energetic"]),
    appearances: z.number().int().nonnegative(),
    importance: z.enum(["supporting", "main"]),
  }).strict()),
  summary: z.string(),
  currentScene: z.string(),
  characters: z.array(characterSchema),
  npcs: z.array(characterSchema.extend({
    relationship: z.number().optional(),
    notes: z.array(z.string()).optional(),
  }).strict()),
  locations: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    visited: z.boolean().optional(),
  }).strict()),
  quests: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    status: z.enum(["active", "completed", "failed"]),
    description: z.string().optional(),
  }).strict()),
  inventory: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    quantity: z.number().int().nonnegative(),
  }).strict()),
  relationships: z.array(z.object({
    id: z.string().min(1),
    source: relationshipPartySchema,
    target: relationshipPartySchema,
    scores: relationshipScoresSchema,
    updatedAt: z.string().datetime(),
  }).strict()),
  worldClock: worldClockSchema,
  flags: z.record(z.string(), jsonValueSchema),
}).strict();

export type ValidatedCampaignState = z.infer<typeof campaignStateSchema>;

export function parseCampaignState(value: unknown, campaignId = "unknown") {
  const result = campaignStateSchema.safeParse(value);
  if (result.success) return result.data;

  const paths = result.error.issues
    .map((issue) => `${issue.path.join(".") || "state"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid campaign state for ${campaignId}: ${paths}`);
}
