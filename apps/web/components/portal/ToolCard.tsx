import { useState } from "react";
import { AssetBadge } from "./AssetBadge";
import { AssetDownloadButton } from "./AssetDownloadButton";
import { ManagementInfoDisclosure } from "./ManagementInfoDisclosure";
import { VersionAccordion } from "./VersionAccordion";
import { bytes, formatDateTime } from "./portal-utils";
import type { DisplayTool } from "./types";

type ToolCardProps = {
  tool: DisplayTool;
  downloadingAssetId: string | null;
  onDownload: (assetId: string) => void;
};

export function ToolCard({ tool, downloadingAssetId, onDownload }: ToolCardProps) {
  const [openFiles, setOpenFiles] = useState(false);
  const latestVersion = tool.latestVersion;
  const recommendedAsset = tool.recommendedAsset;
  const documentAsset = tool.documentAsset;

  return (
    <article className="tool-card">
      <div className="tool-card-head">
        <div>
          <h3>{tool.name}</h3>
          <p className="slug">{tool.slug}</p>
        </div>
        <span className="latest-badge">最新版</span>
      </div>

      <p className="tool-description">{tool.description}</p>

      <div className="tool-meta-grid">
        <div>
          <span>カテゴリ</span>
          <strong>{tool.category}</strong>
        </div>
        <div>
          <span>対象業務</span>
          <strong>{tool.targetWork}</strong>
        </div>
        <div>
          <span>最新バージョン</span>
          <strong>{latestVersion?.tag ?? "-"}</strong>
        </div>
        <div>
          <span>最終更新日</span>
          <strong>{formatDateTime(latestVersion?.publishedAt ?? latestVersion?.createdAt ?? null)}</strong>
        </div>
      </div>

      <div className="recommended-box">
        <p>推奨アセット</p>
        {recommendedAsset ? (
          <div className="asset-row">
            <div className="asset-main">
              <AssetBadge kind={recommendedAsset.kind} />
              <span>{recommendedAsset.name}</span>
              <span className="muted">{bytes(recommendedAsset.sizeBytes)}</span>
            </div>
            <AssetDownloadButton
              asset={recommendedAsset}
              downloadingAssetId={downloadingAssetId}
              onDownload={onDownload}
              label="最新版をダウンロード"
            />
          </div>
        ) : (
          <p className="muted">利用可能なアセットはありません。</p>
        )}
      </div>

      <div className="tool-buttons">
        {documentAsset ? (
          <AssetDownloadButton
            asset={documentAsset}
            downloadingAssetId={downloadingAssetId}
            onDownload={onDownload}
            label="ドキュメントを見る"
            variant="secondary"
          />
        ) : (
          <button className="button-disabled" disabled>
            ドキュメントなし
          </button>
        )}
        <button className="button-ghost" onClick={() => setOpenFiles(true)}>
          その他ファイル
        </button>
        <button className="button-ghost" onClick={() => setOpenFiles(true)} disabled={tool.oldVersions.length === 0}>
          {tool.oldVersions.length > 0 ? "変更履歴" : "変更履歴なし"}
        </button>
      </div>

      <details className="details-block" open={openFiles} onToggle={(event) => setOpenFiles(event.currentTarget.open)}>
        <summary>その他のファイル・旧バージョンを表示</summary>
        <div className="details-body">
          <p className="section-caption">その他ファイル</p>
          {tool.otherAssets.length === 0 ? (
            <p className="muted">最新版の追加ファイルはありません。</p>
          ) : (
            tool.otherAssets.map((asset) => (
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
            ))
          )}
          <p className="section-caption">旧バージョン</p>
          <VersionAccordion versions={tool.oldVersions} downloadingAssetId={downloadingAssetId} onDownload={onDownload} />
        </div>
      </details>

      <ManagementInfoDisclosure tool={tool} />
    </article>
  );
}
