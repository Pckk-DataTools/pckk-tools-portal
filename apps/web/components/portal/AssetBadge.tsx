import { getAssetKindLabel } from "./portal-utils";
import type { DisplayAssetKind } from "./types";

type AssetBadgeProps = {
  kind: DisplayAssetKind;
};

export function AssetBadge({ kind }: AssetBadgeProps) {
  const getIcon = (k: DisplayAssetKind) => {
    switch (k) {
      case "app":
        return "💻";
      case "document":
        return "📄";
      case "python":
        return "🐍";
      case "support":
        return "⚙️";
      default:
        return "📦";
    }
  };

  return (
    <span className={`asset-badge kind-${kind}`}>
      <span style={{ marginRight: "4px" }} aria-hidden>{getIcon(kind)}</span>
      {getAssetKindLabel(kind)}
    </span>
  );
}

