export function createWavBuffer(input: {
  pcm: Buffer;
  sampleRate: number;
  sampleWidth: number;
  channels: number;
}) {
  const header = Buffer.alloc(44);
  const byteRate = input.sampleRate * input.channels * input.sampleWidth;
  const blockAlign = input.channels * input.sampleWidth;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + input.pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(input.channels, 22);
  header.writeUInt32LE(input.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(input.sampleWidth * 8, 34);
  header.write("data", 36);
  header.writeUInt32LE(input.pcm.length, 40);

  return Buffer.concat([header, input.pcm]);
}
