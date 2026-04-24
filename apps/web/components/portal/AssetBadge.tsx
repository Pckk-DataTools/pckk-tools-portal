import { getAssetKindLabel } from "./portal-utils";
import type { DisplayAssetKind } from "./types";

type AssetBadgeProps = {
  kind: DisplayAssetKind;
};

export function AssetBadge({ kind }: AssetBadgeProps) {
  return <span className={`asset-badge kind-${kind}`}>{getAssetKindLabel(kind)}</span>;
}
