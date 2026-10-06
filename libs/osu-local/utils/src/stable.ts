const magicConstant = BigInt("504911232000000000");
export const legacyReplayFileName = (beatmapMD5Hash: string, scoreTimeStamp: bigint): string => {
  const magicTicks = scoreTimeStamp - magicConstant;
  return `${beatmapMD5Hash}-${magicTicks}.osr`;
};
