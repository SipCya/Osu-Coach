import { JSONSchemaType } from "ajv";
import { injectable } from "inversify";
import { PersistentService } from "../core/service";

export interface HitsoundSettings {
  /** When true, a beatmap's custom hitsounds take priority (osu! default). When false, the chosen skin is used. */
  useBeatmapHitsounds: boolean;
}

export const DEFAULT_HITSOUND_SETTINGS: HitsoundSettings = Object.freeze({
  useBeatmapHitsounds: false,
});

export const HitsoundSettingsSchema: JSONSchemaType<HitsoundSettings> = {
  type: "object",
  properties: {
    useBeatmapHitsounds: { type: "boolean", default: DEFAULT_HITSOUND_SETTINGS.useBeatmapHitsounds },
  },
  required: [],
};

@injectable()
export class HitsoundSettingsStore extends PersistentService<HitsoundSettings> {
  key = "hitsound";
  schema = HitsoundSettingsSchema;

  getDefaultValue(): HitsoundSettings {
    return DEFAULT_HITSOUND_SETTINGS;
  }

  setUseBeatmapHitsounds(useBeatmapHitsounds: boolean) {
    this.changeSettings((s) => (s.useBeatmapHitsounds = useBeatmapHitsounds));
  }
}
