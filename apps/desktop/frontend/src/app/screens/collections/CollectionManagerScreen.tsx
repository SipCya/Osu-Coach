import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Slider,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add, Check, Delete, Edit, Search } from "@mui/icons-material";
import { useObservable } from "rxjs-hooks";
import { TranslationKey, useTranslation } from "../../i18n";
import { useTheaterContext } from "../../providers/TheaterProvider";
import { collectionStore, SaveResult } from "../../services/collections/collection-store";
import {
  addBeatmapsToCollection,
  BeatmapFilter,
  CollectionScope,
  createCollection,
  DEFAULT_BEATMAP_FILTER,
  deleteCollection,
  filterBeatmaps,
  GameMode,
  LocalBeatmap,
  OsuCollection,
  rankedCategory,
  RankedFilter,
  removeBeatmapsFromCollection,
  renameCollection,
  validateCollectionName,
} from "../../utils/collection-manager";

const ACCENT = "#ff66aa";
const PAGE_SIZE = 100;

const MODE_NAMES: Record<GameMode, string> = { 0: "osu!", 1: "osu!taiko", 2: "osu!catch", 3: "osu!mania" };
const RANKED_LABELS: Record<RankedFilter, TranslationKey> = {
  all: "col.statusAll",
  ranked: "col.statusRanked",
  loved: "col.statusLoved",
  qualified: "col.statusQualified",
  other: "col.statusOther",
};
const SCOPE_LABELS: Record<CollectionScope, TranslationKey> = {
  all: "col.scopeAll",
  inCollection: "col.scopeIn",
  notInCollection: "col.scopeOut",
};

function formatStars(stars: number) {
  return stars > 0 ? `★ ${stars.toFixed(2)}` : "★ ?";
}

function formatDrain(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

type NameDialogState = { mode: "create" } | { mode: "rename"; collection: OsuCollection } | null;

function NameDialog({
  state,
  collections,
  onClose,
  onSubmit,
}: {
  state: NameDialogState;
  collections: OsuCollection[];
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setName(state?.mode === "rename" ? state.collection.name : "");
    setTouched(false);
  }, [state]);

  const error = state
    ? validateCollectionName(collections, name, state.mode === "rename" ? state.collection.id : undefined)
    : null;
  const submit = () => {
    setTouched(true);
    if (!error) onSubmit(name);
  };

  return (
    <Dialog open={state !== null} onClose={onClose} fullWidth maxWidth={"xs"}>
      <DialogTitle>{t(state?.mode === "rename" ? "col.renameTitle" : "col.newTitle")}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin={"dense"}
          label={t("col.name")}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setTouched(true);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          error={touched && error !== null}
          helperText={touched && error ? t(error === "empty" ? "col.nameEmpty" : "col.nameDuplicate") : " "}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("col.cancel")}</Button>
        <Button onClick={submit} variant={"contained"} disabled={touched && error !== null}>
          {t(state?.mode === "rename" ? "col.confirm" : "col.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({
  collection,
  onClose,
  onConfirm,
}: {
  collection: OsuCollection | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={collection !== null} onClose={onClose}>
      <DialogTitle>{t("col.deleteTitle")}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {collection && t("col.deleteText", { name: collection.name, count: collection.mapIds.length })}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("col.cancel")}</Button>
        <Button onClick={onConfirm} color={"error"} variant={"contained"}>
          {t("col.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CollectionList({
  collections,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  collections: OsuCollection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (c: OsuCollection) => void;
  onDelete: (c: OsuCollection) => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack sx={{ flex: 1, minHeight: 0 }}>
      <Stack direction={"row"} alignItems={"center"} sx={{ px: 2, pt: 2, pb: 1 }}>
        <Typography variant={"h6"} sx={{ fontWeight: 700, flex: 1 }}>
          {t("col.title")}
        </Typography>
        <Button size={"small"} startIcon={<Add />} onClick={onCreate} sx={{ color: ACCENT, fontWeight: 700 }}>
          {t("col.new")}
        </Button>
      </Stack>
      {collections.length === 0 ? (
        <Typography variant={"body2"} color={"text.secondary"} sx={{ px: 2, py: 1 }}>
          {t("col.empty")}
        </Typography>
      ) : (
        <List dense sx={{ flex: 1, overflowY: "auto", px: 1 }}>
          {collections.map((c) => (
            <ListItemButton
              key={c.id}
              selected={c.id === selectedId}
              onClick={() => onSelect(c.id)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                "& .collection-actions": { visibility: "hidden" },
                "&:hover .collection-actions, &.Mui-selected .collection-actions": { visibility: "visible" },
                "&.Mui-selected": { backgroundColor: "rgba(255,102,170,0.16)" },
              }}
            >
              <ListItemText
                primary={c.name}
                secondary={t("col.mapsCount", { count: c.mapIds.length })}
                primaryTypographyProps={{ noWrap: true, fontWeight: 600 }}
              />
              <Stack direction={"row"} className={"collection-actions"}>
                <Tooltip title={t("col.rename")}>
                  <IconButton
                    size={"small"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRename(c);
                    }}
                  >
                    <Edit fontSize={"small"} />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t("col.delete")}>
                  <IconButton
                    size={"small"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(c);
                    }}
                  >
                    <Delete fontSize={"small"} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </ListItemButton>
          ))}
        </List>
      )}
    </Stack>
  );
}

