const MAX_SPEECH_LENGTH = 4_000;

export function sanitizeSpeechText(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<@!?\d+>|<@&\d+>|<#\d+>/g, " ")
    .replace(/[*_~>|#]/g, "")
    .replace(/\b(\d+)d(\d+)([+-]\d+)?\b/gi, (_, count, sides, modifier = "") => {
      const modifierText = modifier
        ? modifier.startsWith("+") ? ` mais ${modifier.slice(1)}` : ` menos ${modifier.slice(1)}`
        : "";
      return `${count} dado de ${sides}${modifierText}`;
    })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SPEECH_LENGTH);
}

export function compactSpeechQueue(contents: string[]) {
  return sanitizeSpeechText(contents.join(" Em seguida, ")).slice(-MAX_SPEECH_LENGTH);
}
