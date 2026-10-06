import { ControlPointInfo } from "../beatmap/ControlPoints/ControlPointInfo";
import { HitObjectSettings } from "./HitObjectSettings";
import { BeatmapDifficulty } from "../beatmap/BeatmapDifficulty";

export interface Blueprint {
  blueprintInfo: BlueprintInfo;
  defaultDifficulty: BeatmapDifficulty;
  controlPointInfo: ControlPointInfo;
  hitObjectSettings: HitObjectSettings[];
}

export interface BlueprintInfo {
  beatmapVersion: number;
  onlineBeatmapId?: number;
  metadata: BlueprintMetadata;
  audioLeadIn: number;
  stackLeniency: number;
}

export interface BlueprintMetadata {
  artist: string;
  title: string;
  titleUnicode: string;
  artistUnicode: string;
  source: string;
  tags: string;
  previewTime: number;
  audioFile: string;
  backgroundFile: string;
  backgroundOffset: { x: number; y: number };
}