function SavePanel({
  dirty,
  osuRunning,
  onSaved,
}: {
  dirty: boolean;
  osuRunning: boolean;
  onSaved: (r: SaveResult) => void;
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const result = await collectionStore.save();
    setSaving(false);
    onSaved(result);
  };
  return (
    <Stack gap={1} sx={{ p: 2 }}>
      {osuRunning && (
        <Alert severity={"warning"} sx={{ fontSize: "0.8rem" }}>
          {t("col.osuRunning")}
        </Alert>
      )}
      <Typography variant={"caption"} color={dirty ? ACCENT : "text.secondary"} sx={{ fontWeight: 700 }}>
        {t(dirty ? "col.unsaved" : "col.allSaved")}
      </Typography>
      <Button
        variant={"contained"}
        disabled={!dirty || saving}
        onClick={save}
        sx={{ backgroundColor: ACCENT, color: "#15151b", fontWeight: 700, "&:hover": { backgroundColor: "#ff85bb" } }}
      >
        {saving ? <CircularProgress size={22} /> : t("col.saveToOsu")}
      </Button>
      <Stack direction={"row"} gap={1}>
        <Button
          size={"small"}
          disabled={!dirty || saving}
          onClick={() => void collectionStore.discardChanges()}
          sx={{ flex: 1 }}
        >
          {t("col.discard")}
        </Button>
        <Tooltip title={dirty ? t("col.reloadDisabled") : ""}>
          <span style={{ flex: 1, display: "flex" }}>
            <Button
              size={"small"}
              disabled={dirty || saving}
              onClick={() => void collectionStore.load(collectionStore.state$.getValue().osuFolder)}
              sx={{ flex: 1 }}
            >
              {t("col.reload")}
            </Button>
          </span>
        </Tooltip>
      </Stack>
    </Stack>
  );
}

