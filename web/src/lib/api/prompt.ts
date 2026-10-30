import { request } from "@/lib/api";

export interface TemplateItem {
  id: string;
  name: string;
  description: string;
  content: string;
  /** 1 文本 / 2 生图 / 3 其他 */
  kind: number;
  builtin: boolean;
  slots: string[];
  chars: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TemplateSavePayload {
  name: string;
  description?: string;
  content: string;
  kind?: number;
}

export interface RenderResult {
  text: string;
  missing: string[];
}

export const promptApi = {
  list: () => request.get<TemplateItem[]>("/v1/prompt"),
  get: (id: string) => request.get<TemplateItem>(`/v1/prompt/${id}`),
  create: (payload: TemplateSavePayload) => request.post<TemplateItem>("/v1/prompt", payload),
  update: (id: string, payload: TemplateSavePayload) =>
    request.put<TemplateItem>(`/v1/prompt/${id}`, payload),
  remove: (id: string) => request.delete<boolean>(`/v1/prompt/${id}`),
  duplicate: (id: string) => request.post<TemplateItem>(`/v1/prompt/${id}/duplicate`),
  render: (templateId: string, fields: Record<string, unknown>) =>
    request.post<RenderResult>("/v1/prompt/render", { template_id: templateId, fields }),
};
