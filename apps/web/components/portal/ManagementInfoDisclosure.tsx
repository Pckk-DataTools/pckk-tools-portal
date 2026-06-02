import { bytes, formatDateTime } from "./portal-utils";
import type { DisplayTool } from "./types";

type ManagementInfoDisclosureProps = {
  tool: DisplayTool;
};

export function ManagementInfoDisclosure({ tool }: ManagementInfoDisclosureProps) {
  const latestVersion = tool.latestVersion;
  const latestAssets = latestVersion?.assets ?? [];
  return (
    <div className="management-panel">
      <dl className="management-grid">
        <div>
          <dt>tool_id</dt>
          <dd>{tool.id}</dd>
        </div>
        <div>
          <dt>version_id</dt>
          <dd>{latestVersion?.id ?? "-"}</dd>
        </div>
        <div>
          <dt>GitHub release id</dt>
          <dd>{latestVersion?.githubReleaseId ?? "-"}</dd>
        </div>
        <div>
          <dt>published_at</dt>
          <dd>{formatDateTime(latestVersion?.publishedAt ?? latestVersion?.createdAt ?? null)}</dd>
        </div>
      </dl>

      {latestAssets.length > 0 && (
        <div className="management-assets-list" style={{ marginTop: "12px", borderTop: "1px dashed #e2e8f0", paddingTop: "12px" }}>
          <p style={{ fontSize: "0.75rem", fontWeight: "bold", color: "#64748b", marginBottom: "8px" }}>アセット別管理情報</p>
          {latestAssets.map((asset, index) => (
            <dl key={asset.id} className="management-grid" style={{ marginTop: index > 0 ? "12px" : 0, borderTop: index > 0 ? "1px solid #f1f5f9" : "none", paddingTop: index > 0 ? "8px" : 0 }}>
              <div>
                <dt>raw asset name</dt>
                <dd style={{ wordBreak: "break-all" }}>{asset.name}</dd>
              </div>
              <div>
                <dt>asset_id</dt>
                <dd>{asset.id}</dd>
              </div>
              <div>
                <dt>GitHub asset id</dt>
                <dd>{asset.githubAssetId}</dd>
              </div>
              <div>
                <dt>asset size</dt>
                <dd>{bytes(asset.sizeBytes)}</dd>
              </div>
            </dl>
          ))}
        </div>
      )}
    </div>
  );
}
