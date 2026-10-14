import * as PIXI from "pixi.js";
import { Container } from "pixi.js";
import { injectable } from "inversify";
import { Playfield, PlayfieldFactory } from "../playfield/PlayfieldFactory";
import { OSU_PLAYFIELD_HEIGHT, OSU_PLAYFIELD_WIDTH } from "@osujs/core";
import { ForegroundHUDPreparer } from "../hud/ForegroundHUDPreparer";
import { PixiRendererManager } from "../../PixiRendererManager";
import { BeatmapBackgroundFactory } from "../background/BeatmapBackground";
import { STAGE_HEIGHT, STAGE_WIDTH } from "../../constants";
import { KeyPressWithNoteSheetPreparer } from "../keypresses/KeyPressOverlay";
import { HudOverlaySettingsStore } from "../../../common/hud-overlay";

const ratio = STAGE_WIDTH / STAGE_HEIGHT;
const showNoteKeyOverlay = true;

@injectable()
export class AnalysisStage {
  private screenWidth = 0;
  private screenHeight = 0;

  public stage: Container;
  private playfield: Playfield;

  constructor(
    private rendererManager: PixiRendererManager,
    private beatmapBackground: BeatmapBackgroundFactory,
    private playfieldFactory: PlayfieldFactory,
    private foregroundHUDPreparer: ForegroundHUDPreparer,
    private keyPressOverlayPreparer: KeyPressWithNoteSheetPreparer,
    private hudOverlaySettingsStore: HudOverlaySettingsStore,
  ) {
    const width = STAGE_WIDTH;
    const height = STAGE_HEIGHT;
    const background = beatmapBackground.createBeatmapBackground({ width, height });
    this.playfield = playfieldFactory.createPlayfield();

    this.stage = new PIXI.Container();
    this.stage.addChild(
      background.sprite,
      this.playfield.container,
      this.foregroundHUDPreparer.container,
      this.keyPressOverlayPreparer.container,
    );

    this.playfield.container.interactiveChildren = false;

    let playfieldScaling;
    const overlayHeight = 0.1;

    if (showNoteKeyOverlay) {
      playfieldScaling = (STAGE_HEIGHT * 0.7) / OSU_PLAYFIELD_HEIGHT;
      this.playfield.container.position.set(
        (STAGE_WIDTH - OSU_PLAYFIELD_WIDTH * playfieldScaling) / 2,
        (STAGE_HEIGHT - OSU_PLAYFIELD_HEIGHT * playfieldScaling) / 2 + OSU_PLAYFIELD_HEIGHT * overlayHeight,
      );
    } else {
      playfieldScaling = (STAGE_HEIGHT * 0.8) / OSU_PLAYFIELD_HEIGHT;
      this.playfield.container.position.set(
        (STAGE_WIDTH - OSU_PLAYFIELD_WIDTH * playfieldScaling) / 2,
        (STAGE_HEIGHT - OSU_PLAYFIELD_HEIGHT * playfieldScaling) / 2,
      );
    }

    this.keyPressOverlayPreparer.container.position.set((STAGE_WIDTH - OSU_PLAYFIELD_WIDTH * playfieldScaling) / 2, 15);
    this.keyPressOverlayPreparer.container.visible = showNoteKeyOverlay;

    this.playfield.container.scale.set(playfieldScaling);
  }

  resizeTo() {
    const screen = this.rendererManager.getRenderer()?.screen;
    if (!screen) return;
    if (this.screenWidth === screen.width && this.screenHeight === screen.height) return;
    [this.screenWidth, this.screenHeight] = [screen.width, screen.height];

    let widthInPx, heightInPx;
    if (screen.width < screen.height * ratio) {
      widthInPx = screen.width;
      heightInPx = screen.width / ratio;
    } else {
      widthInPx = screen.height * ratio;
      heightInPx = screen.height;
    }

    const scale = widthInPx / STAGE_WIDTH;
    this.stage.scale.set(scale, scale);
    this.stage.position.set((screen.width - widthInPx) / 2, (screen.height - heightInPx) / 2);
    console.debug(`Resizing screen.dimensions = ${screen.width} x ${screen.height}, scale = ${scale}`);
  }

  updateAnalysisStage() {
    this.resizeTo();
    this.playfield.updatePlayfield();
    this.foregroundHUDPreparer.updateHUD();
    this.keyPressOverlayPreparer.update();
    this.keyPressOverlayPreparer.container.visible = this.hudOverlaySettingsStore.settings.showKeys;
  }

  /** Clean look hides the debug stats text for a plain osu!-like video (UR/PP/keys follow their own toggles). */
  setCleanLook(clean: boolean) {
    this.foregroundHUDPreparer.showStats = !clean;
  }

  destroy(): void {}
}
