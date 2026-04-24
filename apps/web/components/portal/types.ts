export type Tool = {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
};

export type Version = {
  id: string;
  tool_id: string;
  version_tag: string;
  release_name: string | null;
  github_release_id: number;
  published_at: string | null;
  created_at: string;
};

export type Asset = {
  id: string;
  tool_version_id: string;
  github_asset_id: number;
  asset_name: string;
  size_bytes: number | null;
  content_type: string | null;
  created_at: string;
};

export type DisplayAssetKind = "app" | "document" | "python" | "support" | "other";

export type DisplayAsset = {
  id: string;
  versionId: string;
  githubAssetId: number;
  name: string;
  sizeBytes: number | null;
  contentType: string | null;
  kind: DisplayAssetKind;
  createdAt: string;
};

export type DisplayVersion = {
  id: string;
  toolId: string;
  tag: string;
  releaseName: string | null;
  githubReleaseId: number;
  publishedAt: string | null;
  createdAt: string;
  assets: DisplayAsset[];
};

export type DisplayTool = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  targetWork: string;
  latestVersion: DisplayVersion | null;
  oldVersions: DisplayVersion[];
  recommendedAsset: DisplayAsset | null;
  documentAsset: DisplayAsset | null;
  otherAssets: DisplayAsset[];
};

export type ToolFilters = {
  query: string;
  category: string;
  latestOnly: boolean;
  hasDocument: boolean;
  hasInstaller: boolean;
};

export type PortalStatsData = {
  activeTools: number;
  latestVersions: number;
  assets: number;
  lastUpdatedAt: string | null;
};
