// 卡片编辑器里「配图顺序」这类频繁变动、又要在多个子组件间共享的状态放 zustand。
// 表单文本仍交给 tanstack-form，避免两套状态互相覆盖。

import { create } from "zustand";

import type { CardImage } from "@/lib/api/card";

interface EditorState {
  images: CardImage[];
  activeIndex: number;
  setImages: (images: CardImage[]) => void;
  reset: (images?: CardImage[]) => void;
  move: (from: number, to: number) => void;
  removeAt: (index: number) => void;
  append: (items: EditorImageInput[]) => void;
  setCover: (index: number) => void;
  setActive: (index: number) => void;
}

/** 新加配图时能拿到的字段：path 一定有，local_path 只有导入/已保存时才有 */
export interface EditorImageInput {
  path: string;
  local_path?: string;
}

const toImage = (item: EditorImageInput, position: number): CardImage => ({
  path: item.path,
  url: item.path,
  local_path: item.local_path ?? "",
  position,
  id: null,
});

const reindex = (images: CardImage[]) => images.map((img, i) => ({ ...img, position: i }));

export const useEditorStore = create<EditorState>((set, get) => ({
  images: [],
  activeIndex: 0,

  setImages: (images) => set({ images: reindex(images), activeIndex: 0 }),

  reset: (images = []) => set({ images: reindex(images), activeIndex: 0 }),

  move: (from, to) => {
    const images = [...get().images];
    if (to < 0 || to >= images.length || from === to) return;
    const [item] = images.splice(from, 1);
    images.splice(to, 0, item);
    set({ images: reindex(images), activeIndex: to });
  },

  removeAt: (index) => {
    const images = get().images.filter((_, i) => i !== index);
    set({
      images: reindex(images),
      activeIndex: Math.max(0, Math.min(get().activeIndex, images.length - 1)),
    });
  },

  append: (items) => {
    const existing = new Set(get().images.map((i) => i.path));
    const merged = [...get().images];
    for (const item of items) {
      const clean = item.path.trim();
      if (clean && !existing.has(clean)) {
        existing.add(clean);
        merged.push(toImage({ ...item, path: clean }, merged.length));
      }
    }
    set({ images: reindex(merged) });
  },

  setCover: (index) => {
    const images = [...get().images];
    const [item] = images.splice(index, 1);
    images.unshift(item);
    set({ images: reindex(images), activeIndex: 0 });
  },

  setActive: (index) => set({ activeIndex: index }),
}));
