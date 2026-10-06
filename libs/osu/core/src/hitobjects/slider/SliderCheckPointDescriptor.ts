import { SliderCheckPointType } from "../Types";

export type SliderCheckPointDescriptor = {
  type: SliderCheckPointType;

  time: number;

  spanIndex: number;

  spanStartTime: number;

  spanProgress: number;
};
