export type SignedUrlOptions = {
  /** 다운로드 파일명 (Content-Disposition: attachment) */
  downloadName?: string;
  /** 유효 시간(초). 기본 2시간 (1시간 단위로 서명 시각을 고정해 브라우저 캐시가 유지됨) */
  expiresIn?: number;
};

export interface StorageDriver {
  kind: "s3" | "supabase" | "local";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  signedGetUrl(key: string, opts?: SignedUrlOptions): Promise<string>;
  signedPutUrl(key: string, contentType: string, expiresIn?: number): Promise<{ url: string; headers: Record<string, string> }>;
}
