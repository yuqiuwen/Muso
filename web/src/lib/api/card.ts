import { request, type PageResult } from "@/lib/api";
import type { CardModule, CardStatus } from "@/lib/constant";

export interface CardImage {
  id?: number | null;
  path: string;
  url: string;
  /** 磁盘绝对路径，由后端按存储位置算出来，用来在 Finder 里定位文件 */
  local_path?: string;
  position: number;
  caption?: string;
}

export interface CardItem {
  id: number;
  module: CardModule;
  status: CardStatus;
  card_type: string;
  theme: string;
  title: string;
  caption: string;
  cover: string;
  image_count: number;
  words: string[];
  is_pinned: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  published_at?: string | null;
}

export interface CardDetail extends CardItem {
  story: string;
  images: CardImage[];
  card_data: Record<string, unknown>;
}

export interface CardQuery {
  keyword?: string;
  status?: string;
  module?: CardModule;
  theme?: string;
  page?: number;
  limit?: number;
}

export interface CardSavePayload {
  title: string;
  module?: CardModule;
  status?: CardStatus;
  card_type?: string;
  theme?: string;
  story?: string;
  caption?: string;
  words?: string[] | string;
  /** 不传表示不改动配图；传空数组才是清空 */
  images?: string[];
  card_data?: Record<string, unknown>;
}

export interface CardImportResult {
  created: number[];
  errors: string[];
}

export const cardApi = {
  list: (query: CardQuery = {}) =>
    request.get<PageResult<CardItem>>("/v1/card", { params: query as Record<string, unknown> }),
  get: (id: number) => request.get<CardDetail>(`/v1/card/${id}`),
  create: (payload: CardSavePayload) => request.post<CardDetail>("/v1/card", payload),
  update: (id: number, payload: CardSavePayload) =>
    request.put<CardDetail>(`/v1/card/${id}`, payload),
  remove: (id: number) => request.delete<boolean>(`/v1/card/${id}`),
  setStatus: (id: number, status: CardStatus) =>
    request.put<CardItem>(`/v1/card/${id}/status`, { status }),
  togglePin: (id: number) => request.put<CardItem>(`/v1/card/${id}/pin`),
  themes: (module: CardModule = "image") =>
    request.get<string[]>("/v1/card/themes", { params: { module } }),
  appendImages: (id: number, paths: string[]) =>
    request.post<CardDetail>(`/v1/card/${id}/images`, { paths }),
  uploadImages: (id: number, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return request.postForm<CardDetail>(`/v1/card/${id}/images/upload`, form);
  },
  reorderImages: (id: number, paths: string[]) =>
    request.put<CardDetail>(`/v1/card/${id}/images/order`, { paths }),
  removeImage: (id: number, imageId: number) =>
    request.delete<CardDetail>(`/v1/card/${id}/images/${imageId}`),
  importJson: (text: string) => request.post<CardImportResult>("/v1/card/import", { text }),
};
