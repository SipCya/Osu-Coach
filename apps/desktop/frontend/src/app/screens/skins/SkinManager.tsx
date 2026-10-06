import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Slider,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Casino, Edit, FolderOpen, PlayArrow, Restore, Search, SwapHoriz } from "@mui/icons-material";
import { shell } from "electron";
import { TranslationKey, useTranslation } from "../../i18n";
import { useTheaterContext } from "../../providers/TheaterProvider";
import {
  createMixedSkin,
  listSkins,
  LoadedSkin,
  loadSkin,
  readSkinFile,
  replaceGroup,
  restoreGroup,
  skinAvailability,
  skinsFolder,
  writeSkinImage,
} from "../../services/skins/skin-files";
import {
  MixAssignment,
  previewFile,
  randomAssignment,
  SKIN_GROUPS,
  SkinFile,
  SkinGroup,
  SkinGroupId,
  twinOf,
} from "../../services/skins/skin-elements";
import { adjustPixels, ColorAdjust, isNoAdjust, NO_ADJUST } from "../../services/skins/image-colors";

const ACCENT = "#ff66aa";
const PINK_BUTTON = {
  backgroundColor: ACCENT,
  color: "#15151b",
  fontWeight: 700,
  "&:hover": { backgroundColor: "#ff85bb" },
};
const CHECKER = {
  backgroundColor: "#2a2a33",
  backgroundImage:
    "linear-gradient(45deg, #34343f 25%, transparent 25%), linear-gradient(-45deg, #34343f 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #34343f 75%), linear-gradient(-45deg, transparent 75%, #34343f 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
};

export const GROUP_LABELS: Record<SkinGroupId, TranslationKey> = {
  cursor: "sk.group.cursor",
  hitcircle: "sk.group.hitcircle",
  numbers: "sk.group.numbers",
  slider: "sk.group.slider",
  judgements: "sk.group.judgements",
  followpoint: "sk.group.followpoint",
  spinner: "sk.group.spinner",
  scoreNumbers: "sk.group.scoreNumbers",
  hitsounds: "sk.group.hitsounds",
  uiSounds: "sk.group.uiSounds",
};

const mimeOf = (path: string) =>
  /\.png$/i.test(path)
    ? "image/png"
    : /\.jpe?g$/i.test(path)
    ? "image/jpeg"
    : /\.ogg$/i.test(path)
    ? "audio/ogg"
    : /\.mp3$/i.test(path)
    ? "audio/mpeg"
    : "audio/wav";

function useSkinFileUrl(skin: LoadedSkin | null, path: string | null, version = 0) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!skin || !path) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    readSkinFile(skin, path)
      .then((data) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([data], { type: mimeOf(path) }));
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setUrl(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [skin, path, version]);
  return url;
}

function ElementPreview({
  skin,
  group,
  files,
  size = 96,
}: {
  skin: LoadedSkin | null;
  group: SkinGroup;
  files: SkinFile[];
  size?: number;
}) {
  const preview = previewFile(group, files);
  const url = useSkinFileUrl(skin, preview?.path ?? null);
  return (
    <Box
      sx={{
        ...CHECKER,
        width: size,
        height: size,
        borderRadius: 2,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {url ? (
        <img src={url} alt={""} style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }} />
      ) : (
        <Typography variant={"caption"} color={"text.secondary"}>
          –
        </Typography>
      )}
    </Box>
  );
}

function PlaySound({ skin, files }: { skin: LoadedSkin; files: SkinFile[] }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const play = async () => {
    const file = files[index % files.length];
    setIndex((i) => i + 1);
    const data = await readSkinFile(skin, file.path);
    const url = URL.createObjectURL(new Blob([data], { type: mimeOf(file.path) }));
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    void audio.play().catch(() => URL.revokeObjectURL(url));
  };
  return (
    <Tooltip title={t("sk.listen")}>
      <span>
        <IconButton disabled={files.length === 0} onClick={() => void play()}>
          <PlayArrow />
        </IconButton>
      </span>
    </Tooltip>
  );
}

