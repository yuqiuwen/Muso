import { request, type PageResult } from "@/lib/api";

export interface SentenceItem {
  id: number;
  en: string;
  zh: string;
  word_count: number;
  source: string;
}

export interface SentenceDetail extends SentenceItem {
  created_at?: string | null;
}

export interface SentenceSource {
  name: string;
  filename: string;
  entry_count: number;
  imported_at?: string | null;
}

export interface SentenceQuery {
  keyword?: string;
  source?: string;
  min_words?: number;
  max_words?: number;
  page?: number;
  limit?: number;
}

export const sentenceApi = {
  list: (query: SentenceQuery = {}) =>
    request.get<PageResult<SentenceItem>>("/v1/sentence", {
      params: query as Record<string, unknown>,
    }),
  get: (id: number) => request.get<SentenceDetail>(`/v1/sentence/${id}`),
  sources: () => request.get<SentenceSource[]>("/v1/sentence/sources"),
  forWord: (word: string, limit = 5) =>
    request.get<SentenceItem[]>("/v1/sentence/for-word", { params: { word, limit } }),
};
