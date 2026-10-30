import { request, type PageResult } from "@/lib/api";

export interface WordItem {
  id: number;
  word: string;
  phonetic_uk: string;
  phonetic_us: string;
  pos: string;
  definition: string;
  source: string;
}

export interface WordDetail extends WordItem {
  examples: { en?: string; zh?: string }[];
  created_at?: string | null;
}

export interface DictSource {
  name: string;
  filename: string;
  entry_count: number;
  imported_at?: string | null;
}

export interface WordQuery {
  keyword?: string;
  source?: string;
  letter?: string;
  page?: number;
  limit?: number;
}

export interface WordLookupItem {
  word: string;
  found: boolean;
  entries: WordItem[];
}

export interface WordMultiResult {
  items: WordLookupItem[];
  total: number;
  found: number;
  missing: string[];
  truncated: boolean;
}

export const wordApi = {
  list: (query: WordQuery = {}) =>
    request.get<PageResult<WordItem>>("/v1/word", { params: query as Record<string, unknown> }),
  get: (id: number) => request.get<WordDetail>(`/v1/word/${id}`),
  sources: () => request.get<DictSource[]>("/v1/word/sources"),
  lookup: (words: string[]) => request.post<WordLookupItem[]>("/v1/word/lookup", { words }),
  /** 多词搜索：原文交给后端拆（逗号 / 分号 / 换行），前端不重复实现分隔逻辑 */
  multi: (payload: { text: string; source?: string }) =>
    request.post<WordMultiResult>("/v1/word/multi", payload),
};
