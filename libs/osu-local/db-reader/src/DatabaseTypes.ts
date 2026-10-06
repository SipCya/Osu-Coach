type Byte = number;
type Short = number;
type Int = number;
type Long = bigint;
type ULEB128 = bigint;
type Single = number;
type Double = number;

type IntSinglePair = [Int, Single];
export type TimingPoint = {
  bpm: Double;
  offset: Double;
  inherited: boolean;
};
type DateTime = bigint;

export type OsuDB = {
  osuVersion: Int;
  folderCount: Int;
  accountIsUnlocked: boolean;
  accountUnlockDate: DateTime;
  playerName: string;
  numberOfBeatmaps: Int;
  beatmaps: Beatmap[];
  userPermissions: Int;
};

enum RankedStatus {
  UNKNOWN = 0,
  UNSUBMITTED = 1,
  PENDING = 2,
  UNUSED = 3,
  RANKED = 4,
  APPROVED = 5,
  QUALIFIED = 6,
  LOVED = 7,
}

enum GameplayMode {
  STD = 0x00,
  TAIKO = 0x01,
  CTB = 0x02,
  MANIA = 0x03,
}

export type StarRatings = IntSinglePair[];

export type Beatmap = {
  bytesOfBeatmapEntry: Int;
  artist: string;
  artistUnicode: string;
  title: string;
  titleUnicode: string;
  creator: string;
  difficulty: string;
  audioFileName: string;
  md5Hash: string;
  fileName: string;
  rankedStatus: RankedStatus;
  circlesCount: Short;
  slidersCount: Short;
  spinnersCount: Short;
  lastModifiedTime: DateTime;
  approachRate: Single;
  circleSize: Single;
  hpDrain: Single;
  overallDifficulty: Single;
  sliderVelocity: Double;
  stdStarRatings: StarRatings;
  taikoStarRatings: StarRatings;
  catchStarRatings: StarRatings;
  maniaStarRatings: StarRatings;
  drainTime: Int;
  totalTime: Int;
  audioPreviewTime: Int;
  timingPoints: TimingPoint[];
  beatmapId: Int;
  beatmapSetId: Int;
  threadId: Int;
  stdGrade: Byte;
  taikoGrade: Byte;
  ctbGrade: Byte;
  maniaGrade: Byte;
  localOffset: Short;
  stackLeniency: Single;
  gameplayMode: GameplayMode;
  source: string;
  tags: string;
  offset: Short;
  titleFont: string;
  isUnplayed: boolean;
  lastPlayed: DateTime;
  isOsz2: boolean;
  folderName: string;
  lastCheckedAgainstOsuRepo: DateTime;
  ignoreBeatmapSound: boolean;
  ignoreBeatmapSkin: boolean;
  disableStoryboard: boolean;
  disableVideo: boolean;
  visualOverride: boolean;
  maniaScrollSpeed: Byte;
};

export type Score = {
  gameplayMode: GameplayMode;
  version: Int;
  beatmapMD5: string;
  player: string;
  replayMD5: string;
  numberOf300s: Short;
  numberOf100s: Short;
  numberOf50s: Short;
  numberOfGekis: Short;
  numberOfKatus: Short;
  numberOfMisses: Short;
  replayScore: Int;
  maxCombo: Short;
  perfectCombo: boolean;
  modsBitmask: Int;
  timestamp: DateTime;
  onlineScoreId: Long;
  additionalModInfo: Double;
};

export type ScoresDBBeatmap = {
  md5hash: string;
  numberOfScores: Int;
  scores: Score[];
};

export type ScoresDB = {
  version: Int;
  numberOfBeatmaps: Int;
  beatmaps: ScoresDBBeatmap[];
};
