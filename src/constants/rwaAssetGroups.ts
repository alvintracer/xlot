import { ALL_RWA_ASSETS } from './rwaAssets';
import type { RWAAsset, RWACategory } from './rwaAssets';

export interface RWAAssetGroup {
  canonicalId: string;
  displayName: string;
  issuer: string;
  category: RWACategory;
  coingeckoId: string | null;
  navSource: string;
  fallbackNavUsd: number;
  navLabel: string;
  description: string;
  tags: string[];
  members: RWAAsset[]; // Deployments on various chains
}

// Group ALL_RWA_ASSETS by Coingecko ID or Name
function buildAssetGroups(): RWAAssetGroup[] {
  const groupMap = new Map<string, RWAAssetGroup>();

  ALL_RWA_ASSETS.forEach(asset => {
    // We group by coinGeckoId or symbol if coingeckoId is null
    const key = asset.coingeckoId || asset.symbol.toLowerCase();

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        canonicalId: key,
        displayName: asset.name,
        issuer: asset.issuer,
        category: asset.category,
        coingeckoId: asset.coingeckoId,
        navSource: asset.navSource,
        fallbackNavUsd: asset.fallbackNavUsd,
        navLabel: asset.navLabel,
        description: asset.description,
        tags: asset.tags,
        members: []
      });
    }

    groupMap.get(key)!.members.push(asset);
  });

  return Array.from(groupMap.values());
}

export const RWA_ASSET_GROUPS = buildAssetGroups();
