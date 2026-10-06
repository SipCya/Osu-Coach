import {
  addBeatmapsToCollection,
  addBeatmapToCollection,
  createCollection,
  DEFAULT_BEATMAP_FILTER,
  deleteCollection,
  filterBeatmaps,
  LocalBeatmap,
  normalizeCollectionState,
  removeBeatmapFromCollection,
  renameCollection,
  validateCollectionName,
} from "./collection-manager";

describe("collection manager", () => {
  it("creates a new collection and normalizes the state", () => {
    const result = createCollection("My collection");
    expect(result.name).toBe("My collection");
    expect(result.mapIds).toEqual([]);

    const normalized = normalizeCollectionState([
      { id: "a", name: "  Demo  ", mapIds: ["1", "2", "1"] },
      { id: "b", name: "Second", mapIds: ["3"] },
    ]);

    expect(normalized).toEqual([
      { id: "a", name: "Demo", mapIds: ["1", "2"] },
      { id: "b", name: "Second", mapIds: ["3"] },
    ]);
  });

  it("adds and removes a beatmap from a collection", () => {
    const collections = [
      { id: "c1", name: "Favorites", mapIds: ["map-1"] },
      { id: "c2", name: "Later", mapIds: [] },
    ];

    const afterAdd = addBeatmapToCollection(collections, "c2", "map-2");
    expect(afterAdd[1].mapIds).toEqual(["map-2"]);

    const afterRemove = removeBeatmapFromCollection(afterAdd, "c2", "map-2");
    expect(afterRemove[1].mapIds).toEqual([]);
  });

  it("renames a collection", () => {
    const collections = [{ id: "c1", name: "Old", mapIds: [] }];
    const renamed = renameCollection(collections, "c1", "New");
    expect(renamed[0].name).toBe("New");
  });

  it("deletes a collection and never duplicates maps", () => {
    const collections = [
      { id: "c1", name: "A", mapIds: ["m1"] },
      { id: "c2", name: "B", mapIds: [] },
    ];
    expect(deleteCollection(collections, "c1").map((c) => c.id)).toEqual(["c2"]);
    expect(addBeatmapsToCollection(collections, "c1", ["m1", "m2", "m2"])[0].mapIds).toEqual(["m1", "m2"]);
    expect(collections[0].mapIds).toEqual(["m1"]);
  });

  it("validates collection names like osu! (unique, not empty)", () => {
    const collections = [{ id: "c1", name: "Farm", mapIds: [] }];
    expect(validateCollectionName(collections, "   ")).toBe("empty");
    expect(validateCollectionName(collections, " farm ")).toBe("duplicate");
    expect(validateCollectionName(collections, "Farm", "c1")).toBeNull();
    expect(validateCollectionName(collections, "Aim")).toBeNull();
  });
});

describe("beatmap filters", () => {
  const map = (md5: string, partial: Partial<LocalBeatmap>): LocalBeatmap => ({
    md5,
    artist: "",
    title: "",
    creator: "",
    version: "",
    mode: 0,
    stars: 5,
    rankedStatus: 4,
    beatmapSetId: 1,
    folderName: "",
    drainTime: 60,
    searchText: "",
    ...partial,
  });
  const maps = [
    map("a", { searchText: "camellia ghost hard", stars: 4.2 }),
    map("b", { searchText: "camellia ghost extra", stars: 7.1, rankedStatus: 7 }),
    map("c", { searchText: "xi freedom dive", stars: 7.5, mode: 3 }),
  ];
  const ids = (list: LocalBeatmap[]) => list.map((b) => b.md5);

  it("searches every word, in any order", () => {
    expect(ids(filterBeatmaps(maps, { ...DEFAULT_BEATMAP_FILTER, query: "GHOST camellia" }))).toEqual(["a", "b"]);
  });

  it("filters by stars, mode and ranked status", () => {
    expect(ids(filterBeatmaps(maps, { ...DEFAULT_BEATMAP_FILTER, minStars: 7 }))).toEqual(["b", "c"]);
    expect(ids(filterBeatmaps(maps, { ...DEFAULT_BEATMAP_FILTER, mode: 3 }))).toEqual(["c"]);
    expect(ids(filterBeatmaps(maps, { ...DEFAULT_BEATMAP_FILTER, ranked: "loved" }))).toEqual(["b"]);
  });

  it("filters by membership of the selected collection", () => {
    const inCollection = new Set(["a"]);
    expect(ids(filterBeatmaps(maps, { ...DEFAULT_BEATMAP_FILTER, scope: "inCollection" }, inCollection))).toEqual([
      "a",
    ]);
    expect(ids(filterBeatmaps(maps, { ...DEFAULT_BEATMAP_FILTER, scope: "notInCollection" }, inCollection))).toEqual([
      "b",
      "c",
    ]);
  });
});
