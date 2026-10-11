import { parseHitsoundData, pointAt, samplesForHit, samplesForTick } from "./hitsound-data";
import { buildHitsoundEvents, HitObjectLike } from "./hitsound-events";

const osu = [
  "osu file format v14",
  "",
  "[General]",
  "AudioFilename: audio.mp3",
  "SampleSet: Soft",
  "",
  "[TimingPoints]",
  "0,500,4,0,0,60,1,0",
  "2000,-100,4,3,2,40,0,0",
  "",
  "[HitObjects]",
  "100,100,1000,1,10,0:0:0:0:",
  "200,200,1500,1,0,1:2:0:80:",
  "300,300,2000,2,0,B|400:300,2,100,2|0|4,1:0|0:0|0:3,0:0:0:0:",
  "400,100,3000,128,0,3500:0:0:0:0:",
  "256,192,4000,12,4,5000,0:0:0:0:",
  "256,192,6000,1,0,0:0:0:0:clap.wav",
].join("\r\n");

const data = parseHitsoundData(osu);

describe("hitsound data", () => {
  it("reads sample points, objects and skips unsupported ones like osu!", () => {
    expect(data.defaultSet).toBe("soft");
    expect(data.points).toEqual([
      { time: 0, sampleSet: 0, index: 0, volume: 60 },
      { time: 2000, sampleSet: 3, index: 2, volume: 40 },
    ]);
    expect(data.objects.map((o) => o.kind)).toEqual(["circle", "circle", "slider", "spinner", "circle"]);
    expect(data.objects[2].edgeSounds).toEqual([2, 0, 4]);
    expect(data.objects[2].edgeSets).toEqual([
      [1, 0],
      [0, 0],
      [0, 3],
    ]);
    expect(pointAt(data.points, 1997).time).toBe(2000);
  });

  it("plays hitnormal plus additions from the default skin when the index is 0", () => {
    expect(samplesForHit(data, 0, 0, 1000)).toEqual([
      { beatmapFile: null, skinFile: "soft-hitnormal", volume: 0.6 },
      { beatmapFile: null, skinFile: "soft-hitwhistle", volume: 0.6 },
      { beatmapFile: null, skinFile: "soft-hitclap", volume: 0.6 },
    ]);
  });

  it("uses the object's own sets and volume", () => {
    expect(samplesForHit(data, 1, 0, 1500)).toEqual([{ beatmapFile: null, skinFile: "normal-hitnormal", volume: 0.8 }]);
  });

  it("uses beatmap samples with the custom index of the timing point and per-edge sets on sliders", () => {
    expect(samplesForHit(data, 2, 0, 2000)).toEqual([
      { beatmapFile: "normal-hitnormal2", skinFile: "normal-hitnormal", volume: 0.4 },
      { beatmapFile: "normal-hitwhistle2", skinFile: "normal-hitwhistle", volume: 0.4 },
    ]);
    expect(samplesForHit(data, 2, 2, 2400)).toEqual([
      { beatmapFile: "drum-hitnormal2", skinFile: "drum-hitnormal", volume: 0.4 },
      { beatmapFile: "drum-hitfinish2", skinFile: "drum-hitfinish", volume: 0.4 },
    ]);
    expect(samplesForTick(data, 2, 2100)).toEqual([
      { beatmapFile: "drum-slidertick2", skinFile: "drum-slidertick", volume: 0.4 },
    ]);
  });

  it("plays only the custom file when the object names one", () => {
    expect(samplesForHit(data, 4, 0, 6000)).toEqual([{ beatmapFile: "clap.wav", skinFile: null, volume: 0.4 }]);
  });
});

describe("hitsound events", () => {
  const objects: HitObjectLike[] = [
    { type: "HIT_CIRCLE", id: "0", hitTime: 1000 },
    { type: "HIT_CIRCLE", id: "1", hitTime: 1500 },
    {
      type: "SLIDER",
      head: { id: "2/HEAD", hitTime: 2000 },
      checkPoints: [
        { id: "2/0", type: "TICK", hitTime: 2100 },
        { id: "2/1", type: "REPEAT", hitTime: 2200 },
        { id: "2/2", type: "LAST_LEGACY_TICK", hitTime: 2364 },
      ],
      repeatCount: 1,
      endTime: 2400,
    },
    { type: "SPINNER" },
  ];

  it("plays sounds only for what the player actually hit, at the time it was hit", () => {
    const events = buildHitsoundEvents(
      objects,
      {
        hitCircleVerdict: {
          "0": { type: "GREAT", judgementTime: 1012 },
          "1": { type: "MISS", judgementTime: 1600 },
          "2/HEAD": { type: "OK", judgementTime: 1990 },
        },
        checkPointVerdict: { "2/0": { hit: true }, "2/1": { hit: false }, "2/2": { hit: true } },
      },
      data,
    );
    expect(events.map((e) => e.time)).toEqual([1012, 1990, 2100, 2400]);
    expect(events[2].samples[0].skinFile).toBe("drum-slidertick");
    expect(events[3].samples.map((s) => s.skinFile)).toEqual(["drum-hitnormal", "drum-hitfinish"]);
  });
});
