import { AimSession, beatInterval, DEFAULT_AIM_SETTINGS, LATE_WINDOW_MS } from "./aim-session";
import { DEFAULT_SLIDER_SETTINGS, generateSliderPath, pointAt, SliderSession, SliderShape } from "./slider-session";
import {
  accuracy,
  arToPreempt,
  csToRadius,
  distance,
  insidePlayfield,
  judgeByDistance,
  nextPosition,
  offsetInJumpFrame,
} from "./trainer-math";

function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("trainer math", () => {
  it("uses the osu! formulas for CS and AR", () => {
    expect(csToRadius(4)).toBeCloseTo(36.48);
    expect(arToPreempt(5)).toBe(1200);
    expect(arToPreempt(9)).toBe(600);
    expect(arToPreempt(0)).toBe(1800);
  });

  it("judges by distance from the center", () => {
    expect(judgeByDistance(5, 30)).toBe(300);
    expect(judgeByDistance(15, 30)).toBe(100);
    expect(judgeByDistance(29, 30)).toBe(50);
    expect(judgeByDistance(31, 30)).toBe(0);
    expect(accuracy([300, 0])).toBe(0.5);
  });

  it("tells overshoot from undershoot along the jump direction", () => {
    const from = { x: 0, y: 100 };
    const target = { x: 100, y: 100 };
    expect(offsetInJumpFrame(from, target, { x: 110, y: 100 }, 20)).toEqual({ along: 0.5, across: 0 });
    expect(offsetInJumpFrame(from, target, { x: 90, y: 100 }, 20).along).toBe(-0.5);
    expect(offsetInJumpFrame(from, target, { x: 100, y: 110 }, 20).across).toBe(0.5);
  });

  it("keeps every jump inside the playfield and within the requested distance", () => {
    const random = seeded();
    let p = { x: 256, y: 192 };
    for (let i = 0; i < 500; i++) {
      const next = nextPosition(p, 180, 320, 40, random);
      expect(insidePlayfield(next, 40)).toBe(true);
      expect(distance(p, next)).toBeLessThanOrEqual(320 + 1e-6);
      p = next;
    }
  });
});

describe("aim session", () => {
  it("scores clicks by precision and moves to the next circle", () => {
    const session = new AimSession({ ...DEFAULT_AIM_SETTINGS, sizeVariation: 0 }, 0, seeded());
    const first = session.target!;
    const hit = session.press(500, first.position)!;
    expect(hit.judgement).toBe(300);
    expect(hit.distanceRatio).toBe(0);
    const second = session.target!;
    expect(second.id).toBe(first.id + 1);
    expect(distance(second.from, second.position)).toBeGreaterThan(100);

    const miss = session.press(900, { x: second.position.x + second.radius * 2, y: second.position.y })!;
    expect(miss.judgement).toBe(0);
    expect(session.target!.id).toBe(second.id + 1);
  });

  it("counts a circle that was never clicked as a miss", () => {
    const session = new AimSession(DEFAULT_AIM_SETTINGS, 0, seeded());
    const target = session.target!;
    session.update(target.hitTime + LATE_WINDOW_MS + 1);
    expect(session.results).toHaveLength(1);
    expect(session.results[0].judgement).toBe(0);
    expect(session.results[0].click).toBeUndefined();
  });

  it("varies the circle size when asked", () => {
    const session = new AimSession({ ...DEFAULT_AIM_SETTINGS, sizeVariation: 0.5 }, 0, seeded(7));
    const radii = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const target = session.target!;
      radii.add(Math.round(target.radius));
      session.press(target.spawnTime, target.position);
    }
    expect(radii.size).toBeGreaterThan(5);
    expect(session.isFinished(DEFAULT_AIM_SETTINGS.durationSec * 1000)).toBe(true);
  });
});

