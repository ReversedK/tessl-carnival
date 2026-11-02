import { describe, expect, it, vi } from 'vitest';
import {
  ANGLE_LIMITS,
  BONUS_PER_SHOT,
  FLIGHT_TIMEOUT,
  GRAVITY,
  LAUNCH,
  POWER_LIMITS,
  SHOTS_PER_ROUND,
  adjustAngle,
  adjustPower,
  buttonAt,
  BUTTONS,
  createState,
  destroySection,
  fire,
  launchVelocity,
  replay,
  standingSections,
  step,
  submitScore,
  sweepHit,
  type CatapultState,
} from './game';

/** Steps at 60 fps until the stone lands, and returns how many frames that took. */
function flyUntilResolved(state: CatapultState): number {
  let frames = 0;
  while (state.stone && frames < 1000) {
    step(state, 1 / 60);
    frames++;
  }
  return frames;
}

/** The name of the first section a throw at this angle and power hits on a full castle. */
function hitWith(angle: number, power: number): string | undefined {
  const state = createState();
  state.angle = angle;
  state.power = power;
  fire(state);
  flyUntilResolved(state);
  return state.sections.find((s) => s.destroyed)?.name;
}

describe('catapult', () => {
  it('starts a round with ten stones, no score and the whole castle standing', () => {
    const state = createState();
    expect(state.shotsLeft).toBe(SHOTS_PER_ROUND);
    expect(state.score).toBe(0);
    expect(state.phase).toBe('playing');
    expect(state.stone).toBeNull();
    expect(state.sections.length).toBeGreaterThanOrEqual(4);
    expect(standingSections(state)).toHaveLength(state.sections.length);
  });

  it('keeps the angle and power inside their limits', () => {
    const state = createState();
    adjustAngle(state, 500);
    adjustPower(state, 500);
    expect(state.angle).toBe(ANGLE_LIMITS.max);
    expect(state.power).toBe(POWER_LIMITS.max);
    adjustAngle(state, -500);
    adjustPower(state, -500);
    expect(state.angle).toBe(ANGLE_LIMITS.min);
    expect(state.power).toBe(POWER_LIMITS.min);
  });

  it('throws faster with more power and higher with a steeper angle', () => {
    const weak = launchVelocity(45, 30);
    const strong = launchVelocity(45, 90);
    expect(Math.hypot(strong.vx, strong.vy)).toBeGreaterThan(Math.hypot(weak.vx, weak.vy));
    const flat = launchVelocity(20, 60);
    const steep = launchVelocity(70, 60);
    expect(steep.vy).toBeLessThan(flat.vy);
    expect(steep.vx).toBeLessThan(flat.vx);
  });

  it('flies the stone along a gravity-driven arc', () => {
    const state = createState();
    state.sections = [];
    fire(state);
    const { vx, vy } = launchVelocity(state.angle, state.power);
    step(state, 0.1);
    expect(state.stone!.vy).toBeCloseTo(vy + GRAVITY * 0.1);
    expect(state.stone!.x).toBeCloseTo(LAUNCH.x + vx * 0.1);
    for (let i = 0; i < 10; i++) step(state, 0.1);
    // Rises first, then gravity turns it round.
    expect(state.stone!.vy).toBeGreaterThan(0);
  });

  it('allows one stone in the air at a time and uses a stone per throw', () => {
    const state = createState();
    expect(fire(state)).toBe(true);
    expect(fire(state)).toBe(false);
    expect(state.shotsLeft).toBe(SHOTS_PER_ROUND - 1);
  });

  it('catches a hit anywhere along the movement, so a fast stone cannot tunnel through', () => {
    const wall = { x: 100, y: 0, width: 10, height: 100 };
    expect(sweepHit({ x: 0, y: 50 }, { x: 300, y: 50 }, wall)).toBeCloseTo(1 / 3);
    expect(sweepHit({ x: 0, y: 50 }, { x: 90, y: 50 }, wall)).toBeNull();
    expect(sweepHit({ x: 0, y: 150 }, { x: 300, y: 150 }, wall)).toBeNull();
    expect(sweepHit({ x: 0, y: 105 }, { x: 300, y: 105 }, wall, 7)).not.toBeNull();

    const state = createState();
    const section = state.sections[1];
    state.sections = [section];
    state.stone = {
      x: section.x - 200,
      y: section.y + section.height / 2,
      vx: 20000,
      vy: 0,
      age: 0,
    };
    step(state, 1 / 30);
    expect(section.destroyed).toBe(true);
  });

  it('scores each castle section only once', () => {
    const state = createState();
    const section = state.sections[0];
    expect(destroySection(state, section)).toBe(section.points);
    expect(destroySection(state, section)).toBe(0);
    expect(state.score).toBe(section.points);
  });

  it('lets a stone pass through the rubble of a section that is already down', () => {
    const state = createState();
    const [first, second] = state.sections;
    first.destroyed = true;
    state.stone = { x: first.x - 20, y: first.y + first.height - 20, vx: 3000, vy: 0, age: 0 };
    step(state, 1 / 30);
    expect(second.destroyed).toBe(true);
    expect(state.score).toBe(second.points);
  });

  it('uses up a stone on a miss and resolves the shot on the ground', () => {
    const state = createState();
    state.angle = 45;
    state.power = POWER_LIMITS.min;
    fire(state);
    flyUntilResolved(state);
    expect(state.stone).toBeNull();
    expect(state.score).toBe(0);
    expect(state.shotsLeft).toBe(SHOTS_PER_ROUND - 1);
    expect(state.message?.text).toBe('Miss');
    expect(fire(state)).toBe(true);
  });

  it('resolves a stone that flies off screen or stays up too long', () => {
    const offscreen = createState();
    offscreen.stone = { x: 900, y: 100, vx: 500, vy: 0, age: 0 };
    step(offscreen, 1 / 60);
    expect(offscreen.stone).toBeNull();

    const stuck = createState();
    stuck.stone = { x: 300, y: -5000, vx: 0, vy: -1000, age: FLIGHT_TIMEOUT };
    step(stuck, 1 / 60);
    expect(stuck.stone).toBeNull();
  });

  it('can reach every castle section with some angle and power', () => {
    const reached = new Set<string>();
    for (let angle = ANGLE_LIMITS.min; angle <= ANGLE_LIMITS.max; angle += 1) {
      for (let power = POWER_LIMITS.min; power <= POWER_LIMITS.max; power += 2) {
        const name = hitWith(angle, power);
        if (name) reached.add(name);
      }
    }
    expect([...reached].sort()).toEqual(
      createState()
        .sections.map((s) => s.name)
        .sort(),
    );
  });

  it('lets the last stone finish its flight before the round ends', () => {
    const state = createState();
    state.shotsLeft = 1;
    fire(state);
    expect(state.shotsLeft).toBe(0);
    step(state, 1 / 60);
    expect(state.phase).toBe('playing');
    flyUntilResolved(state);
    expect(state.phase).toBe('over');
    expect(fire(state)).toBe(false);
  });

  it('ends the round early when the castle falls, with a bonus for stones left', () => {
    const state = createState();
    const [last, ...rest] = state.sections;
    for (const section of rest) destroySection(state, section);
    const before = state.score;
    state.shotsLeft = 4;
    state.stone = { x: last.x - 10, y: last.y + 40, vx: 600, vy: 0, age: 0 };
    step(state, 1 / 30);
    expect(state.phase).toBe('over');
    expect(state.bonus).toBe(4 * BONUS_PER_SHOT);
    expect(state.score).toBe(before + last.points + 4 * BONUS_PER_SHOT);
    expect(fire(state)).toBe(false);
  });

  it('submits the final score exactly once per round', () => {
    const state = createState();
    const submit = vi.fn();
    submitScore(state, submit);
    expect(submit).not.toHaveBeenCalled();
    state.score = 70;
    state.phase = 'over';
    submitScore(state, submit);
    submitScore(state, submit);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(70);
  });

  it('starts a fresh round on replay, ready to submit its own score', () => {
    const state = createState();
    state.score = 50;
    state.shotsLeft = 0;
    state.angle = 70;
    destroySection(state, state.sections[0]);
    expect(replay(state)).toBe(state);
    state.phase = 'over';
    submitScore(state, () => {});

    const next = replay(state);
    expect(next).toEqual(createState());
    const submit = vi.fn();
    next.phase = 'over';
    submitScore(next, submit);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('ignores aiming once the round is over', () => {
    const state = createState();
    state.phase = 'over';
    adjustAngle(state, 10);
    adjustPower(state, 10);
    expect(state.angle).toBe(createState().angle);
    expect(state.power).toBe(createState().power);
  });

  it('maps a tap on each on-screen button to its action', () => {
    for (const button of BUTTONS) {
      expect(buttonAt(button.x + button.width / 2, button.y + button.height / 2)).toBe(
        button.action,
      );
    }
    expect(buttonAt(400, 200)).toBeUndefined();
  });
});
