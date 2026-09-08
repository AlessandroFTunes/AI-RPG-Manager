export const MUSIC_CONTRACT_VERSION = 1 as const;

export const MUSIC_REQUEST_SOURCES = ["auto", "manual"] as const;
export type MusicRequestSource = typeof MUSIC_REQUEST_SOURCES[number];

export const MUSIC_REQUEST_STATUSES = ["pending", "processing", "completed", "failed", "cancelled"] as const;
export type MusicRequestStatus = typeof MUSIC_REQUEST_STATUSES[number];

export const MUSIC_ENERGIES = ["low", "medium", "high"] as const;
export type MusicEnergy = typeof MUSIC_ENERGIES[number];

export interface MusicRequestCampaignContext {
  title: string;
  system: string;
  tone: string;
  premise: string;
  summary: string;
  currentScene: string;
  characters: string[];
  themeHint?: string;
}

export interface MusicRequestDetailsContext {
  indication?: string;
  mood?: string;
  energy?: MusicEnergy;
  sceneType?: string;
  reason: string;
  replaceCurrent: boolean;
}

export interface MusicRequestRecentMessage {
  role: "user" | "assistant" | "system" | "tool";
  authorName: string | null;
  content: string;
}

export interface MusicRequestContext {
  version: typeof MUSIC_CONTRACT_VERSION;
  campaign: MusicRequestCampaignContext;
  request: MusicRequestDetailsContext;
  recentMessages: MusicRequestRecentMessage[];
}

export interface MusicResultPlan {
  mood: string;
  energy: MusicEnergy;
  tension: MusicEnergy;
  sceneType: string;
  youtubeQuery: string;
  avoidTerms: string[];
}

export interface MusicResultTrack {
  title: string;
  webpageUrl: string;
  streamUrl: string;
  durationSeconds?: number;
}

export interface MusicRequestResult {
  version: typeof MUSIC_CONTRACT_VERSION;
  plan: MusicResultPlan;
  track: MusicResultTrack;
}

function invalid(path: string, expected: string): never {
  throw new TypeError(`Invalid music contract at ${path}: expected ${expected}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(path, "object");
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) invalid(path, "non-empty string");
  return value.trim();
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string") invalid(path, "string");
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : string(value, path);
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(path, "boolean");
  return value;
}

function number(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(path, "finite number");
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) invalid(path, "string array");
  return value.map((item, index) => string(item, `${path}[${index}]`));
}

function enumValue<const T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) invalid(path, values.join(" | "));
  return value as T[number];
}

function version(value: unknown, path: string): typeof MUSIC_CONTRACT_VERSION {
  if (value !== MUSIC_CONTRACT_VERSION) invalid(path, String(MUSIC_CONTRACT_VERSION));
  return MUSIC_CONTRACT_VERSION;
}

export function parseMusicRequestSource(value: unknown): MusicRequestSource {
  return enumValue(value, MUSIC_REQUEST_SOURCES, "source");
}

export function parseMusicRequestStatus(value: unknown): MusicRequestStatus {
  return enumValue(value, MUSIC_REQUEST_STATUSES, "status");
}

export function parseMusicEnergy(value: unknown): MusicEnergy {
  return enumValue(value, MUSIC_ENERGIES, "energy");
}

export function parseMusicRequestContext(value: unknown): MusicRequestContext {
  const root = record(value, "context");
  const campaign = record(root.campaign, "context.campaign");
  const request = record(root.request, "context.request");
  if (!Array.isArray(root.recentMessages)) invalid("context.recentMessages", "array");

  return {
    version: version(root.version, "context.version"),
    campaign: {
      title: string(campaign.title, "context.campaign.title"),
      system: string(campaign.system, "context.campaign.system"),
      tone: text(campaign.tone, "context.campaign.tone"),
      premise: text(campaign.premise, "context.campaign.premise"),
      summary: text(campaign.summary, "context.campaign.summary"),
      currentScene: text(campaign.currentScene, "context.campaign.currentScene"),
      characters: stringArray(campaign.characters, "context.campaign.characters"),
      themeHint: optionalString(campaign.themeHint, "context.campaign.themeHint"),
    },
    request: {
      indication: optionalString(request.indication, "context.request.indication"),
      mood: optionalString(request.mood, "context.request.mood"),
      energy: request.energy === undefined ? undefined : parseMusicEnergy(request.energy),
      sceneType: optionalString(request.sceneType, "context.request.sceneType"),
      reason: string(request.reason, "context.request.reason"),
      replaceCurrent: boolean(request.replaceCurrent, "context.request.replaceCurrent"),
    },
    recentMessages: root.recentMessages.map((item, index) => {
      const message = record(item, `context.recentMessages[${index}]`);
      const authorName = message.authorName;
      if (authorName !== null && typeof authorName !== "string") {
        invalid(`context.recentMessages[${index}].authorName`, "string or null");
      }
      return {
        role: enumValue(message.role, ["user", "assistant", "system", "tool"] as const, `context.recentMessages[${index}].role`),
        authorName,
        content: text(message.content, `context.recentMessages[${index}].content`),
      };
    }),
  };
}

export function parseMusicRequestResult(value: unknown): MusicRequestResult {
  const root = record(value, "result");
  const plan = record(root.plan, "result.plan");
  const track = record(root.track, "result.track");
  return {
    version: version(root.version, "result.version"),
    plan: {
      mood: string(plan.mood, "result.plan.mood"),
      energy: parseMusicEnergy(plan.energy),
      tension: enumValue(plan.tension, MUSIC_ENERGIES, "result.plan.tension"),
      sceneType: string(plan.sceneType, "result.plan.sceneType"),
      youtubeQuery: string(plan.youtubeQuery, "result.plan.youtubeQuery"),
      avoidTerms: stringArray(plan.avoidTerms, "result.plan.avoidTerms"),
    },
    track: {
      title: string(track.title, "result.track.title"),
      webpageUrl: string(track.webpageUrl, "result.track.webpageUrl"),
      streamUrl: string(track.streamUrl, "result.track.streamUrl"),
      durationSeconds: track.durationSeconds === undefined
        ? undefined
        : number(track.durationSeconds, "result.track.durationSeconds"),
    },
  };
}

export function isMusicRequestContext(value: unknown): value is MusicRequestContext {
  try {
    parseMusicRequestContext(value);
    return true;
  } catch {
    return false;
  }
}

export function isMusicRequestResult(value: unknown): value is MusicRequestResult {
  try {
    parseMusicRequestResult(value);
    return true;
  } catch {
    return false;
  }
}
