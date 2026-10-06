import { float32, float32_add, float32_div, float32_mul, floatEqual, Vec2 } from "@osujs/math";

const bezierTolerance = Math.fround(0.25);
const circularArcTolerance = Math.fround(0.1);
const catmullDetail = 50;

interface CircularArcProperties {
  thetaStart: number;
  thetaRange: number;
  direction: number;
  radius: number;
  center: Vec2;
}

const toFloat = (x: number) => Math.fround(x);

export class PathApproximator {
  static approximateBezier(controlPoints: Vec2[], p = 0): Vec2[] {
    const output: Vec2[] = [];
    const n = controlPoints.length - 1;

    if (n < 0) {
      return output;
    }
    const toFlatten: Vec2[][] = [];
    const freeBuffers: Vec2[][] = [];

    const points = [...controlPoints];

    if (p > 0 && p < n) {
      for (let i = 0; i < n - p; i++) {
        const subBezier: Vec2[] = new Array(p + 1);
        subBezier[0] = points[i];
        for (let j = 0; j < p - 1; j++) {
          subBezier[j + 1] = points[i + 1];
          for (let k = 1; k < p - j; k++) {
            const l = Math.min(k, n - p - i);
            points[i + k] = points[i + k]
              .scale(l)
              .add(points[i + k + 1])
              .scale(1 / (l + 1));
          }
        }
        subBezier[p] = points[i + 1];
        toFlatten.push(subBezier);
      }

      toFlatten.push(points.slice(n - p, points.length));
      toFlatten.reverse();
    } else {
      p = n;
      toFlatten.push(points);
    }
    const subdivisionBuffer1: Vec2[] = new Array(p + 1);
    const subdivisionBuffer2: Vec2[] = new Array(p * 2 + 1);
    const leftChild: Vec2[] = subdivisionBuffer2;

    while (toFlatten.length > 0) {
      const parent: Vec2[] = toFlatten.pop() as Vec2[];

      if (PathApproximator._bezierIsFlatEnough(parent)) {
        PathApproximator._bezierApproximate(parent, output, subdivisionBuffer1, subdivisionBuffer2, p + 1);

        freeBuffers.push(parent);
        continue;
      }

      const rightChild: Vec2[] = freeBuffers.pop() ?? new Array(p + 1);

      PathApproximator._bezierSubdivide(parent, leftChild, rightChild, subdivisionBuffer1, p + 1);

      for (let i = 0; i < p + 1; ++i) {
        parent[i] = leftChild[i];
      }

      toFlatten.push(rightChild);
      toFlatten.push(parent);
    }

    output.push(controlPoints[n]);

    return output;
  }

  static approximateCatmull(controlPoints: Vec2[]): Vec2[] {
    const result: Vec2[] = [];
    const controlPointsLength = controlPoints.length;

    for (let i = 0; i < controlPointsLength - 1; i++) {
      const v1 = i > 0 ? controlPoints[i - 1] : controlPoints[i];
      const v2 = controlPoints[i];
      const v3 = i < controlPointsLength - 1 ? controlPoints[i + 1] : v2.add(v2).sub(v1);
      const v4 = i < controlPointsLength - 2 ? controlPoints[i + 2] : v3.add(v3).sub(v2);

      for (let c = 0; c < catmullDetail; c++) {
        result.push(PathApproximator._catmullFindPoint(v1, v2, v3, v4, Math.fround(c / catmullDetail)));
        result.push(PathApproximator._catmullFindPoint(v1, v2, v3, v4, Math.fround((c + 1) / catmullDetail)));
      }
    }

    return result;
  }

  static circularArcProperties(controlPoints: Vec2[]): CircularArcProperties | undefined {
    const a = controlPoints[0];
    const b = controlPoints[1];
    const c = controlPoints[2];
    if (floatEqual(0, float32(float32_mul(b.y - a.y, c.x - a.x) - float32_mul(b.x - a.x, c.y - a.y)))) return undefined;

    const d = float32_mul(
      2,
      float32_add(
        float32_add(float32_mul(a.x, b.sub(c).y), float32_mul(b.x, c.sub(a).y)),
        float32_mul(c.x, a.sub(b).y),
      ),
    );
    const aSq = toFloat(a.lengthSquared());
    const bSq = toFloat(b.lengthSquared());
    const cSq = toFloat(c.lengthSquared());

    const centerX = toFloat(
      float32_add(
        float32_add(float32_mul(aSq, b.sub(c).y), float32_mul(bSq, c.sub(a).y)),
        float32_mul(cSq, a.sub(b).y),
      ),
    );
    const centerY = toFloat(
      float32_add(
        float32_add(float32_mul(aSq, c.sub(b).x), float32_mul(bSq, a.sub(c).x)),
        float32_mul(cSq, b.sub(a).x),
      ),
    );
    const center = new Vec2(centerX, centerY).divide(d);

    const dA = a.sub(center);
    const dC = c.sub(center);

    const r = toFloat(dA.length());
    const thetaStart = Math.atan2(dA.y, dA.x);
    let thetaEnd = Math.atan2(dC.y, dC.x);
    while (thetaEnd < thetaStart) thetaEnd += 2 * Math.PI;

    let dir = 1;
    let thetaRange = thetaEnd - thetaStart;
    let orthoAtoC = c.sub(a);
    orthoAtoC = new Vec2(orthoAtoC.y, -orthoAtoC.x);

    if (Vec2.dot(orthoAtoC, b.sub(a)) < 0) {
      dir = -dir;
      thetaRange = 2 * Math.PI - thetaRange;
    }
    return { thetaStart, thetaRange, direction: dir, radius: r, center };
  }

