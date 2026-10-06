const epochTicks = BigInt(621355968000000000);
const ticksPerMillisecond = BigInt(10000);
const maxDateMilliseconds = BigInt(8640000000000000);

type WindowsDate = [Date, number];

export const ticksToDate = (ticks: bigint): WindowsDate => {
  const ticksSinceEpoch = ticks - epochTicks;
  const millisecondsSinceEpoch = ticksSinceEpoch / ticksPerMillisecond;
  const subMs = Number(ticksSinceEpoch % ticksPerMillisecond);

  if (millisecondsSinceEpoch > maxDateMilliseconds) {
    throw Error(`Given ticks=${ticks} would be too large`);
  }
  return [new Date(Number(millisecondsSinceEpoch)), subMs];
};

export const dateToTicks = (wDate: WindowsDate): bigint => {
  const [date, subMs] = wDate;
  const ms = BigInt(date.getTime()) * ticksPerMillisecond;
  return ms + epochTicks + BigInt(subMs);
};
