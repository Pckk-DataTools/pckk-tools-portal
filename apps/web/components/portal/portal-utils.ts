import type { Asset, DisplayAsset, DisplayAssetKind, DisplayTool, DisplayVersion, Tool, Version } from "./types";

const CATEGORY_HINTS: Array<{ label: string; patterns: string[] }> = [
  { label: "iRIC / 河川解析", patterns: ["iric", "river", "flood", "hydro", "河川", "流量", "水理"] },
  { label: "GIS / 空間情報", patterns: ["gis", "geo", "shape", "map", "spatial", "地図", "空間"] },
  { label: "データ処理", patterns: ["data", "etl", "convert", "parser", "集計", "変換"] },
  { label: "レポート作成", patterns: ["report", "帳票", "資料", "報告"] },
  { label: "インストーラー / 補助ツール", patterns: ["installer", "setup", "helper", "tool", "補助"] },
];

export function bytes(v: number | null): string {
  if (!v || v <= 0) return "-";
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
  return `${(v / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getAssetKind(fileName: string): DisplayAssetKind {
  const name = fileName.toLowerCase();
  if (
    name.endsWith(".exe") ||
    name.endsWith(".msi") ||
    name.includes("installer") ||
    name.endsWith(".zip")
  ) {
    return "app";
  }
  if (
    name.endsWith(".pdf") ||
    name.endsWith(".html") ||
    name.includes("manual") ||
    name.includes("docs")
  ) {
    return "document";
  }
  if (name.endsWith(".whl") || name.endsWith(".tar.gz")) {
    return "python";
  }
  if (
    name.endsWith(".csv") ||
    name.endsWith(".json") ||
    name.endsWith(".xml") ||
    name.endsWith(".txt")
  ) {
    return "support";
  }
  return "other";
}

function getCategory(tool: Tool): string {
  const text = `${tool.display_name} ${tool.slug} ${tool.description ?? ""}`.toLowerCase();
  for (const hint of CATEGORY_HINTS) {
    if (hint.patterns.some((pattern) => text.includes(pattern))) {
      return hint.label;
    }
  }
  return "インストーラー / 補助ツール";
}

function getTargetWork(tool: Tool): string {
  const text = `${tool.display_name} ${tool.slug} ${tool.description ?? ""}`.toLowerCase();
  if (text.includes("iric") || text.includes("river") || text.includes("河川")) return "河川解析・モデル入力支援";
  if (text.includes("gis") || text.includes("geo") || text.includes("map")) return "空間情報整備・地図作成";
  if (text.includes("report") || text.includes("帳票")) return "報告資料作成・レビュー";
  return "業務効率化・品質向上";
}

function toDisplayAsset(asset: Asset): DisplayAsset {
  return {
    id: asset.id,
    versionId: asset.tool_version_id,
    githubAssetId: asset.github_asset_id,
    name: asset.asset_name,
    sizeBytes: asset.size_bytes,
    contentType: asset.content_type,
    kind: getAssetKind(asset.asset_name),
    createdAt: asset.created_at,
  };
}

export function getRecommendedAsset(assets: DisplayAsset[]): DisplayAsset | null {
  const priority: DisplayAssetKind[] = ["app", "document", "python", "support", "other"];
  return (
    [...assets].sort((a, b) => {
      const aRank = priority.indexOf(a.kind);
      const bRank = priority.indexOf(b.kind);
      if (aRank !== bRank) return aRank - bRank;
      return a.name.localeCompare(b.name, "ja");
    })[0] ?? null
  );
}

function sortVersionsDesc(left: Version, right: Version): number {
  const leftDate = new Date(left.published_at ?? left.created_at).getTime();
  const rightDate = new Date(right.published_at ?? right.created_at).getTime();
  if (leftDate !== rightDate) return rightDate - leftDate;
  return right.version_tag.localeCompare(left.version_tag, "ja");
}

export function buildDisplayTools(tools: Tool[], versions: Version[], assets: Asset[]): DisplayTool[] {
  const versionsByTool = new Map<string, Version[]>();
  for (const version of versions) {
    const list = versionsByTool.get(version.tool_id) ?? [];
    list.push(version);
    versionsByTool.set(version.tool_id, list);
  }
  const assetsByVersion = new Map<string, DisplayAsset[]>();
  for (const asset of assets) {
    const list = assetsByVersion.get(asset.tool_version_id) ?? [];
    list.push(toDisplayAsset(asset));
    assetsByVersion.set(asset.tool_version_id, list);
  }

  return tools.map((tool) => {
    const sortedVersions = [...(versionsByTool.get(tool.id) ?? [])].sort(sortVersionsDesc);
    const displayVersions: DisplayVersion[] = sortedVersions.map((version) => ({
      id: version.id,
      toolId: version.tool_id,
      tag: version.version_tag,
      releaseName: version.release_name,
      githubReleaseId: version.github_release_id,
      publishedAt: version.published_at,
      createdAt: version.created_at,
      assets: [...(assetsByVersion.get(version.id) ?? [])].sort((a, b) => a.name.localeCompare(b.name, "ja")),
    }));
    const latestVersion = displayVersions[0] ?? null;
    const oldVersions = displayVersions.slice(1);
    const latestAssets = latestVersion?.assets ?? [];
    const recommendedAsset = getRecommendedAsset(latestAssets);
    const documentAsset = latestAssets.find((asset) => asset.kind === "document") ?? null;
    const otherAssets = latestAssets.filter((asset) => asset.id !== recommendedAsset?.id);

    return {
      id: tool.id,
      name: tool.display_name,
      slug: tool.slug,
      description: tool.description ?? "概要は未登録です。",
      category: getCategory(tool),
      targetWork: getTargetWork(tool),
      latestVersion,
      oldVersions,
      recommendedAsset,
      documentAsset,
      otherAssets,
    };
  });
}

export function getAssetKindLabel(kind: DisplayAssetKind): string {
  if (kind === "app") return "アプリ本体";
  if (kind === "document") return "ドキュメント";
  if (kind === "python") return "Python package";
  if (kind === "support") return "補助ファイル";
  return "その他";
}
