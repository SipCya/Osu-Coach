import {
  applyProfileDifficulty,
  bpmRange,
  createProfile,
  deleteProfile,
  findProfile,
  parseProfiles,
  rateForBpm,
  sameProfile,
  upsertProfile,
} from "./profiles";
import { rateAudioFileName } from "./osu-rate";

const original = { ar: 8, cs: 4, od: 7, hp: 5 };

describe("speed changer: target BPM", () => {
  it("computes the exact rate for a target BPM", () => {
    expect(rateForBpm(240, 180)).toBeCloseTo(4 / 3, 10);
    expect(rateForBpm(270, 180)).toBe(1.5);
  });

  it("rejects BPM outside the supported speed range", () => {
    expect(rateForBpm(500, 180)).toBeNull();
    expect(rateForBpm(60, 180)).toBeNull();
    expect(rateForBpm(Number.NaN, 180)).toBeNull();
    expect(bpmRange(180)).toEqual({ min: 90, max: 360 });
  });

  it("names the audio precisely enough that close speeds never share a file", () => {
    expect(rateAudioFileName("audio.mp3", 4 / 3, false)).not.toBe(rateAudioFileName("audio.mp3", 1.334, false));
    expect(rateAudioFileName("audio.mp3", 1.5, true)).toBe("audio_1.5x_nc.mp3");
  });
});

describe("speed changer: profiles", () => {
  it("saves only the difficulty values that were changed", () => {
    const profile = createProfile(" DT farm ", { mode: "rate", rate: 1.5 }, false, { ...original, ar: 9.5 }, original);
    expect(profile).toEqual({
      name: "DT farm",
      speed: { mode: "rate", rate: 1.5 },
      changePitch: false,
      difficulty: { ar: 9.5 },
    });
  });

  it("applies a profile to another map keeping that map's other values", () => {
    const profile = createProfile("x", { mode: "bpm", bpm: 260 }, true, { ...original, ar: 9.5 }, original);
    expect(applyProfileDifficulty(profile, { ar: 6, cs: 3, od: 5, hp: 4 })).toEqual({ ar: 9.5, cs: 3, od: 5, hp: 4 });
  });

  it("replaces a profile with the same name and deletes by name, ignoring case", () => {
    const a = createProfile("Fast", { mode: "rate", rate: 1.3 }, false, original, original);
    const b = createProfile("fast", { mode: "rate", rate: 1.4 }, false, original, original);
    const list = upsertProfile(upsertProfile([], a), b);
    expect(list).toHaveLength(1);
    expect(findProfile(list, "FAST")?.speed).toEqual({ mode: "rate", rate: 1.4 });
    expect(deleteProfile(list, "fAsT")).toEqual([]);
  });

  it("recognizes when the current settings match a profile", () => {
    const a = createProfile("a", { mode: "bpm", bpm: 260 }, false, { ...original, od: 9 }, original);
    const b = createProfile("b", { mode: "bpm", bpm: 260 }, false, { ...original, od: 9 }, original);
    const c = createProfile("c", { mode: "bpm", bpm: 260 }, false, original, original);
    expect(sameProfile(a, b)).toBe(true);
    expect(sameProfile(a, c)).toBe(false);
  });

  it("reads saved profiles defensively", () => {
    const saved = JSON.stringify([
      { name: "ok", speed: { mode: "bpm", bpm: 200 }, changePitch: true, difficulty: { ar: 12, cs: "x" } },
      { name: "", speed: { mode: "rate", rate: 1.2 } },
      { name: "bad speed", speed: { mode: "rate" } },
      "garbage",
    ]);
    expect(parseProfiles(saved)).toEqual([
      { name: "ok", speed: { mode: "bpm", bpm: 200 }, changePitch: true, difficulty: { ar: 10 } },
    ]);
    expect(parseProfiles("not json")).toEqual([]);
    expect(parseProfiles(null)).toEqual([]);
  });
});
