export function insertDecreasing(queue: number[], element: number, maxSize: number) {
  const n = queue.length;
  let i, j;
  for (i = 0; i < n; i++) {
    if (queue[i] < element) {
      break;
    }
  }

  if (i === n) {
    if (n < maxSize) {
      queue.push(element);
    }
    return;
  }

  if (n < maxSize) queue.push(queue[n - 1]);
  for (j = n - 1; j > i; j--) queue[j] = queue[j - 1];
  queue[i] = element;
  return queue;
}
