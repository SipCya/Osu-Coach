import { injectable } from "inversify";
import { BehaviorSubject } from "rxjs";
import { Texture } from "pixi.js";
import { PersistentService } from "../core/service";
import { JSONSchemaType } from "ajv";

export interface BeatmapBackgroundSettings {
  enabled: boolean;
  blur: number;
  dim: number;
}

export const DEFAULT_BEATMAP_BACKGROUND_SETTINGS: BeatmapBackgroundSettings = Object.freeze({
  dim: 0.8,
  blur: 0.4,
  enabled: true,
});
export const BeatmapBackgroundSettingsSchema: JSONSchemaType<BeatmapBackgroundSettings> = {
  type: "object",
  properties: {
    dim: { type: "number", default: DEFAULT_BEATMAP_BACKGROUND_SETTINGS.dim },
    blur: { type: "number", default: DEFAULT_BEATMAP_BACKGROUND_SETTINGS.blur },
    enabled: { type: "boolean", default: DEFAULT_BEATMAP_BACKGROUND_SETTINGS.enabled },
  },
  required: [],
};

@injectable()
export class BeatmapBackgroundSettingsStore extends PersistentService<BeatmapBackgroundSettings> {
  key = "beatmap-background";
  schema = BeatmapBackgroundSettingsSchema;

  texture$ = new BehaviorSubject<Texture>(Texture.EMPTY);

  getDefaultValue(): BeatmapBackgroundSettings {
    return DEFAULT_BEATMAP_BACKGROUND_SETTINGS;
  }

  get texture() {
    return this.texture$.getValue();
  }

  setBlur(blur: number) {
    this.settings$.next({ ...this.settings, blur });
  }

  setDim(dim: number) {
    this.settings$.next({ ...this.settings, dim });
  }

  setEnabled(enabled: boolean) {
    this.settings$.next({ ...this.settings, enabled });
  }
}