  static approximateCircularArc(controlPoints: Vec2[]): Vec2[] {
    const properties = PathApproximator.circularArcProperties(controlPoints);
    if (!properties) {
      return PathApproximator.approximateBezier(controlPoints);
    }

    const { radius, center, thetaRange, thetaStart, direction } = properties;
    const amountPoints =
      2 * radius <= circularArcTolerance
        ? 2
        : Math.max(2, Math.ceil(thetaRange / (2 * Math.acos(1 - float32_div(circularArcTolerance, radius)))));

    const output: Vec2[] = [];

    for (let i = 0; i < amountPoints; ++i) {
      const fract = i / (amountPoints - 1);
      const theta = thetaStart + direction * fract * thetaRange;

      const o = new Vec2(toFloat(Math.cos(theta)), toFloat(Math.sin(theta))).scale(radius);

      output.push(center.add(o));
    }

    return output;
  }

  static approximateLinear(controlPoints: Vec2[]): Vec2[] {
    return [...controlPoints];
  }

  static approximateLagrangePolynomial(controlPoints: Vec2[]): Vec2[] {
    const numSteps = 51;

    const result: Vec2[] = [];

    const weights = PathApproximator._barycentricWeights(controlPoints);

    let minX = controlPoints[0].x;
    let maxX = controlPoints[0].x;

    for (let i = 1; i < controlPoints.length; i++) {
      minX = Math.min(minX, controlPoints[i].x);
      maxX = Math.max(maxX, controlPoints[i].x);
    }

    const dx = maxX - minX;

    for (let i = 0; i < numSteps; i++) {
      const x = minX + (dx / (numSteps - 1)) * i;
      const y = Math.fround(PathApproximator._barycentricLagrange(controlPoints, weights, x));

      result.push(new Vec2(x, y));
    }

    return result;
  }

  static _barycentricWeights(points: Vec2[]): number[] {
    const n = points.length;
    const w: number[] = [];

    for (let i = 0; i < n; i++) {
      w[i] = 1;

      for (let j = 0; j < n; j++) {
        if (i !== j) {
          w[i] *= points[i].x - points[j].x;
        }
      }

      w[i] = 1.0 / w[i];
    }

    return w;
  }

  static _barycentricLagrange(points: Vec2[], weights: number[], time: number) {
    if (points === null || points.length === 0) {
      throw new Error("points must contain at least one point");
    }

    if (points.length !== weights.length) {
      throw new Error("points must contain exactly as many items as {nameof(weights)}");
    }

    let numerator = 0;
    let denominator = 0;

    for (let i = 0, len = points.length; i < len; i++) {
      if (time === points[i].x) {
        return points[i].y;
      }

      const li = weights[i] / (time - points[i].x);

      numerator += li * points[i].y;
      denominator += li;
    }

    return numerator / denominator;
  }

  static _bezierIsFlatEnough(controlPoints: Vec2[]): boolean {
    for (let i = 1; i < controlPoints.length - 1; i++) {
      const tmp = controlPoints[i - 1].sub(controlPoints[i].scale(2)).add(controlPoints[i + 1]);

      if (tmp.lengthSquared() > bezierTolerance ** 2 * 4) {
        return false;
      }
    }

    return true;
  }

  static _bezierSubdivide(controlPoints: Vec2[], l: Vec2[], r: Vec2[], subdivisionBuffer: Vec2[], count: number): void {
    const midpoints = subdivisionBuffer;

    for (let i = 0; i < count; ++i) {
      midpoints[i] = controlPoints[i];
    }

    for (let i = 0; i < count; ++i) {
      l[i] = midpoints[0];
      r[count - i - 1] = midpoints[count - i - 1];

      for (let j = 0; j < count - i - 1; j++) {
        midpoints[j] = midpoints[j].add(midpoints[j + 1]);
        midpoints[j] = midpoints[j].divide(2);
      }
    }
  }

  static _bezierApproximate(
    controlPoints: Vec2[],
    output: Vec2[],
    subdivisionBuffer1: Vec2[],
    subdivisionBuffer2: Vec2[],
    count: number,
  ): void {
    const l = subdivisionBuffer2;
    const r = subdivisionBuffer1;

    PathApproximator._bezierSubdivide(controlPoints, l, r, subdivisionBuffer1, count);

    for (let i = 0; i < count - 1; ++i) {
      l[count + i] = r[i + 1];
    }

    output.push(controlPoints[0]);

    for (let i = 1; i < count - 1; ++i) {
      const index = 2 * i;
      let p = l[index - 1].add(l[index].scale(2)).add(l[index + 1]);
      p = p.scale(Math.fround(0.25));

      output.push(p);
    }
  }

  static _catmullFindPoint(vec1: Vec2, vec2: Vec2, vec3: Vec2, vec4: Vec2, t: number): Vec2 {
    const t2 = Math.fround(t * t);
    const t3 = Math.fround(t * t2);

    return new Vec2(
      Math.fround(
        0.5 *
          (2 * vec2.x +
            (-vec1.x + vec3.x) * t +
            (2 * vec1.x - 5 * vec2.x + 4 * vec3.x - vec4.x) * t2 +
            (-vec1.x + 3 * vec2.x - 3 * vec3.x + vec4.x) * t3),
      ),
      Math.fround(
        0.5 *
          (2 * vec2.y +
            (-vec1.y + vec3.y) * t +
            (2 * vec1.y - 5 * vec2.y + 4 * vec3.y - vec4.y) * t2 +
            (-vec1.y + 3 * vec2.y - 3 * vec3.y + vec4.y) * t3),
      ),
    );
  }
}
