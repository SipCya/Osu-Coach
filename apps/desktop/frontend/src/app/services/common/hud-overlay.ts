import { JSONSchemaType } from "ajv";
import { injectable } from "inversify";
import { PersistentService } from "../core/service";

export interface HudOverlaySettings {
  showUr: boolean;
  showKeys: boolean;
  showMods: boolean;
}

export const DEFAULT_HUD_OVERLAY_SETTINGS: HudOverlaySettings = Object.freeze({
  showUr: false,
  showKeys: true,
  showMods: false,
});

export const HudOverlaySettingsSchema: JSONSchemaType<HudOverlaySettings> = {
  type: "object",
  properties: {
    showUr: { type: "boolean", default: DEFAULT_HUD_OVERLAY_SETTINGS.showUr },
    showKeys: { type: "boolean", default: DEFAULT_HUD_OVERLAY_SETTINGS.showKeys },
    showMods: { type: "boolean", default: DEFAULT_HUD_OVERLAY_SETTINGS.showMods },
  },
  required: [],
};

@injectable()
export class HudOverlaySettingsStore extends PersistentService<HudOverlaySettings> {
  key = "hud-overlay";
  schema = HudOverlaySettingsSchema;

  getDefaultValue(): HudOverlaySettings {
    return DEFAULT_HUD_OVERLAY_SETTINGS;
  }

  setShowUr(showUr: boolean) {
    this.changeSettings((s) => (s.showUr = showUr));
  }
  setShowKeys(showKeys: boolean) {
    this.changeSettings((s) => (s.showKeys = showKeys));
  }
  setShowMods(showMods: boolean) {
    this.changeSettings((s) => (s.showMods = showMods));
  }
}
