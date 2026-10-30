import { createFileRoute } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_app/video")({
  head: () => ({ meta: [{ title: "视频 · 妙作 Muso" }] }),
  component: () => (
    <ComingSoon
      icon={Clapperboard}
      title="视频模块正在打磨"
      description="把同一套词库、句库和提示词模板，延伸成脚本、分镜和成片。目前先把图文的链路做扎实。"
      points={[
        "脚本：按主题和单词生成 30s / 60s 口播稿",
        "分镜：每个镜头配画面描述，直接对接生视频模型",
        "成片：竖屏 9:16 模板，字幕与 BGM 自动对齐",
      ]}
    />
  ),
});
