import { JSONSchemaType } from "ajv";
import { injectable } from "inversify";
import { PersistentService } from "../core/service";

export interface HudOverlaySettings {
  showUr: boolean;
  showPp: boolean;
  showKeys: boolean;
}

export const DEFAULT_HUD_OVERLAY_SETTINGS: HudOverlaySettings = Object.freeze({
  showUr: false,
  showPp: false,
  showKeys: true,
});

export const HudOverlaySettingsSchema: JSONSchemaType<HudOverlaySettings> = {
  type: "object",
  properties: {
    showUr: { type: "boolean", default: DEFAULT_HUD_OVERLAY_SETTINGS.showUr },
    showPp: { type: "boolean", default: DEFAULT_HUD_OVERLAY_SETTINGS.showPp },
    showKeys: { type: "boolean", default: DEFAULT_HUD_OVERLAY_SETTINGS.showKeys },
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
  setShowPp(showPp: boolean) {
    this.changeSettings((s) => (s.showPp = showPp));
  }
  setShowKeys(showKeys: boolean) {
    this.changeSettings((s) => (s.showKeys = showKeys));
  }
}