function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{text}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("col.cancel")}</Button>
        <Button variant={"contained"} onClick={onConfirm} sx={PINK_BUTTON}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SourceSkinRow({
  osuFolder,
  name,
  group,
  onPick,
}: {
  osuFolder: string;
  name: string;
  group: SkinGroup;
  onPick: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [skin, setSkin] = useState<LoadedSkin | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSkin(osuFolder, name)
      .then((s) => !cancelled && setSkin(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [osuFolder, name]);
  const files = skin?.groups.get(group.id) ?? [];
  if (skin && files.length === 0) return null;
  return (
    <ListItemButton onClick={() => onPick(name)} disabled={!skin} sx={{ borderRadius: 2, gap: 2 }}>
      {group.kind === "image" ? (
        <ElementPreview skin={skin} group={group} files={files} size={56} />
      ) : (
        skin && <PlaySound skin={skin} files={files} />
      )}
      <ListItemText primary={name} secondary={skin ? t("sk.files", { count: files.length }) : "…"} />
    </ListItemButton>
  );
}

function ReplaceDialog({
  osuFolder,
  skins,
  target,
  group,
  onClose,
  onDone,
}: {
  osuFolder: string;
  skins: string[];
  target: LoadedSkin;
  group: SkinGroup | null;
  onClose: () => void;
  onDone: (message: string, ok: boolean) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    setQuery("");
    setChosen(null);
  }, [group]);
  if (!group) return null;
  const others = skins.filter((s) => s !== target.name && s.toLowerCase().includes(query.toLowerCase()));
  const groupName = t(GROUP_LABELS[group.id]);

  const replace = async () => {
    if (!chosen) return;
    setWorking(true);
    try {
      await replaceGroup(osuFolder, target.name, chosen, group.id);
      onDone(t("sk.replaced", { group: groupName, source: chosen }), true);
    } catch (e) {
      onDone(t("sk.error", { error: e instanceof Error ? e.message : String(e) }), false);
    }
    setWorking(false);
    setChosen(null);
  };

  return (
    <>
      <Dialog open onClose={onClose} fullWidth maxWidth={"sm"}>
        <DialogTitle>{t("sk.replaceTitle", { group: groupName, skin: target.name })}</DialogTitle>
        <DialogContent>
          <TextField
            size={"small"}
            fullWidth
            autoFocus
            placeholder={t("sk.searchSkin")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ mb: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position={"start"}>
                  <Search fontSize={"small"} />
                </InputAdornment>
              ),
            }}
          />
          <List dense sx={{ maxHeight: 420, overflowY: "auto" }}>
            {others.map((name) => (
              <SourceSkinRow key={name} osuFolder={osuFolder} name={name} group={group} onPick={setChosen} />
            ))}
          </List>
          {working && <CircularProgress size={24} sx={{ color: ACCENT }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("col.cancel")}</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={chosen !== null && !working}
        title={t("sk.replaceConfirmTitle")}
        text={t("sk.replaceConfirmText", { group: groupName, skin: target.name, source: chosen ?? "" })}
        confirmLabel={t("sk.replace")}
        onClose={() => setChosen(null)}
        onConfirm={() => void replace()}
      />
    </>
  );
}

async function decodeImage(data: Buffer, path: string): Promise<ImageData> {
  const bitmap = await createImageBitmap(new Blob([data], { type: mimeOf(path) }));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

async function encodeImage(image: ImageData, path: string): Promise<Buffer> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  (canvas.getContext("2d") as CanvasRenderingContext2D).putImageData(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeOf(path), 0.95));
  if (!blob) throw new Error("encode failed");
  return Buffer.from(await blob.arrayBuffer());
}

