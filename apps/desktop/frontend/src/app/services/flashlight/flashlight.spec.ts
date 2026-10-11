import {
  comboScale,
  currentSkinFromConfig,
  cursorImageGeometry,
  holeRadiusPx,
  setIniGeneralValues,
} from "./flashlight-math";
import { isCursorCentred } from "./flashlight-cursor";

const look = { radius: 0.3, darkness: 1, softness: 0.3 };

describe("flashlight size", () => {
  it("shrinks at 100 and 200 combo only when asked", () => {
    expect(comboScale(150, false)).toBe(1);
    expect(comboScale(99, true)).toBe(1);
    expect(comboScale(100, true)).toBe(0.875);
    expect(comboScale(250, true)).toBe(0.75);
  });

  it("measures the hole as a fraction of the screen height", () => {
    expect(holeRadiusPx(look, 1080)).toBe(324);
    expect(holeRadiusPx(look, 1080, 300, true)).toBe(243);
  });

  it("makes the cursor image big enough to cover the screen from any corner", () => {
    const { size, holeRadius } = cursorImageGeometry(look, 16 / 9);
    const diagonal = 768 * Math.sqrt((16 / 9) ** 2 + 1);
    expect(size / 2).toBeGreaterThanOrEqual(diagonal);
    expect(holeRadius).toBeCloseTo(230.4);
    expect(cursorImageGeometry(look, 21 / 9).size).toBeGreaterThan(size);
  });
});

describe("osu! config and skin.ini", () => {
  it("reads the selected skin from osu!.<user>.cfg", () => {
    expect(currentSkinFromConfig("VolumeMusic = 40\r\nSkin = - YUGEN -   \r\nSkinSamples = 1")).toBe("- YUGEN -");
    expect(currentSkinFromConfig("Skin =\nOther = 1")).toBeNull();
  });

  it("sets cursor options in [General], keeping everything else", () => {
    const ini = "[General]\r\nName: X\r\nCursorExpand: 1\r\n\r\n[Colours]\r\nCombo1: 1,2,3";
    const out = setIniGeneralValues(ini, { CursorExpand: "0", CursorCentre: "1" });
    expect(out).toBe("[General]\r\nName: X\r\nCursorExpand: 0\r\nCursorCentre: 1\r\n\r\n[Colours]\r\nCombo1: 1,2,3");
    expect(setIniGeneralValues(null, { CursorExpand: "0" })).toBe("[General]\r\nCursorExpand: 0");
    expect(setIniGeneralValues("[Colours]\r\nCombo1: 1,2,3", { CursorExpand: "0" })).toBe(
      "[General]\r\nCursorExpand: 0\r\n\r\n[Colours]\r\nCombo1: 1,2,3",
    );
  });

  it("knows when the skin draws the cursor from its top-left corner", () => {
    expect(isCursorCentred("[General]\nCursorCentre: 0")).toBe(false);
    expect(isCursorCentred("[General]\nCursorCentre: 1")).toBe(true);
    expect(isCursorCentred(null)).toBe(true);
  });
});
