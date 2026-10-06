import Ajv from "ajv";
import { SkinSettings, SkinSettingsSchema } from "../src/app/services/common/skin";

describe("validateSkinSettings", () => {
  const ajv = new Ajv({ useDefaults: true });
  const validateSkinSettings = ajv.compile<SkinSettings>(SkinSettingsSchema);

  it("normal behavior", () => {
    const data = {
      preferredSkinId: "#-------#--------------#---------- wow so many dashes v2 final final - copy",
    };
    expect(validateSkinSettings(data)).toBe(true);
  });
  it("default behavior when missing", () => {
    const data = {};
    expect(validateSkinSettings(data)).toBe(true);
    expect(data).toEqual({
      preferredSkinId: "builtin:YUGEN",
    });
  });
  it("default behavior when wrong data type", () => {
    const data = {
      preferredSkinId: 42,
    };
    expect(validateSkinSettings(data)).toBe(false);
  });
  it("type safe", () => {
    const data = {
      preferredSkinId: "x",
    };
    if (validateSkinSettings(data)) {
      expect(data.preferredSkinId).toEqual("x");
    }
  });
});
