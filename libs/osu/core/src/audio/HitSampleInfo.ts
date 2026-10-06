export class HitSampleInfo {
  static HIT_WHISTLE = "hitwhistle";
  static HIT_FINISH = "hitfinish";
  static HIT_NORMAL = "hitnormal";
  static HIT_CLAP = "hitclap";

  volume = 0;
  lookupNames?: IterableIterator<string>;

  static ALL_ADDITIONS = [HitSampleInfo.HIT_WHISTLE, HitSampleInfo.HIT_CLAP, HitSampleInfo.HIT_FINISH];

  name = "";
  bank: string | null;
  suffix: string | null;

  constructor(name: string, bank: string | null = null, suffix: string | null = null, volume = 0) {
    this.name = name;
    this.bank = bank;
    this.suffix = suffix;
    this.volume = volume;
  }
}
