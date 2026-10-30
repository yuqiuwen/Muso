import { request } from "@/lib/api";

export interface GeneratePayload {
  template_id?: string | null;
  fields?: Record<string, unknown>;
  card_id?: number | null;
  dry_run?: boolean;
}

export interface GenerationTask {
  id: number;
  uid: string;
  card_id?: number | null;
  template_id?: string | null;
  kind: string;
  status: "pending" | "running" | "success" | "failed";
  engine: string;
  prompt: string;
  result: {
    title?: string;
    story?: string;
    caption?: string;
    tags?: string[];
    prompt?: string;
  };
  error: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export const generationApi = {
  run: (payload: GeneratePayload) => request.post<GenerationTask>("/v1/generation/run", payload),
  get: (uid: string) => request.get<GenerationTask>(`/v1/generation/${uid}`),
};

export interface SystemMeta {
  max_card_images: number;
  max_template_chars: number;
  static_url: string;
  tables: string[];
}

export const sysApi = {
  health: () => request.get<Record<string, unknown>>("/v1/sys/health"),
  meta: () => request.get<SystemMeta>("/v1/sys/meta"),
};
