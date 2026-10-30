import { request } from "@/lib/api";
import type { CardModule } from "@/lib/constant";
import type { CardItem } from "@/lib/api/card";

export interface DashboardStat {
  label: string;
  value: number;
  hint: string;
}

export interface ModuleStat {
  module: CardModule;
  label: string;
  total: number;
  draft: number;
  published: number;
  enabled: boolean;
}

export interface DashboardOverview {
  stats: DashboardStat[];
  modules: ModuleStat[];
  status_counts: Record<string, number>;
  recent_cards: CardItem[];
}

export const dashboardApi = {
  overview: () => request.get<DashboardOverview>("/v1/dashboard/overview"),
};
