import type { TextBasedChannel } from "discord.js";

const discordLimit = 2_000;
const safeLimit = 1_900;

export function splitLongMessage(content: string) {
  if (content.length <= discordLimit) return [content];

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > safeLimit) {
    const slice = remaining.slice(0, safeLimit);
    const breakIndex = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"), slice.lastIndexOf(". "));
    const cut = breakIndex > 300 ? breakIndex + 1 : safeLimit;

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function sendLongMessage(channel: TextBasedChannel, content: string) {
  if (!("send" in channel)) {
    throw new Error("Canal não permite envio de mensagens.");
  }

  for (const chunk of splitLongMessage(content)) {
    await channel.send(chunk);
  }
}
