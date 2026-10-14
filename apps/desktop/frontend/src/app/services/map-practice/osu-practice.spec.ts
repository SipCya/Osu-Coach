import { createPracticeBeatmap, objectTimeRange } from "./osu-practice";

const MAP = [
  "osu file format v14",
  "",
  "[General]",
  "AudioFilename: audio.mp3",
  "AudioLeadIn: 0",
  "PreviewTime: 5000",
  "",
  "[Metadata]",
  "Title:Song",
  "Artist:Artist",
  "Creator:Me",
  "Version:Hard",
  "BeatmapID:123",
  "Tags:foo",
  "",
  "[Difficulty]",
  "HPDrainRate:5",
  "CircleSize:4",
  "OverallDifficulty:7",
  "ApproachRate:9",
  "SliderMultiplier:1.4",
  "",
  "[Events]",
  '0,0,"bg.jpg",0,0',
  "2,1000,4000",
  "",
  "[TimingPoints]",
  "0,300,4,2,0,100,1,0",
  "10000,-100,4,2,0,80,0,0",
  "",
  "[HitObjects]",
  "256,192,1000,1,0,0:0:0:0:",
  "256,192,5000,1,0,0:0:0:0:",
  "256,192,12000,1,0,0:0:0:0:",
  "256,192,20000,1,0,0:0:0:0:",
].join("\r\n");

function section(raw: string, name: string): string[] {
  const lines = raw.split(/\r?\n/);
  const start = lines.indexOf(`[${name}]`);
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\[.+\]$/.test(lines[i].trim())) break;
    if (lines[i].trim()) out.push(lines[i]);
  }
  return out;
}

describe("objectTimeRange", () => {
  it("finds first and last object times", () => {
    expect(objectTimeRange(MAP)).toEqual({ firstMs: 1000, lastMs: 20000 });
  });
});

describe("createPracticeBeatmap", () => {
  const out = createPracticeBeatmap({
    baseRaw: MAP,
    segments: [{ raw: MAP, startMs: 5000, endMs: 12000 }],
    audioFilename: "practice.mp3",
    version: "Hard practice",
    audioStartMs: 3000,
  });

  it("keeps only the objects inside the range, shifted by the audio start", () => {
    const objects = section(out, "HitObjects");
    expect(objects).toEqual(["256,192,2000,1,0,0:0:0:0:", "256,192,9000,1,0,0:0:0:0:"]);
  });

  it("re-states the active red line at the section start and keeps later points", () => {
    const timing = section(out, "TimingPoints");
    expect(timing[0]).toBe("2000,300,4,2,0,100,1,0");
    expect(timing).toContain("7000,-100,4,2,0,80,0,0");
  });

  it("rewrites the header fields", () => {
    expect(out).toContain("AudioFilename: practice.mp3");
    expect(out).toContain("Version:Hard practice");
    expect(out).toContain("BeatmapID:0");
    expect(out).toContain("PreviewTime: 2000");
    expect(out).toMatch(/Tags:foo osucoach/);
  });

  it("keeps the background and shifts the break times", () => {
    const events = section(out, "Events");
    expect(events).toContain('0,0,"bg.jpg",0,0');
    expect(events).toContain("2,0,1000");
  });
});

describe("createPracticeBeatmap merging two sections", () => {
  it("chains objects from both ranges in time order", () => {
    const out = createPracticeBeatmap({
      baseRaw: MAP,
      segments: [
        { raw: MAP, startMs: 1000, endMs: 5000 },
        { raw: MAP, startMs: 12000, endMs: 20000 },
      ],
      audioFilename: "practice.mp3",
      version: "mix",
      audioStartMs: 0,
    });
    const objects = section(out, "HitObjects");
    expect(objects).toEqual([
      "256,192,1000,1,0,0:0:0:0:",
      "256,192,5000,1,0,0:0:0:0:",
      "256,192,12000,1,0,0:0:0:0:",
      "256,192,20000,1,0,0:0:0:0:",
    ]);
  });
});
