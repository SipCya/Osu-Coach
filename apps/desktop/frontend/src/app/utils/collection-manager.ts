export interface OsuCollection {
  id: string;
  name: string;
  mapIds: string[];
}

let idCounter = 0;

function newCollectionId() {
  idCounter++;
  return `c${Date.now().toString(36)}${idCounter.toString(36)}`;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function createCollection(name: string, mapIds: string[] = []): OsuCollection {
  return { id: newCollectionId(), name: name.trim(), mapIds: unique(mapIds) };
}

export function normalizeCollectionState(collections: OsuCollection[]): OsuCollection[] {
  return collections.map((c) => ({ id: c.id, name: c.name.trim(), mapIds: unique(c.mapIds) }));
}

export type CollectionNameError = "empty" | "duplicate";

export function validateCollectionName(
  collections: OsuCollection[],
  name: string,
  exceptId?: string,
): CollectionNameError | null {
  const trimmed = name.trim();
  if (!trimmed) return "empty";
  const lower = trimmed.toLowerCase();
  if (collections.some((c) => c.id !== exceptId && c.name.toLowerCase() === lower)) return "duplicate";
  return null;
}

export function renameCollection(collections: OsuCollection[], id: string, name: string): OsuCollection[] {
  return collections.map((c) => (c.id === id ? { ...c, name: name.trim() } : c));
}

export function deleteCollection(collections: OsuCollection[], id: string): OsuCollection[] {
  return collections.filter((c) => c.id !== id);
}

export function addBeatmapsToCollection(collections: OsuCollection[], id: string, mapIds: string[]): OsuCollection[] {
  return collections.map((c) => (c.id === id ? { ...c, mapIds: unique([...c.mapIds, ...mapIds]) } : c));
}

export function addBeatmapToCollection(collections: OsuCollection[], id: string, mapId: string): OsuCollection[] {
  return addBeatmapsToCollection(collections, id, [mapId]);
}

export function removeBeatmapsFromCollection(
  collections: OsuCollection[],
  id: string,
  mapIds: string[],
): OsuCollection[] {
  const toRemove = new Set(mapIds);
  return collections.map((c) => (c.id === id ? { ...c, mapIds: c.mapIds.filter((m) => !toRemove.has(m)) } : c));
}

export function removeBeatmapFromCollection(collections: OsuCollection[], id: string, mapId: string): OsuCollection[] {
  return removeBeatmapsFromCollection(collections, id, [mapId]);
}

export type GameMode = 0 | 1 | 2 | 3;
export type RankedFilter = "all" | "ranked" | "loved" | "qualified" | "other";
export type CollectionScope = "all" | "inCollection" | "notInCollection";

export interface LocalBeatmap {
  md5: string;
  artist: string;
  title: string;
  creator: string;
  version: string;
  mode: GameMode;
  stars: number;
  rankedStatus: number;
  beatmapSetId: number;
  folderName: string;
  drainTime: number;
  searchText: string;
}

export interface BeatmapFilter {
  query: string;
  mode: GameMode | "all";
  ranked: RankedFilter;
  minStars: number;
  maxStars: number;
  scope: CollectionScope;
}

export const DEFAULT_BEATMAP_FILTER: BeatmapFilter = {
  query: "",
  mode: "all",
  ranked: "all",
  minStars: 0,
  maxStars: 10,
  scope: "all",
};

export function rankedCategory(rankedStatus: number): Exclude<RankedFilter, "all"> {
  if (rankedStatus === 4 || rankedStatus === 5) return "ranked";
  if (rankedStatus === 7) return "loved";
  if (rankedStatus === 6) return "qualified";
  return "other";
}

export function filterBeatmaps(
  beatmaps: LocalBeatmap[],
  filter: BeatmapFilter,
  collectionMapIds: ReadonlySet<string> = new Set(),
): LocalBeatmap[] {
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  const maxStars = filter.maxStars >= 10 ? Infinity : filter.maxStars;
  return beatmaps.filter((b) => {
    if (filter.scope === "inCollection" && !collectionMapIds.has(b.md5)) return false;
    if (filter.scope === "notInCollection" && collectionMapIds.has(b.md5)) return false;
    if (filter.mode !== "all" && b.mode !== filter.mode) return false;
    if (filter.ranked !== "all" && rankedCategory(b.rankedStatus) !== filter.ranked) return false;
    if (b.stars < filter.minStars || b.stars > maxStars) return false;
    return words.every((w) => b.searchText.includes(w));
  });
}

export function compareBeatmaps(a: LocalBeatmap, b: LocalBeatmap): number {
  return (
    a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" }) ||
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) ||
    a.beatmapSetId - b.beatmapSetId ||
    a.stars - b.stars
  );
}
