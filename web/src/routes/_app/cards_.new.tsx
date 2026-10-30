import { createFileRoute } from "@tanstack/react-router";

import { CardEditor } from "@/components/card-editor";

export const Route = createFileRoute("/_app/cards_/new")({
  head: () => ({ meta: [{ title: "新建图文卡片 · 妙作 Muso" }] }),
  component: NewCardPage,
});

function NewCardPage() {
  return <CardEditor />;
}
