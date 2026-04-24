import { AssetBadge } from "./AssetBadge";
import { AssetDownloadButton } from "./AssetDownloadButton";
import { bytes, formatDateTime } from "./portal-utils";
import type { DisplayVersion } from "./types";

type VersionAccordionProps = {
  versions: DisplayVersion[];
  downloadingAssetId: string | null;
  onDownload: (assetId: string) => void;
};

export function VersionAccordion({ versions, downloadingAssetId, onDownload }: VersionAccordionProps) {
  if (versions.length === 0) return null;

  return (
    <details className="details-block">
      <summary>旧バージョンを表示</summary>
      <div className="details-body">
        {versions.map((version) => (
          <article key={version.id} className="old-version-card">
            <div className="old-version-head">
              <strong>{version.tag}</strong>
              <span>{formatDateTime(version.publishedAt ?? version.createdAt)}</span>
            </div>
            {version.assets.length === 0 ? <p className="muted">配布ファイルはありません。</p> : null}
            {version.assets.map((asset) => (
              <div key={asset.id} className="asset-row">
                <div className="asset-main">
                  <AssetBadge kind={asset.kind} />
                  <span>{asset.name}</span>
                  <span className="muted">{bytes(asset.sizeBytes)}</span>
                </div>
                <AssetDownloadButton
                  asset={asset}
                  downloadingAssetId={downloadingAssetId}
                  onDownload={onDownload}
                  label="ダウンロード"
                  variant="secondary"
                />
              </div>
            ))}
          </article>
        ))}
      </div>
    </details>
  );
}
