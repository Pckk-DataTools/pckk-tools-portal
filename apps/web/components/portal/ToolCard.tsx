import { useState } from "react";
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
  const latestAssets = latestVersion?.assets ?? [];

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

      <div className="latest-assets-box">
        <p className="section-caption">最新版ファイル一覧</p>
        {latestAssets.length > 0 ? (
          latestAssets.map((asset) => (
            <div key={asset.id} className="asset-row">
              <div className="asset-main">
                <span>{asset.name}</span>
                <span className="muted">{bytes(asset.sizeBytes)}</span>
              </div>
              <AssetDownloadButton
                asset={asset}
                downloadingAssetId={downloadingAssetId}
                onDownload={onDownload}
                label="ダウンロード"
                variant="download"
              />
            </div>
          ))
        ) : (
          <p className="muted">利用可能なファイルはありません。</p>
        )}
      </div>

      <div className="tool-buttons">
        <button className="button-ghost" onClick={() => setOpenFiles((current) => !current)}>
          {openFiles ? "閉じる" : `旧バージョン ${tool.oldVersions.length}件 / 管理情報`}
        </button>
      </div>

      <details className="details-block" open={openFiles} onToggle={(event) => setOpenFiles(event.currentTarget.open)}>
        <summary>旧バージョン・管理情報</summary>
        <div className="details-body">
          <p className="section-caption">旧バージョン</p>
          {tool.oldVersions.length === 0 ? (
            <p className="muted">旧バージョンはありません。</p>
          ) : (
            <VersionAccordion versions={tool.oldVersions} downloadingAssetId={downloadingAssetId} onDownload={onDownload} />
          )}
          <p className="section-caption">管理情報</p>
          <ManagementInfoDisclosure tool={tool} />
        </div>
      </details>
    </article>
  );
}
