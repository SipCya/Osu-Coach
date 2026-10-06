import {
  analyzeSet,
  BeatmapRefs,
  BLACK_PIXEL_PNG,
  parseOsuFile,
  parseStoryboardFile,
  readReplayHeader,
} from "./cleaner-rules";

const osu = (mode: number, extraEvents = "") => `osu file format v14

[General]
AudioFilename: audio.mp3
Mode: ${mode}

[Events]
//Background and Video events
0,0,"BG.jpg",0,0
Video,0,"intro.mp4"
${extraEvents}
//Break Periods

[HitObjects]
256,192,1000,1,0,0:0:0:0:
`;

describe("map cleaner: parsing", () => {
  it("reads mode, audio, background, video and storyboard from a .osu", () => {
    const refs = parseOsuFile(osu(3, 'Sprite,Foreground,Centre,"SB\\star.png",320,240\n _F,0,0,100,1'));
    expect(refs).toEqual({
      mode: 3,
      audio: "audio.mp3",
      background: "bg.jpg",
      video: "intro.mp4",
      storyboard: ["sb/star.png"],
    });
  });

  it("defaults to osu!standard when Mode is missing (old maps)", () => {
    expect(parseOsuFile("[General]\nAudioFilename: a.mp3\n").mode).toBe(0);
  });

  it("expands animations into their frames and reads samples from a .osb", () => {
    const osb = `[Events]
Animation,Background,Centre,"sb/fire.png",320,240,3,100,LoopForever
 F,0,0,1000,1
Sample,500,0,"sb/boom.wav",80`;
    expect(parseStoryboardFile(osb)).toEqual(["sb/fire0.png", "sb/fire1.png", "sb/fire2.png", "sb/boom.wav"]);
  });
});

describe("map cleaner: classification", () => {
  const analyze = (files: string[], beatmaps: Record<string, BeatmapRefs>, storyboard: string[] = []) =>
    analyzeSet({ files, beatmaps: new Map(Object.entries(beatmaps)), storyboard });

  it("puts every file in the right category and never touches the song audio", () => {
    const { removable } = analyze(
      [
        "Hard.osu",
        "Mania.osu",
        "audio.mp3",
        "bg.jpg",
        "intro.mp4",
        "sb/star.png",
        "normal-hitclap.wav",
        "hitcircle@2x.png",
        "Thumbs.db",
        "notes.zip",
        "map.osb",
        "readme.txt",
      ],
      {
        "Hard.osu": { mode: 0, audio: "audio.mp3", background: "bg.jpg", video: "intro.mp4", storyboard: [] },
        "Mania.osu": { mode: 3, audio: "audio.mp3", storyboard: [] },
      },
      ["sb/star.png"],
    );
    expect(Object.fromEntries(removable)).toEqual({
      "Hard.osu": "modeStd",
      "Mania.osu": "modeMania",
      "bg.jpg": "backgrounds",
      "intro.mp4": "videos",
      "sb/star.png": "storyboard",
      "normal-hitclap.wav": "hitsounds",
      "hitcircle@2x.png": "skin",
      "Thumbs.db": "junk",
      "notes.zip": "uncommon",
    });
  });

  it("keeps a background out of the storyboard even if the storyboard uses it", () => {
    const { removable } = analyze(["bg.jpg"], { "a.osu": { mode: 0, background: "bg.jpg", storyboard: [] } }, [
      "bg.jpg",
    ]);
    expect(removable.get("bg.jpg")).toBe("backgrounds");
  });

  it("never proposes a skin-like file that is actually the song audio", () => {
    const { removable } = analyze(["soft-hitnormal.mp3"], {
      "a.osu": { mode: 0, audio: "soft-hitnormal.mp3", storyboard: [] },
    });
    expect(removable.size).toBe(0);
  });

  it("finds backgrounds referenced by a .osu that do not exist (case-insensitive like Windows)", () => {
    const { missingBackgrounds } = analyze(["BG.JPG"], {
      "a.osu": { mode: 0, background: "bg.jpg", storyboard: [] },
      "b.osu": { mode: 0, background: "other.png", storyboard: [] },
    });
    expect(missingBackgrounds).toEqual(["other.png"]);
  });
});

describe("map cleaner: replays and black pixel", () => {
  it("reads player and replay hash from a .osr header", () => {
    const str = (s: string) => {
      const bytes = Buffer.from(s, "utf8");
      return Buffer.concat([Buffer.from([0x0b, bytes.length]), bytes]);
    };
    const header = Buffer.concat([
      Buffer.from([0, 1, 2, 3, 4]),
      str("0123456789abcdef0123456789abcdef"),
      str("Cookiezi"),
      str("fedcba9876543210fedcba9876543210"),
    ]);
    expect(readReplayHeader(header)).toEqual({ player: "Cookiezi", replayMD5: "fedcba9876543210fedcba9876543210" });
    expect(readReplayHeader(Buffer.from([0, 1]))).toBeNull();
  });

  it("embeds a valid PNG", () => {
    expect(BLACK_PIXEL_PNG.subarray(1, 4).toString()).toBe("PNG");
  });
});
