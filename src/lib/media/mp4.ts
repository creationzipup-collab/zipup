/**
 * 아주 작은 MP4/MOV 파서: moov 박스에서 재생 시간과 영상 트랙 크기만 읽습니다.
 */
export type Mp4Info = { durationSec?: number; width?: number; height?: number };

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "udta"]);

export function parseMp4(buf: Buffer): Mp4Info {
  const info: Mp4Info = {};
  const tracks: { w: number; h: number }[] = [];

  function walk(start: number, end: number) {
    let off = start;
    while (off + 8 <= end) {
      let size = buf.readUInt32BE(off);
      const type = buf.toString("latin1", off + 4, off + 8);
      let header = 8;
      if (size === 1) {
        if (off + 16 > end) return;
        const big = buf.readBigUInt64BE(off + 8);
        size = Number(big);
        header = 16;
      } else if (size === 0) {
        size = end - off;
      }
      if (size < header || off + size > end) return;
      const body = off + header;
      if (type === "mvhd") {
        const version = buf.readUInt8(body);
        if (version === 1) {
          const timescale = buf.readUInt32BE(body + 20);
          const duration = Number(buf.readBigUInt64BE(body + 24));
          if (timescale) info.durationSec = duration / timescale;
        } else {
          const timescale = buf.readUInt32BE(body + 12);
          const duration = buf.readUInt32BE(body + 16);
          if (timescale) info.durationSec = duration / timescale;
        }
      } else if (type === "tkhd") {
        const version = buf.readUInt8(body);
        const whOff = body + (version === 1 ? 88 : 76);
        if (whOff + 8 <= off + size) {
          const w = buf.readUInt32BE(whOff) / 65536;
          const h = buf.readUInt32BE(whOff + 4) / 65536;
          if (w > 0 && h > 0) tracks.push({ w: Math.round(w), h: Math.round(h) });
        }
      } else if (CONTAINERS.has(type)) {
        walk(body, off + size);
      }
      off += size;
    }
  }

  try {
    walk(0, buf.length);
  } catch {
    // 손상된 파일은 무시
  }
  const video = tracks.sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (video) {
    info.width = video.w;
    info.height = video.h;
  }
  return info;
}
