import { request } from "@/lib/api";

export interface ImportedImage {
  /** 调用方传进来的原始字符串，方便把结果映射回原顺序 */
  source: string;
  name: string;
  path: string;
  local_path: string;
  size: number;
}

export const mediaApi = {
  /**
   * 把本机绝对路径的图片复制进后端 storage，返回可访问的 /static 路径。
   *
   * 浏览器只能加载站点内的资源，`/Users/you/a.png` 会被当成站点下的相对
   * 地址而 404，所以粘贴本地路径时必须先过这一层。
   *
   * 传 `cardId` 时图片直接落进该卡片的目录（`images/cards/<id>/`），
   * 新建卡片还没 id，先落 pending，保存时由后端搬进卡片目录。
   */
  importLocal: (paths: string[], cardId?: number) =>
    request.post<ImportedImage[]>("/v1/media/import-local", {
      paths,
      card_id: cardId ?? null,
    }),
};
