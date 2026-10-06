import { ObjectPool } from "./ObjectPool";

export class TemporaryObjectPool<T> extends ObjectPool<T> {
  touched: Set<string> = new Set<string>();

  allocate(id: string) {
    this.touched.add(id);
    return super.allocate(id);
  }

  releaseUntouched() {
    const keys = Array.from(this.dict.keys());
    for (const id of keys) {
      if (!this.touched.has(id)) {
        this.release(id);
      }
    }
    this.touched.clear();
  }
}
