import type { VoiceProfile } from "../db/campaignRepository";

export type VoiceSegment = {
  speaker: "narrator" | "npc";
  text: string;
  npcId?: string;
  name?: string;
  profile?: VoiceProfile;
  speak?: boolean;
};

export type NarratedResponse = {
  content: string;
  voiceSegments: VoiceSegment[];
};

function stripThinking(content: string) {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, "")
    .replace(/<\/?think>/gi, "")
    .trim();
}

function readAttribute(attributes: string, name: string) {
  return attributes.match(new RegExp(`\\b${name}="([^"]+)"`, "i"))?.[1]?.trim();
}

export function normalizeNpcId(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function parseVoiceSegments(rawContent: string): NarratedResponse {
  const content = stripThinking(rawContent);
  const tagPattern = /<voice\s+([^>]+)>([\s\S]*?)<\/voice>/gi;
  const segments: VoiceSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(content))) {
    const before = content.slice(cursor, match.index).trim();
    if (before) segments.push({ speaker: "narrator", text: before });

    const attributes = match[1];
    const text = match[2].trim();
    const speaker = readAttribute(attributes, "speaker");
    if (text && speaker === "npc") {
      const name = readAttribute(attributes, "name");
      const npcId = normalizeNpcId(readAttribute(attributes, "id") ?? name ?? "");
      if (name && npcId) segments.push({ speaker: "npc", npcId, name, text });
      else segments.push({ speaker: "narrator", text });
    } else if (text) {
      segments.push({ speaker: "narrator", text });
    }
    cursor = tagPattern.lastIndex;
  }

  const after = content.slice(cursor).trim();
  if (after) segments.push({ speaker: "narrator", text: after });

  if (segments.length === 0 || /<\/?voice\b/i.test(segments.map((segment) => segment.text).join(" "))) {
    const fallback = content.replace(/<\/?voice\b[^>]*>/gi, "").trim();
    return { content: fallback, voiceSegments: fallback ? [{ speaker: "narrator", text: fallback }] : [] };
  }

  return {
    content: segments
      .map((segment) => segment.speaker === "npc" ? `**${segment.name}:** ${segment.text}` : segment.text)
      .join("\n\n"),
    voiceSegments: segments,
  };
}
