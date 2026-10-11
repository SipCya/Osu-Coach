export type Bank = "normal" | "soft" | "drum";

export interface SamplePoint {
  time: number;
  sampleSet: number;
  index: number;
  volume: number;
}

export interface ObjectSound {
  kind: "circle" | "slider" | "spinner";
  time: number;
  hitSound: number;
  normalSet: number;
  additionSet: number;
  index: number;
  volume: number;
  filename: string;
  edgeSounds: number[];
  edgeSets: [number, number][];
}

export interface HitsoundData {
  defaultSet: Bank;
  points: SamplePoint[];
  objects: ObjectSound[];
}

export interface SampleRequest {
  beatmapFile: string | null;
  skinFile: string | null;
  volume: number;
}

const BANKS: Record<number, Bank> = { 1: "normal", 2: "soft", 3: "drum" };
const ADDITIONS: [number, string][] = [
  [2, "hitwhistle"],
  [4, "hitfinish"],
  [8, "hitclap"],
];
const POINT_LENIENCY_MS = 5;

function sections(text: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let current = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      current = header[1];
      out.set(current, []);
    } else if (line && !line.startsWith("//")) {
      out.get(current)?.push(line);
    }
  }
  return out;
}

const int = (value: string | undefined, fallback = 0) => {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
};

function parseHitSample(field: string | undefined) {
  const parts = (field ?? "").split(":");
  return {
    normalSet: int(parts[0]),
    additionSet: int(parts[1]),
    index: int(parts[2]),
    volume: int(parts[3]),
    filename: (parts[4] ?? "").trim(),
  };
}

export function parseHitsoundData(text: string): HitsoundData {
  const s = sections(text);
  let defaultSet: Bank = "normal";
  for (const line of s.get("General") ?? []) {
    const m = /^SampleSet\s*:\s*(\w+)/i.exec(line);
    if (m) defaultSet = (["normal", "soft", "drum"].find((b) => b === m[1].toLowerCase()) as Bank) ?? "normal";
  }

  const points: SamplePoint[] = [];
  for (const line of s.get("TimingPoints") ?? []) {
    const p = line.split(",");
    if (p.length < 2) continue;
    const time = parseFloat(p[0]);
    if (!Number.isFinite(time)) continue;
    points.push({ time, sampleSet: int(p[3]), index: int(p[4]), volume: p.length > 5 ? int(p[5], 100) : 100 });
  }
  points.sort((a, b) => a.time - b.time);

  const objects: ObjectSound[] = [];
  for (const line of s.get("HitObjects") ?? []) {
    const p = line.split(",");
    if (p.length < 5) continue;
    const time = parseFloat(p[2]);
    const type = int(p[3]);
    const hitSound = int(p[4]);
    let kind: ObjectSound["kind"] | null = null;
    if (type & 1) kind = "circle";
    else if (type & 2) kind = "slider";
    else if (type & 8) kind = "spinner";
    if (!kind || !Number.isFinite(time)) continue;
    if (kind === "slider" && int(p[6]) > 9000) continue;

    let sampleField: string | undefined;
    let edgeSounds: number[] = [];
    let edgeSets: [number, number][] = [];
    if (kind === "circle") sampleField = p[5];
    if (kind === "spinner") sampleField = p[6];
    if (kind === "slider") {
      edgeSounds = p[8] ? p[8].split("|").map((v) => int(v)) : [];
      edgeSets = p[9]
        ? p[9].split("|").map((v) => {
            const [n, a] = v.split(":");
            return [int(n), int(a)] as [number, number];
          })
        : [];
      sampleField = p[10];
    }
    objects.push({ kind, time, hitSound, edgeSounds, edgeSets, ...parseHitSample(sampleField) });
  }
  return { defaultSet, points, objects };
}

export function pointAt(points: SamplePoint[], time: number): SamplePoint {
  let found: SamplePoint | undefined;
  for (const point of points) {
    if (point.time <= time + POINT_LENIENCY_MS) found = point;
    else break;
  }
  return found ?? points[0] ?? { time: 0, sampleSet: 0, index: 0, volume: 100 };
}

function bankOf(set: number, fallback: Bank): Bank {
  return BANKS[set] ?? fallback;
}

function request(bank: Bank, name: string, index: number, volume: number): SampleRequest {
  return {
    beatmapFile: index >= 1 ? `${bank}-${name}${index > 1 ? index : ""}` : null,
    skinFile: `${bank}-${name}`,
    volume: volume / 100,
  };
}

function hitSamples(
  hitSound: number,
  normalSet: number,
  additionSet: number,
  index: number,
  volume: number,
  point: SamplePoint,
  defaultSet: Bank,
): SampleRequest[] {
  const pointBank = bankOf(point.sampleSet, defaultSet);
  const normal = bankOf(normalSet, pointBank);
  const addition = bankOf(additionSet, normal);
  const finalIndex = index || point.index;
  const finalVolume = volume || point.volume;
  const samples = [request(normal, "hitnormal", finalIndex, finalVolume)];
  for (const [flag, name] of ADDITIONS) {
    if (hitSound & flag) samples.push(request(addition, name, finalIndex, finalVolume));
  }
  return samples;
}

export function samplesForHit(data: HitsoundData, objectIndex: number, node: number, time: number): SampleRequest[] {
  const object = data.objects[objectIndex];
  if (!object) return [];
  const point = pointAt(data.points, time);
  if (object.filename && node === 0) {
    return [{ beatmapFile: object.filename, skinFile: null, volume: (object.volume || point.volume) / 100 }];
  }
  if (object.kind === "slider") {
    const sound = object.edgeSounds[node] ?? object.hitSound;
    const [normalSet, additionSet] = object.edgeSets[node] ?? [object.normalSet, object.additionSet];
    return hitSamples(sound, normalSet, additionSet, object.index, object.volume, point, data.defaultSet);
  }
  return hitSamples(
    object.hitSound,
    object.normalSet,
    object.additionSet,
    object.index,
    object.volume,
    point,
    data.defaultSet,
  );
}

export function samplesForTick(data: HitsoundData, objectIndex: number, time: number): SampleRequest[] {
  const object = data.objects[objectIndex];
  if (!object) return [];
  const point = pointAt(data.points, time);
  const bank = bankOf(object.normalSet, bankOf(point.sampleSet, data.defaultSet));
  return [request(bank, "slidertick", point.index, point.volume)];
}
