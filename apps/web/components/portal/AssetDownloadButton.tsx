import type { DisplayAsset } from "./types";

type AssetDownloadButtonProps = {
  asset: DisplayAsset;
  downloadingAssetId: string | null;
  onDownload: (assetId: string) => void;
  label: string;
  variant?: "primary" | "secondary";
};

export function AssetDownloadButton({
  asset,
  downloadingAssetId,
  onDownload,
  label,
  variant = "primary",
}: AssetDownloadButtonProps) {
  const downloading = downloadingAssetId === asset.id;
  const className = variant === "primary" ? "button-primary" : "button-secondary";
  return (
    <button className={className} disabled={downloading} onClick={() => onDownload(asset.id)}>
      {downloading ? "取得中..." : label}
    </button>
  );
}
