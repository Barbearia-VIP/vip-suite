const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

/** Extrai frames completos e descarta dados parciais que excedem o limite. */
export function extractJpegFrames(
  previous: Buffer,
  chunk: Buffer,
  maxBytes: number,
): { remaining: Buffer; frames: Buffer[]; dropped: boolean } {
  let buffer = Buffer.concat([previous, chunk]);
  const frames: Buffer[] = [];
  while (buffer.length > 1) {
    const start = buffer.indexOf(JPEG_SOI);
    if (start < 0) {
      buffer = buffer[buffer.length - 1] === 0xff ? buffer.subarray(buffer.length - 1) : Buffer.alloc(0);
      break;
    }
    if (start > 0) buffer = buffer.subarray(start);
    const end = buffer.indexOf(JPEG_EOI, 2);
    if (end < 0) break;
    frames.push(buffer.subarray(0, end + JPEG_EOI.length));
    buffer = buffer.subarray(end + JPEG_EOI.length);
  }
  const dropped = buffer.length > maxBytes;
  if (dropped) buffer = Buffer.alloc(0);
  return { remaining: buffer, frames, dropped };
}