function Filters({
  filter,
  onChange,
  hasCollection,
}: {
  filter: BeatmapFilter;
  onChange: (f: BeatmapFilter) => void;
  hasCollection: boolean;
}) {
  const { t } = useTranslation();
  const set = (partial: Partial<BeatmapFilter>) => onChange({ ...filter, ...partial });
  return (
    <Stack gap={1.5}>
      <TextField
        size={"small"}
        fullWidth
        placeholder={t("col.search")}
        value={filter.query}
        onChange={(e) => set({ query: e.target.value })}
        InputProps={{
          startAdornment: (
            <InputAdornment position={"start"}>
              <Search fontSize={"small"} />
            </InputAdornment>
          ),
        }}
      />
      <Stack direction={"row"} gap={2} alignItems={"center"} flexWrap={"wrap"}>
        <TextField
          select
          size={"small"}
          label={t("col.mode")}
          value={filter.mode}
          onChange={(e) => set({ mode: e.target.value === "all" ? "all" : (Number(e.target.value) as GameMode) })}
          sx={{ minWidth: 150 }}
        >
          <MenuItem value={"all"}>{t("col.modeAll")}</MenuItem>
          {([0, 1, 2, 3] as GameMode[]).map((m) => (
            <MenuItem key={m} value={m}>
              {MODE_NAMES[m]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size={"small"}
          label={t("col.status")}
          value={filter.ranked}
          onChange={(e) => set({ ranked: e.target.value as RankedFilter })}
          sx={{ minWidth: 150 }}
        >
          {(Object.keys(RANKED_LABELS) as RankedFilter[]).map((r) => (
            <MenuItem key={r} value={r}>
              {t(RANKED_LABELS[r])}
            </MenuItem>
          ))}
        </TextField>
        <Stack direction={"row"} alignItems={"center"} gap={1.5} sx={{ minWidth: 240, flex: 1, maxWidth: 360 }}>
          <Typography variant={"body2"} color={"text.secondary"} noWrap>
            {t("col.stars")} {filter.minStars.toFixed(1)}–{filter.maxStars >= 10 ? "10+" : filter.maxStars.toFixed(1)}
          </Typography>
          <Slider
            size={"small"}
            min={0}
            max={10}
            step={0.1}
            value={[filter.minStars, filter.maxStars]}
            onChange={(_, v) => {
              const [minStars, maxStars] = v as number[];
              set({ minStars, maxStars });
            }}
            sx={{ color: ACCENT }}
          />
        </Stack>
      </Stack>
      {hasCollection && (
        <ToggleButtonGroup
          size={"small"}
          exclusive
          value={filter.scope}
          onChange={(_, scope: CollectionScope | null) => scope && set({ scope })}
        >
          {(Object.keys(SCOPE_LABELS) as CollectionScope[]).map((s) => (
            <ToggleButton key={s} value={s} sx={{ textTransform: "none", px: 2 }}>
              {t(SCOPE_LABELS[s])}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}
    </Stack>
  );
}

function BeatmapRow({
  beatmap,
  collection,
  inCollection,
  onToggle,
}: {
  beatmap: LocalBeatmap;
  collection: OsuCollection | null;
  inCollection: boolean;
  onToggle: (b: LocalBeatmap) => void;
}) {
  const { t } = useTranslation();
  const category = rankedCategory(beatmap.rankedStatus);
  return (
    <Stack
      direction={"row"}
      alignItems={"center"}
      gap={1.5}
      sx={{ px: 1.5, py: 0.75, borderRadius: 2, "&:hover": { backgroundColor: "action.hover" } }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 600 }}>
          {beatmap.artist} - {beatmap.title}{" "}
          <Box component={"span"} sx={{ color: ACCENT }}>
            [{beatmap.version}]
          </Box>
        </Typography>
        <Typography variant={"body2"} color={"text.secondary"} noWrap>
          {t("sc.mappedBy", { creator: beatmap.creator })} · {formatStars(beatmap.stars)} ·{" "}
          {formatDrain(beatmap.drainTime)}
          {beatmap.mode !== 0 && ` · ${MODE_NAMES[beatmap.mode]}`}
        </Typography>
      </Box>
      {category !== "other" && (
        <Chip size={"small"} variant={"outlined"} label={t(RANKED_LABELS[category])} sx={{ fontSize: "0.7rem" }} />
      )}
      {collection && (
        <Tooltip title={t(inCollection ? "col.remove" : "col.add", { name: collection.name })}>
          <IconButton
            onClick={() => onToggle(beatmap)}
            sx={
              inCollection
                ? { color: "#15151b", backgroundColor: ACCENT, "&:hover": { backgroundColor: "#ff85bb" } }
                : {}
            }
          >
            {inCollection ? <Check fontSize={"small"} /> : <Add fontSize={"small"} />}
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}

export function CollectionManagerScreen() {
  const { t } = useTranslation();
  const theater = useTheaterContext();
  const osuFolderService = theater.analyzer.osuFolderService;
  const state = useObservable(() => collectionStore.state$, collectionStore.state$.getValue());
  const osuRunning = useObservable(() => collectionStore.osuRunning$, collectionStore.osuRunning$.getValue());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<BeatmapFilter>(DEFAULT_BEATMAP_FILTER);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [toDelete, setToDelete] = useState<OsuCollection | null>(null);
  const [notice, setNotice] = useState<{ severity: "success" | "warning" | "error"; text: string } | null>(null);

  useEffect(() => {
    void collectionStore.ensureLoaded(osuFolderService.getOsuFolder());
    collectionStore.startWatchingOsu();
    return () => collectionStore.stopWatchingOsu();
  }, [osuFolderService]);

  const { collections, beatmaps, beatmapsById } = state;
  const selected = collections.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected && collections.length > 0) setSelectedId(collections[0].id);
  }, [selected, collections]);

  const selectedMapIds = useMemo(() => new Set(selected?.mapIds ?? []), [selected]);
  const deferredFilter = useDeferredValue(filter);
  const scope = selected ? deferredFilter.scope : "all";
  const results = useMemo(
    () => filterBeatmaps(beatmaps, { ...deferredFilter, scope }, selectedMapIds),
    [beatmaps, deferredFilter, scope, selectedMapIds],
  );
  const missing = useMemo(
    () => (selected ? selected.mapIds.filter((id) => !beatmapsById.has(id)) : []),
    [selected, beatmapsById],
  );

  useEffect(() => setVisible(PAGE_SIZE), [deferredFilter, selectedId]);

  const toggleBeatmap = useCallback(
    (b: LocalBeatmap) => {
      if (!selected) return;
      collectionStore.update((cs) =>
        selectedMapIds.has(b.md5)
          ? removeBeatmapsFromCollection(cs, selected.id, [b.md5])
          : addBeatmapsToCollection(cs, selected.id, [b.md5]),
      );
    },
    [selected, selectedMapIds],
  );

  const onNameSubmit = (name: string) => {
    if (nameDialog?.mode === "rename") {
      collectionStore.update((cs) => renameCollection(cs, nameDialog.collection.id, name));
    } else {
      const created = createCollection(name);
      collectionStore.update((cs) => [...cs, created]);
      setSelectedId(created.id);
      setFilter((f) => ({ ...f, scope: "all" }));
    }
    setNameDialog(null);
  };

  const onSaved = (result: SaveResult) => {
    if (result.ok) {
      setNotice({ severity: "success", text: t(result.backup ? "col.saveOk" : "col.saveOkNoBackup") });
    } else if (result.reason === "osuRunning") {
      setNotice({ severity: "warning", text: t("col.saveOsuRunning") });
    } else if (result.reason === "changedOnDisk") {
      setNotice({ severity: "warning", text: t("col.saveChanged") });
    } else {
      setNotice({ severity: "error", text: t("col.saveError", { error: result.error ?? "" }) });
    }
  };

  if (state.status === "idle" || state.status === "loading") {
    return (
      <Stack alignItems={"center"} justifyContent={"center"} gap={2} sx={{ height: "100%" }}>
        <CircularProgress sx={{ color: ACCENT }} />
        <Typography color={"text.secondary"}>{t("col.loading")}</Typography>
      </Stack>
    );
  }
  if (state.status === "error") {
    return (
      <Stack alignItems={"center"} justifyContent={"center"} gap={2} sx={{ height: "100%", p: 4 }}>
        <Alert severity={"error"}>{t("col.loadError", { error: state.error ?? "" })}</Alert>
        <Button variant={"outlined"} onClick={() => void collectionStore.load(osuFolderService.getOsuFolder())}>
          {t("col.retry")}
        </Button>
      </Stack>
    );
  }

  const shown = results.slice(0, visible);
  const shownInCollection = selected ? results.filter((b) => selectedMapIds.has(b.md5)).length : 0;

  return (
    <Stack direction={"row"} sx={{ height: "100%" }}>
      <Paper square elevation={0} sx={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <CollectionList
          collections={collections}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          onCreate={() => setNameDialog({ mode: "create" })}
          onRename={(collection) => setNameDialog({ mode: "rename", collection })}
          onDelete={setToDelete}
        />
        <Divider />
        <SavePanel dirty={state.dirty} osuRunning={osuRunning} onSaved={onSaved} />
      </Paper>
      <Divider orientation={"vertical"} />

      <Stack sx={{ flex: 1, minWidth: 0, height: "100%" }}>
        <Box sx={{ p: 2, pb: 1 }}>
          {selected ? (
            <Typography variant={"h5"} sx={{ fontWeight: 800, mb: 1.5 }} noWrap>
              {selected.name}
            </Typography>
          ) : (
            <Alert severity={"info"} sx={{ mb: 1.5 }}>
              {t("col.selectCollection")}
            </Alert>
          )}
          <Filters filter={filter} onChange={setFilter} hasCollection={selected !== null} />
          {selected && missing.length > 0 && (
            <Alert
              severity={"info"}
              sx={{ mt: 1.5 }}
              action={
                <Button
                  size={"small"}
                  color={"inherit"}
                  onClick={() => collectionStore.update((cs) => removeBeatmapsFromCollection(cs, selected.id, missing))}
                >
                  {t("col.removeMissing")}
                </Button>
              }
            >
              {t("col.missing", { count: missing.length })}
            </Alert>
          )}
          <Stack direction={"row"} alignItems={"center"} gap={1} sx={{ mt: 1.5 }}>
            <Typography variant={"body2"} color={"text.secondary"} sx={{ flex: 1 }}>
              {t("col.results", { count: results.length })}
            </Typography>
            {selected && results.length > shownInCollection && (
              <Button
                size={"small"}
                onClick={() =>
                  collectionStore.update((cs) =>
                    addBeatmapsToCollection(
                      cs,
                      selected.id,
                      results.map((b) => b.md5),
                    ),
                  )
                }
              >
                {t("col.addAll", { count: results.length - shownInCollection })}
              </Button>
            )}
            {selected && shownInCollection > 0 && (
              <Button
                size={"small"}
                color={"inherit"}
                onClick={() =>
                  collectionStore.update((cs) =>
                    removeBeatmapsFromCollection(
                      cs,
                      selected.id,
                      results.map((b) => b.md5),
                    ),
                  )
                }
              >
                {t("col.removeAll", { count: shownInCollection })}
              </Button>
            )}
          </Stack>
        </Box>
        <Divider />
        <Box sx={{ flex: 1, overflowY: "auto", px: 1, py: 1 }}>
          {results.length === 0 ? (
            <Typography color={"text.secondary"} sx={{ p: 2 }}>
              {t("col.noResults")}
            </Typography>
          ) : (
            <>
              {shown.map((b) => (
                <BeatmapRow
                  key={b.md5}
                  beatmap={b}
                  collection={selected}
                  inCollection={selectedMapIds.has(b.md5)}
                  onToggle={toggleBeatmap}
                />
              ))}
              {results.length > visible && (
                <Stack alignItems={"center"} sx={{ py: 1 }}>
                  <Button onClick={() => setVisible((v) => v + PAGE_SIZE)}>{t("col.showMore")}</Button>
                </Stack>
              )}
            </>
          )}
        </Box>
      </Stack>

      <NameDialog
        state={nameDialog}
        collections={collections}
        onClose={() => setNameDialog(null)}
        onSubmit={onNameSubmit}
      />
      <DeleteDialog
        collection={toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) collectionStore.update((cs) => deleteCollection(cs, toDelete.id));
          setToDelete(null);
        }}
      />
      {notice && (
        <Snackbar
          open
          autoHideDuration={notice.severity === "success" ? 6000 : null}
          onClose={() => setNotice(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ maxWidth: 560 }}>
            {notice.text}
          </Alert>
        </Snackbar>
      )}
    </Stack>
  );
}
