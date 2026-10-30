// 统一请求层：所有接口都返回 HTTP 200 + envelope { code, msg, data?, errmsg? }
// code !== 0 直接抛 ApiError，交给 TanStack Query 的全局 onError 弹 toast。

import ky, { HTTPError, type KyInstance, type Options as KyOptions } from "ky";

const configuredApiBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";

// 开发环境强制走同源 /v1 代理（见 vite.config.ts），生产才读 VITE_API_BASE_URL
export const API_BASE_URL = import.meta.env.DEV ? "" : configuredApiBaseUrl;

function toRequestUrl(path: string) {
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return API_BASE_URL ? normalized : `/${normalized}`;
}

export interface ApiEnvelope<T = unknown> {
  code: number;
  msg: string;
  data?: T;
  errmsg?: string;
}

export class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

const kyClient: KyInstance = ky.create({
  ...(API_BASE_URL ? { prefixUrl: API_BASE_URL } : {}),
  timeout: 30_000,
});

export interface RequestOptions extends KyOptions {
  params?: Record<string, unknown>;
}

async function unwrap<T>(
  method: "get" | "post" | "put" | "delete" | "patch",
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { params, ...rest } = options;

  // 去掉 undefined / 空串参数，避免把 "keyword=" 塞进 URL
  const searchParams = params
    ? Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""),
      )
    : undefined;

  let envelope: ApiEnvelope<T>;
  try {
    envelope = await kyClient(toRequestUrl(path), {
      ...rest,
      method,
      searchParams: searchParams as Record<string, string>,
      retry: 0,
    }).json<ApiEnvelope<T>>();
  } catch (err) {
    if (err instanceof HTTPError) {
      throw new ApiError(err.response.status, `网络错误 (${err.response.status})`);
    }
    throw new ApiError(-1, (err as Error)?.message || "网络错误");
  }

  if (envelope.code !== 0) {
    throw new ApiError(envelope.code, envelope.errmsg || envelope.msg || "请求失败");
  }
  return envelope.data as T;
}

export const request = {
  get: <T = unknown>(path: string, options?: RequestOptions) => unwrap<T>("get", path, options),
  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    unwrap<T>("post", path, { ...options, json: body }),
  postForm: <T = unknown>(path: string, formData: FormData, options?: RequestOptions) =>
    unwrap<T>("post", path, { ...options, body: formData }),
  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    unwrap<T>("put", path, { ...options, json: body }),
  patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    unwrap<T>("patch", path, { ...options, json: body }),
  delete: <T = unknown>(path: string, options?: RequestOptions) =>
    unwrap<T>("delete", path, options),
};

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
