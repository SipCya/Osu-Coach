export function calculateDigits(x: number) {
  if (x < 0) {
    throw Error("Only non negative numbers allowed");
  }
  if (x === 0) {
    return [0];
  }
  const d: number[] = [];
  while (x > 0) {
    d.push(x % 10);
    x = Math.floor(x / 10);
  }
  d.reverse();
  return d;
}

export function calculateAccuracyDigits(accuracy: number): [number[], number[]] {
  if (accuracy < 0 || accuracy > 1) {
    throw Error("Accuracy not between 0 and 1");
  }

  const consideredAcc = Math.floor(accuracy * 10000);
  const digits = calculateDigits(consideredAcc);

  if (digits.length === 1) {
    return [[0], [0, digits[0]]];
  }
  if (digits.length === 2) {
    return [[0], digits];
  }
  return [digits.slice(0, digits.length - 2), digits.slice(digits.length - 2, digits.length)];
}
