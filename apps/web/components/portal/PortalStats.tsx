import { formatDateTime } from "./portal-utils";
import type { PortalStatsData } from "./types";

type PortalStatsProps = {
  stats: PortalStatsData;
};

export function PortalStats({ stats }: PortalStatsProps) {
  const cards = [
    { label: "公開中ツール数", value: `${stats.activeTools}件` },
    { label: "最新バージョン数", value: `${stats.latestVersions}件` },
    { label: "配布ファイル数", value: `${stats.assets}件` },
    { label: "最終更新日時", value: formatDateTime(stats.lastUpdatedAt) },
  ];

  return (
    <section className="portal-stats">
      {cards.map((card) => (
        <article key={card.label} className="stat-card">
          <p>{card.label}</p>
          <strong>{card.value}</strong>
        </article>
      ))}
    </section>
  );
}
