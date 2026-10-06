import {
  classifySkinFiles,
  decodeSkinIni,
  DEFAULT_FONTS,
  mixedSkinIni,
  parseSkinFonts,
  previewFile,
  randomAssignment,
  SKIN_GROUPS,
  targetPath,
  twinOf,
} from "./skin-elements";
import { adjustPixels, NO_ADJUST } from "./image-colors";

const byGroup = (files: string[], fonts = DEFAULT_FONTS) =>
  Object.fromEntries(
    [...classifySkinFiles(files, fonts).entries()]
      .filter(([, f]) => f.length > 0)
      .map(([g, f]) => [g, f.map((x) => x.path)]),
  );

describe("skin elements", () => {
  it("groups files by element, including @2x and animation frames", () => {
    expect(
      byGroup([
        "cursor.png",
        "cursor@2x.png",
        "cursortrail.png",
        "hitcircle.png",
        "hitcircleoverlay@2x.png",
        "default-3.png",
        "hit300-0@2x.png",
        "hit0.png",
        "sliderb0.png",
        "followpoint-2.png",
        "spinner-circle.png",
        "score-x.png",
        "soft-hitclap.wav",
        "combobreak.ogg",
        "skin.ini",
        "menu-background.jpg",
      ]),
    ).toEqual({
      cursor: ["cursor.png", "cursor@2x.png", "cursortrail.png"],
      hitcircle: ["hitcircle.png", "hitcircleoverlay@2x.png"],
      numbers: ["default-3.png"],
      judgements: ["hit300-0@2x.png", "hit0.png"],
      slider: ["sliderb0.png"],
      followpoint: ["followpoint-2.png"],
      spinner: ["spinner-circle.png"],
      scoreNumbers: ["score-x.png"],
      hitsounds: ["soft-hitclap.wav"],
      uiSounds: ["combobreak.ogg"],
    });
  });

  it("finds numbers in a subfolder set by skin.ini and writes them with the target prefix", () => {
    const fonts = parseSkinFonts(
      "[General]\nName: x\n[Fonts]\nHitCirclePrefix: fonts\\num\nScorePrefix: fonts/score\n",
    );
    expect(fonts).toEqual({ hitCirclePrefix: "fonts/num", scorePrefix: "fonts/score" });
    const groups = classifySkinFiles(["fonts/num-1@2x.png", "fonts/score-5.png", "fonts/other.png"], fonts);
    expect(groups.get("numbers")).toEqual([{ path: "fonts/num-1@2x.png", canonical: "default-1@2x.png" }]);
    expect(groups.get("scoreNumbers")).toEqual([{ path: "fonts/score-5.png", canonical: "score-5.png" }]);
    expect(targetPath("default-1@2x.png", fonts)).toBe("fonts/num-1@2x.png");
    expect(targetPath("default-1@2x.png", DEFAULT_FONTS)).toBe("default-1@2x.png");
    expect(targetPath("cursor.png", fonts)).toBe("cursor.png");
  });

  it("prefers the @2x file for previews and finds twins", () => {
    const cursor = SKIN_GROUPS.find((g) => g.id === "cursor")!;
    const files = classifySkinFiles(["cursortrail.png", "cursor.png", "cursor@2x.png"], DEFAULT_FONTS).get("cursor")!;
    expect(previewFile(cursor, files)?.path).toBe("cursor@2x.png");
    expect(twinOf("cursor@2x.png")).toBe("cursor.png");
    expect(twinOf("cursor.png")).toBe("cursor@2x.png");
  });

  it("builds a random mix only from skins that have each group", () => {
    const availability = new Map([
      ["A", new Set(["cursor", "hitcircle"] as const)],
      ["B", new Set(["cursor"] as const)],
    ]);
    const mix = randomAssignment(availability as any, ["A", "B"], () => 0.99);
    expect(mix.cursor).toBe("B");
    expect(mix.hitcircle).toBe("A");
    expect(mix.spinner).toBeUndefined();
    const again = randomAssignment(availability as any, ["A", "B"], () => 0, ["cursor"], mix);
    expect(again).toEqual({ cursor: "A", hitcircle: "A" });
  });

  it("writes the mixed skin.ini with the new name and without number prefixes", () => {
    const ini = mixedSkinIni(
      "[General]\nName: Old\nAuthor: me\n\n[Colours]\nCombo1: 255,0,0\n[Fonts]\nHitCirclePrefix: fonts/num\nHitCircleOverlap: 3\n",
      "Mix",
    );
    expect(ini).toContain("Name: Mix");
    expect(ini).not.toContain("Name: Old");
    expect(ini).toContain("Combo1: 255,0,0");
    expect(ini).not.toContain("HitCirclePrefix");
    expect(ini).toContain("HitCircleOverlap: 3");
    expect(mixedSkinIni(null, "Mix")).toContain("Name: Mix");
  });
});

describe("image colors", () => {
  const white = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]);

  it("tints white to the chosen color and keeps transparency", () => {
    const out = adjustPixels(white, { ...NO_ADJUST, tint: "#ff66aa" });
    expect([...out.slice(0, 4)]).toEqual([255, 102, 170, 255]);
    expect([...out.slice(4)]).toEqual([0, 0, 0, 0]);
  });

  it("rotates hue and removes saturation", () => {
    const red = new Uint8ClampedArray([255, 0, 0, 255]);
    expect([...adjustPixels(red, { ...NO_ADJUST, hue: 120 })]).toEqual([0, 255, 0, 255]);
    const gray = adjustPixels(red, { ...NO_ADJUST, saturation: 0 });
    expect(gray[0]).toBe(gray[1]);
    expect(gray[1]).toBe(gray[2]);
  });

  it("does not change the source pixels", () => {
    adjustPixels(white, { ...NO_ADJUST, brightness: -0.5 });
    expect(white[0]).toBe(255);
  });
});

describe("skin.ini encodings", () => {
  const text = ["[Fonts]", "HitCirclePrefix: assets/default/default", ""].join(String.fromCharCode(13, 10));
  it.each([
    ["utf-8", Buffer.from(text, "utf-8")],
    ["utf-8 with BOM", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf-8")])],
    ["utf-16 LE", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")])],
    ["utf-16 BE", Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, "utf16le").swap16()])],
  ])("reads %s", (_, data) => {
    expect(parseSkinFonts(decodeSkinIni(data)).hitCirclePrefix).toBe("assets/default/default");
  });
});
