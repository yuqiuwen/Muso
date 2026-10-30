import { createFileRoute } from "@tanstack/react-router";
import { Music } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_app/music")({
  head: () => ({ meta: [{ title: "音乐 · 妙作 Muso" }] }),
  component: () => (
    <ComingSoon
      icon={Music}
      title="音乐模块还在编曲"
      description="从一句例句、一段配文出发，生成歌词、旋律与音色描述。它会和图文共用同一个素材库。"
      points={[
        "歌词：按场景和单词表生成中英双语歌词",
        "编曲：风格 / 情绪 / BPM 结构化描述",
        "音色：人声与乐器组合，一键复制给生成模型",
      ]}
    />
  ),
});
