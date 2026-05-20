import { bytes, formatDateTime } from "./portal-utils";
import type { DisplayTool } from "./types";

type ManagementInfoDisclosureProps = {
  tool: DisplayTool;
};

export function ManagementInfoDisclosure({ tool }: ManagementInfoDisclosureProps) {
  const latestVersion = tool.latestVersion;
  const recommendedAsset = tool.recommendedAsset;
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
          <dt>asset_id</dt>
          <dd>{recommendedAsset?.id ?? "-"}</dd>
        </div>
        <div>
          <dt>raw asset name</dt>
          <dd>{recommendedAsset?.name ?? "-"}</dd>
        </div>
        <div>
          <dt>GitHub release id</dt>
          <dd>{latestVersion?.githubReleaseId ?? "-"}</dd>
        </div>
        <div>
          <dt>GitHub asset id</dt>
          <dd>{recommendedAsset?.githubAssetId ?? "-"}</dd>
        </div>
        <div>
          <dt>asset size</dt>
          <dd>{recommendedAsset ? bytes(recommendedAsset.sizeBytes) : "-"}</dd>
        </div>
        <div>
          <dt>published_at</dt>
          <dd>{formatDateTime(latestVersion?.publishedAt ?? latestVersion?.createdAt ?? null)}</dd>
        </div>
      </dl>
    </div>
  );
}
