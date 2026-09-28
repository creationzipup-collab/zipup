export const UPLOAD_TYPES: Record<string, { kind: "image" | "video" | "audio"; max: number }> = {
  "image/png": { kind: "image", max: 40 * 1024 * 1024 },
  "image/jpeg": { kind: "image", max: 40 * 1024 * 1024 },
  "image/webp": { kind: "image", max: 40 * 1024 * 1024 },
  "image/gif": { kind: "image", max: 40 * 1024 * 1024 },
  "video/mp4": { kind: "video", max: 500 * 1024 * 1024 },
  "video/quicktime": { kind: "video", max: 500 * 1024 * 1024 },
  "video/webm": { kind: "video", max: 500 * 1024 * 1024 },
};

export const ACCEPT_UPLOADS = Object.keys(UPLOAD_TYPES).join(",");