describe("slider paths", () => {
  it.each(["linear", "curve", "wave", "mixed"] as SliderShape[])(
    "%s sliders have the right length and stay inside",
    (shape) => {
      const random = seeded(3);
      for (let i = 0; i < 50; i++) {
        const path = generateSliderPath(shape, { x: 256, y: 192 }, 220, 36, random);
        expect(path.length).toBeCloseTo(220, 0);
        expect(path.points.every((p) => insidePlayfield(p, 36))).toBe(true);
        expect(pointAt(path, 0)).toEqual(path.points[0]);
      }
    },
  );
});

describe("slider session", () => {
  it("measures how well the ball is followed", () => {
    const session = new SliderSession({ ...DEFAULT_SLIDER_SETTINGS, shape: "linear" }, 0, seeded());
    const slider = session.slider!;
    expect(session.update(slider.startTime - 1, slider.path.points[0], false)).toBeNull();

    const half = (slider.startTime + slider.endTime) / 2;
    for (let t = slider.startTime; t <= slider.endTime; t += 10) {
      const ball = pointAt(
        slider.path,
        ((t - slider.startTime) / (slider.endTime - slider.startTime)) * slider.path.length,
      );
      session.update(t, ball, t < half);
    }
    session.update(slider.endTime, slider.path.points[slider.path.points.length - 1], false);
    expect(session.results).toHaveLength(1);
    expect(session.results[0].tracked).toBeGreaterThan(0.45);
    expect(session.results[0].tracked).toBeLessThan(0.55);
    expect(session.results[0].averageDistance).toBeCloseTo(0, 5);
    expect(session.slider!.id).toBe(slider.id + 1);
  });
});

describe("aim session on beat (BPM)", () => {
  const settings = { ...DEFAULT_AIM_SETTINGS, waitForClick: false, bpm: 120, divisor: 2, ar: 5, sizeVariation: 0 };

  it("spawns circles on the beat, several at once with a high AR window", () => {
    expect(beatInterval(settings)).toBe(250);
    const session = new AimSession(settings, 0, seeded());
    session.update(600);
    const hitTimes = session.targets.map((t) => t.hitTime);
    expect(hitTimes).toEqual([1200, 1450, 1700]);
  });

  it("ignores clicks that are too early and measures timing", () => {
    const session = new AimSession(settings, 0, seeded());
    session.update(1000);
    const first = session.target!;
    expect(session.press(first.hitTime - LATE_WINDOW_MS - 1, first.position)).toBeNull();
    const hit = session.press(first.hitTime + 30, first.position)!;
    expect(hit.judgement).toBe(300);
    expect(hit.timingMs).toBe(30);
    expect(session.target!.hitTime).toBe(first.hitTime + 250);
  });

  it("misses every circle that passes unclicked and stops spawning at the end", () => {
    const session = new AimSession({ ...settings, durationSec: 5 }, 0, seeded());
    for (let t = 0; t < 5000; t += 16) session.update(t);
    const misses = session.results.filter((r) => r.judgement === 0).length;
    expect(misses).toBe(15);
    session.update(10000);
    expect(session.isFinished(10000)).toBe(true);
  });
});

describe("aim session, one circle at a time on the BPM beat", () => {
  const settings = { ...DEFAULT_AIM_SETTINGS, waitForClick: true, bpm: 120, divisor: 1, ar: 5, sizeVariation: 0 };

  it("shows the next circle only after the click, closing on the next beat", () => {
    const session = new AimSession(settings, 0, seeded());
    const first = session.target!;
    expect(first.hitTime).toBe(1200);
    session.update(1000);
    expect(session.targets).toHaveLength(1);
    const hit = session.press(1200, first.position)!;
    expect(hit.timingMs).toBe(0);
    expect(session.targets).toHaveLength(1);
    expect(session.target!.hitTime).toBe(1700);
    expect(session.target!.spawnTime).toBe(1200);
  });

  it("keeps the beat after a late click, restarts it after a missed circle", () => {
    const session = new AimSession(settings, 0, seeded());
    session.press(1400, session.target!.position);
    expect(session.target!.hitTime).toBe(1700);
    session.update(1951);
    expect(session.results[1].judgement).toBe(0);
    expect(session.target!.hitTime).toBe(2451);
  });
});
