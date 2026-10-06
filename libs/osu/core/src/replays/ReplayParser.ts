import { OsuAction, ReplayButtonState, ReplayFrame } from "./Replay";

const MAX_COORDINATE_VALUE = 131072;
const bitmaskCheck = (mask: number, bit: number): boolean => (mask & bit) !== 0;
export const parseReplayFramesFromRaw = (rawString: string): ReplayFrame[] => {
  const frameStrings = rawString.split(",");
  let lastTime = 0;
  const frames: ReplayFrame[] = [];
  for (let i = 0; i < frameStrings.length; i++) {
    const split = frameStrings[i].split("|");
    if (split.length < 4) continue;

    if (split[0] === "-12345") {
      continue;
    }

    const diff = parseFloat(split[0]);
    const mouseX = parseFloat(split[1]);
    const mouseY = parseFloat(split[2]);
    if (Math.abs(mouseX) > MAX_COORDINATE_VALUE || Math.abs(mouseY) > MAX_COORDINATE_VALUE) {
      throw Error("Value overflow while parsing mouse coordinates");
    }
    lastTime += diff;
    if (i < 2 && mouseX === 256 && mouseY === -500) continue;

    if (diff < 0) continue;
    const actions: OsuAction[] = [];
    const b = parseInt(split[3]);

    if (bitmaskCheck(b, ReplayButtonState.Left1) || bitmaskCheck(b, ReplayButtonState.Left2))
      actions.push(OsuAction.leftButton);
    if (bitmaskCheck(b, ReplayButtonState.Right1) || bitmaskCheck(b, ReplayButtonState.Right2))
      actions.push(OsuAction.rightButton);

    frames.push({ actions, position: { x: mouseX, y: mouseY }, time: lastTime });
  }

  const mergedFrames: ReplayFrame[] = [];
  let last;
  for (let i = 0; i < frames.length; i++) {
    if (last === undefined || frames[i].time !== last.time) {
      mergedFrames.push(frames[i]);
      last = frames[i];
    } else {
      for (let j = 0; j < frames[i].actions.length; j++) {
        const a = frames[i].actions[j];
        if (!last.actions.includes(a)) {
          last.actions.push(a);
        }
      }
      last.actions.sort();
    }
  }

  return mergedFrames;
};