function ImageCanvas({ image }: { image: ImageData | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !image) return;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d")?.putImageData(image, 0, 0);
  }, [image]);
  return (
    <Box
      sx={{
        ...CHECKER,
        flex: 1,
        height: 240,
        borderRadius: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <canvas ref={ref} style={{ maxWidth: "90%", maxHeight: "90%", imageRendering: "auto" }} />
    </Box>
  );
}

function ColorEditor({
  skin,
  group,
  onClose,
  onSaved,
}: {
  skin: LoadedSkin;
  group: SkinGroup | null;
  onClose: () => void;
  onSaved: (message: string, ok: boolean) => void;
}) {
  const { t } = useTranslation();
  const images = useMemo(
    () => (group ? (skin.groups.get(group.id) ?? []).filter((f) => /\.(png|jpe?g)$/i.test(f.path)) : []),
    [skin, group],
  );
  const [path, setPath] = useState<string>("");
  const [original, setOriginal] = useState<ImageData | null>(null);
  const [adjust, setAdjust] = useState<ColorAdjust>(NO_ADJUST);
  const [useTint, setUseTint] = useState(false);
  const [tint, setTint] = useState(ACCENT);
  const [withTwin, setWithTwin] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!group) return;
    setPath(previewFile(group, images)?.path ?? images[0]?.path ?? "");
    setAdjust(NO_ADJUST);
    setUseTint(false);
  }, [group, images]);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    readSkinFile(skin, path)
      .then((data) => decodeImage(data, path))
      .then((img) => !cancelled && setOriginal(img))
      .catch(() => !cancelled && setOriginal(null));
    return () => {
      cancelled = true;
    };
  }, [skin, path]);

  const effective: ColorAdjust = useMemo(() => ({ ...adjust, tint: useTint ? tint : null }), [adjust, useTint, tint]);
  const preview = useMemo(
    () => (original ? new ImageData(adjustPixels(original.data, effective), original.width, original.height) : null),
    [original, effective],
  );

  if (!group) return null;
  const twin = images.find((f) => f.path.toLowerCase() === twinOf(path).toLowerCase());

  const save = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await writeSkinImage(skin, path, await encodeImage(preview, path));
      if (withTwin && twin) {
        const twinImage = await decodeImage(await readSkinFile(skin, twin.path), twin.path);
        const adjusted = new ImageData(adjustPixels(twinImage.data, effective), twinImage.width, twinImage.height);
        await writeSkinImage(skin, twin.path, await encodeImage(adjusted, twin.path));
      }
      onSaved(t("sk.colorSaved", { file: path }), true);
    } catch (e) {
      onSaved(t("sk.error", { error: e instanceof Error ? e.message : String(e) }), false);
    }
    setSaving(false);
  };

  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    format: string,
    set: (v: number) => void,
  ) => (
    <Box>
      <Stack direction={"row"} justifyContent={"space-between"}>
        <Typography variant={"body2"}>{label}</Typography>
        <Typography variant={"body2"} color={"text.secondary"}>
          {format}
        </Typography>
      </Stack>
      <Slider
        size={"small"}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(_, v) => set(v as number)}
        sx={{ color: ACCENT }}
      />
    </Box>
  );

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth={"md"}>
      <DialogTitle>{t("sk.colorTitle", { group: t(GROUP_LABELS[group.id]) })}</DialogTitle>
      <DialogContent>
        <Stack gap={2}>
          <TextField select size={"small"} label={t("sk.file")} value={path} onChange={(e) => setPath(e.target.value)}>
            {images.map((f) => (
              <MenuItem key={f.path} value={f.path}>
                {f.path}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction={"row"} gap={2}>
            <Stack sx={{ flex: 1 }} gap={0.5}>
              <Typography variant={"caption"} color={"text.secondary"}>
                {t("sk.before")}
              </Typography>
              <ImageCanvas image={original} />
            </Stack>
            <Stack sx={{ flex: 1 }} gap={0.5}>
              <Typography variant={"caption"} color={"text.secondary"}>
                {t("sk.after")}
              </Typography>
              <ImageCanvas image={preview} />
            </Stack>
          </Stack>
          <Stack direction={"row"} alignItems={"center"} gap={2}>
            <FormControlLabel
              control={<Switch checked={useTint} onChange={(e) => setUseTint(e.target.checked)} />}
              label={t("sk.tint")}
            />
            <input
              type={"color"}
              value={tint}
              disabled={!useTint}
              onChange={(e) => setTint(e.target.value)}
              style={{ width: 48, height: 32, border: "none", background: "none", cursor: "pointer" }}
            />
            <Typography variant={"caption"} color={"text.secondary"} sx={{ flex: 1 }}>
              {t("sk.tintHint")}
            </Typography>
          </Stack>
          {slider(t("sk.hue"), adjust.hue, -180, 180, 1, `${adjust.hue}°`, (hue) => setAdjust({ ...adjust, hue }))}
          {slider(
            t("sk.saturation"),
            adjust.saturation,
            0,
            2,
            0.05,
            `${Math.round(adjust.saturation * 100)}%`,
            (saturation) => setAdjust({ ...adjust, saturation }),
          )}
          {slider(
            t("sk.brightness"),
            adjust.brightness,
            -1,
            1,
            0.02,
            `${adjust.brightness > 0 ? "+" : ""}${Math.round(adjust.brightness * 100)}`,
            (brightness) => setAdjust({ ...adjust, brightness }),
          )}
          {twin && (
            <FormControlLabel
              control={<Checkbox checked={withTwin} onChange={(e) => setWithTwin(e.target.checked)} />}
              label={t("sk.withTwin", { file: twin.path })}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setAdjust(NO_ADJUST)} disabled={isNoAdjust(adjust)}>
          {t("sk.resetSliders")}
        </Button>
        <Box flexGrow={1} />
        <Button onClick={onClose}>{t("col.cancel")}</Button>
        <Button
          variant={"contained"}
          onClick={() => void save()}
          disabled={saving || !preview || isNoAdjust(effective)}
          sx={PINK_BUTTON}
        >
          {t("sk.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RandomSkinDialog({
  open,
  osuFolder,
  skins,
  onClose,
  onCreated,
}: {
  open: boolean;
  osuFolder: string;
  skins: string[];
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"all" | "pick">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState<Map<string, Set<SkinGroupId>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [assignment, setAssignment] = useState<MixAssignment | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAssignment(null);
    setError(null);
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    setName(
      `osu!coach mix ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(
        d.getMinutes(),
      )}`,
    );
  }, [open]);

  const sources = mode === "all" ? skins : skins.filter((s) => picked.has(s));

  const generate = async () => {
    setLoading(true);
    const avail = availability ?? (await skinAvailability(osuFolder, skins));
    setAvailability(avail);
    setAssignment(randomAssignment(avail, sources));
    setLoading(false);
  };

  const reroll = (group: SkinGroupId) =>
    availability &&
    assignment &&
    setAssignment(randomAssignment(availability, sources, Math.random, [group], assignment));

  const create = async () => {
    if (!assignment) return;
    setCreating(true);
    setError(null);
    try {
      onCreated(await createMixedSkin(osuFolder, name, assignment));
    } catch (e) {
      setError(t("sk.error", { error: e instanceof Error ? e.message : String(e) }));
    }
    setCreating(false);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth={"md"}>
      <DialogTitle>{t("sk.randomTitle")}</DialogTitle>
      <DialogContent>
        <Stack gap={2}>
          <Typography variant={"body2"} color={"text.secondary"}>
            {t("sk.randomIntro")}
          </Typography>
          <TextField
            label={t("sk.newName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            helperText={t("sk.newNameHint")}
            fullWidth
          />
          <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as "all" | "pick")}>
            <FormControlLabel value={"all"} control={<Radio />} label={t("sk.randomAll", { count: skins.length })} />
            <FormControlLabel value={"pick"} control={<Radio />} label={t("sk.randomPick", { count: picked.size })} />
          </RadioGroup>
          {mode === "pick" && (
            <Paper variant={"outlined"} sx={{ maxHeight: 200, overflowY: "auto", p: 1, borderRadius: 2 }}>
              {skins.map((s) => (
                <FormControlLabel
                  key={s}
                  sx={{ display: "flex" }}
                  control={
                    <Checkbox
                      size={"small"}
                      checked={picked.has(s)}
                      onChange={() =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (next.has(s)) next.delete(s);
                          else next.add(s);
                          return next;
                        })
                      }
                    />
                  }
                  label={s}
                />
              ))}
            </Paper>
          )}
          <Box>
            <Button
              variant={"outlined"}
              startIcon={loading ? <CircularProgress size={16} /> : <Casino />}
              onClick={() => void generate()}
              disabled={loading || sources.length < 2}
            >
              {t(assignment ? "sk.randomAgain" : "sk.randomGenerate")}
            </Button>
            {sources.length < 2 && (
              <Typography variant={"caption"} color={"text.secondary"} sx={{ ml: 2 }}>
                {t("sk.randomNeedTwo")}
              </Typography>
            )}
          </Box>
          {assignment && (
            <Paper variant={"outlined"} sx={{ borderRadius: 2 }}>
              <Stack divider={<Divider />}>
                {SKIN_GROUPS.map((g) => (
                  <Stack key={g.id} direction={"row"} alignItems={"center"} gap={2} sx={{ px: 2, py: 0.75 }}>
                    <Typography sx={{ width: 200, fontWeight: 600 }}>{t(GROUP_LABELS[g.id])}</Typography>
                    <Typography sx={{ flex: 1 }} color={assignment[g.id] ? "text.primary" : "text.secondary"} noWrap>
                      {assignment[g.id] ?? t("sk.randomNone")}
                    </Typography>
                    <Tooltip title={t("sk.reroll")}>
                      <span>
                        <IconButton size={"small"} onClick={() => reroll(g.id)} disabled={!assignment[g.id]}>
                          <Casino fontSize={"small"} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                ))}
              </Stack>
            </Paper>
          )}
          {error && <Alert severity={"error"}>{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("col.cancel")}</Button>
        <Button
          variant={"contained"}
          onClick={() => void create()}
          disabled={!assignment || creating || !name.trim()}
          sx={PINK_BUTTON}
        >
          {t("sk.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function GroupCard({
  skin,
  group,
  onReplace,
  onEdit,
  onRestore,
}: {
  skin: LoadedSkin;
  group: SkinGroup;
  onReplace: () => void;
  onEdit: () => void;
  onRestore: () => void;
}) {
  const { t } = useTranslation();
  const files = skin.groups.get(group.id) ?? [];
  const modified = skin.modified.has(group.id);
  const hasImages = files.some((f) => /\.(png|jpe?g)$/i.test(f.path));
  return (
    <Paper variant={"outlined"} sx={{ p: 1.5, borderRadius: 3, display: "flex", gap: 1.5, alignItems: "center" }}>
      {group.kind === "image" ? (
        <ElementPreview skin={skin} group={group} files={files} />
      ) : (
        <Box sx={{ width: 96, height: 96, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <PlaySound skin={skin} files={files} />
        </Box>
      )}
      <Stack sx={{ flex: 1, minWidth: 0 }} gap={0.5}>
        <Stack direction={"row"} alignItems={"center"} gap={1}>
          <Typography sx={{ fontWeight: 700 }} noWrap>
            {t(GROUP_LABELS[group.id])}
          </Typography>
          {modified && (
            <Chip size={"small"} label={t("sk.modified")} sx={{ backgroundColor: ACCENT, color: "#15151b" }} />
          )}
        </Stack>
        <Typography variant={"caption"} color={"text.secondary"}>
          {files.length > 0 ? t("sk.files", { count: files.length }) : t("sk.missing")}
        </Typography>
        <Stack direction={"row"} gap={0.5} flexWrap={"wrap"}>
          <Button size={"small"} startIcon={<SwapHoriz />} onClick={onReplace}>
            {t("sk.replaceFrom")}
          </Button>
          {group.kind === "image" && (
            <Button size={"small"} startIcon={<Edit />} onClick={onEdit} disabled={!hasImages}>
              {t("sk.editColors")}
            </Button>
          )}
          {modified && (
            <Button size={"small"} color={"inherit"} startIcon={<Restore />} onClick={onRestore}>
              {t("sk.restore")}
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

export function SkinManager() {
  const { t } = useTranslation();
  const theater = useTheaterContext();
  const osuFolder = theater.analyzer.osuFolderService.getOsuFolder();
  const [skins, setSkins] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [skin, setSkin] = useState<LoadedSkin | null>(null);
  const [replacing, setReplacing] = useState<SkinGroup | null>(null);
  const [editing, setEditing] = useState<SkinGroup | null>(null);
  const [restoring, setRestoring] = useState<SkinGroup | null>(null);
  const [randomOpen, setRandomOpen] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const refreshList = useCallback(async () => setSkins(await listSkins(osuFolder)), [osuFolder]);
  const reloadSkin = useCallback(async () => {
    if (!selected) return setSkin(null);
    try {
      setSkin(await loadSkin(osuFolder, selected));
    } catch {
      setSkin(null);
    }
  }, [osuFolder, selected]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);
  useEffect(() => {
    void reloadSkin();
  }, [reloadSkin]);

  const done = (text: string, ok = true) => {
    setReplacing(null);
    setEditing(null);
    setMessage({ text, ok });
    void reloadSkin();
  };

  const restore = async (group: SkinGroup) => {
    setRestoring(null);
    if (!skin) return;
    try {
      await restoreGroup(osuFolder, skin.name, group.id);
      done(t("sk.restored", { group: t(GROUP_LABELS[group.id]) }));
    } catch (e) {
      done(t("sk.error", { error: e instanceof Error ? e.message : String(e) }), false);
    }
  };

  const visible = skins.filter((s) => s.toLowerCase().includes(query.toLowerCase()));

  return (
    <Stack direction={"row"} sx={{ height: "100%" }}>
      <Paper square elevation={0} sx={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <Stack gap={1} sx={{ p: 2, pb: 1 }}>
          <Typography variant={"h6"} sx={{ fontWeight: 700 }}>
            {t("sk.title")}
          </Typography>
          <Button variant={"contained"} startIcon={<Casino />} onClick={() => setRandomOpen(true)} sx={PINK_BUTTON}>
            {t("sk.randomButton")}
          </Button>
          <TextField
            size={"small"}
            placeholder={t("sk.searchSkin")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position={"start"}>
                  <Search fontSize={"small"} />
                </InputAdornment>
              ),
            }}
          />
        </Stack>
        <List dense sx={{ flex: 1, overflowY: "auto", px: 1 }}>
          {visible.map((name) => (
            <ListItemButton
              key={name}
              selected={name === selected}
              onClick={() => setSelected(name)}
              sx={{ borderRadius: 2, "&.Mui-selected": { backgroundColor: "rgba(255,102,170,0.16)" } }}
            >
              <ListItemText primary={name} primaryTypographyProps={{ noWrap: true }} />
            </ListItemButton>
          ))}
          {skins.length === 0 && (
            <Typography variant={"body2"} color={"text.secondary"} sx={{ p: 2 }}>
              {t("sk.noSkins")}
            </Typography>
          )}
        </List>
        <Divider />
        <Button sx={{ m: 1 }} startIcon={<FolderOpen />} onClick={() => void shell.openPath(skinsFolder(osuFolder))}>
          {t("sk.openSkinsFolder")}
        </Button>
      </Paper>
      <Divider orientation={"vertical"} />

      <Box sx={{ flex: 1, minWidth: 0, overflowY: "auto", p: 3 }}>
        {!skin ? (
          <Stack alignItems={"center"} justifyContent={"center"} sx={{ height: "100%" }} gap={1}>
            <Typography variant={"h6"}>{t("sk.pickSkin")}</Typography>
            <Typography color={"text.secondary"} sx={{ maxWidth: 520, textAlign: "center" }}>
              {t("sk.intro")}
            </Typography>
          </Stack>
        ) : (
          <Stack gap={2}>
            <Stack direction={"row"} alignItems={"center"} gap={1}>
              <Typography variant={"h5"} sx={{ fontWeight: 800, flex: 1 }} noWrap>
                {skin.name}
              </Typography>
              <Button startIcon={<FolderOpen />} onClick={() => void shell.openPath(skin.folder)}>
                {t("sk.openFolder")}
              </Button>
            </Stack>
            <Typography variant={"body2"} color={"text.secondary"}>
              {t("sk.reloadHint")}
            </Typography>
            {message && (
              <Alert severity={message.ok ? "success" : "error"} onClose={() => setMessage(null)}>
                {message.text}
              </Alert>
            )}
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 1.5 }}>
              {SKIN_GROUPS.map((group) => (
                <GroupCard
                  key={group.id}
                  skin={skin}
                  group={group}
                  onReplace={() => setReplacing(group)}
                  onEdit={() => setEditing(group)}
                  onRestore={() => setRestoring(group)}
                />
              ))}
            </Box>
          </Stack>
        )}
      </Box>

      {skin && replacing && (
        <ReplaceDialog
          osuFolder={osuFolder}
          skins={skins}
          target={skin}
          group={replacing}
          onClose={() => setReplacing(null)}
          onDone={done}
        />
      )}
      {skin && editing && <ColorEditor skin={skin} group={editing} onClose={() => setEditing(null)} onSaved={done} />}
      <ConfirmDialog
        open={restoring !== null}
        title={t("sk.restoreTitle")}
        text={restoring && skin ? t("sk.restoreText", { group: t(GROUP_LABELS[restoring.id]), skin: skin.name }) : ""}
        confirmLabel={t("sk.restore")}
        onClose={() => setRestoring(null)}
        onConfirm={() => restoring && void restore(restoring)}
      />
      <RandomSkinDialog
        open={randomOpen}
        osuFolder={osuFolder}
        skins={skins}
        onClose={() => setRandomOpen(false)}
        onCreated={(name) => {
          setRandomOpen(false);
          void refreshList();
          setSelected(name);
          setMessage({ text: t("sk.randomCreated", { name }), ok: true });
        }}
      />
    </Stack>
  );
}
