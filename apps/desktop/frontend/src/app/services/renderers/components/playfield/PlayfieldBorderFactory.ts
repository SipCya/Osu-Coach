import { injectable } from "inversify";
import { PlayfieldBorder } from "@osucoach/osu-pixi/classic-components";
import { PlayfieldBorderSettingsStore } from "../../../common/playfield-border";

@injectable()
export class PlayfieldBorderFactory {
  constructor(private settingsStore: PlayfieldBorderSettingsStore) {}

  createPlayfieldBorder() {
    const playfieldBorder = new PlayfieldBorder();
    this.settingsStore.settings$.subscribe((s) => playfieldBorder.onSettingsChange(s));
    return playfieldBorder;
  }
}
