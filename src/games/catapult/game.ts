import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export const SHOTS_PER_ROUND = 10;
export const GROUND_Y = 420;
export const GRAVITY = 400;
export const STONE_RADIUS = 7;
/** Where the stone leaves the catapult's cup. */
export const LAUNCH = { x: 120, y: 350 } as const;
export const ANGLE_LIMITS = { min: 15, max: 80 } as const;
export const POWER_LIMITS = { min: 20, max: 100 } as const;
/** Launch speed in px/s at 100% power. */
export const MAX_SPEED = 640;
/** A stone still flying after this many seconds counts as a miss. */
export const FLIGHT_TIMEOUT = 6;
/** Points for each stone left when the whole castle falls. */
export const BONUS_PER_SHOT = 15;
const DEBRIS_LIFE = 0.9;
const MESSAGE_LIFE = 1.2;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Section extends Rect {
  name: string;
  kind: 'tower' | 'wall' | 'gate';
  points: number;
  destroyed: boolean;
}

export interface Stone {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds in the air. */
  age: number;
}

export interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

export interface CatapultState {
  /** Degrees above the horizon. */
  angle: number;
  /** Percent of the catapult's full throw. */
  power: number;
  shotsLeft: number;
  score: number;
  bonus: number;
  sections: Section[];
  stone: Stone | null;
  debris: Debris[];
  message: { text: string; age: number } | null;
  phase: 'playing' | 'over';
  scoreSubmitted: boolean;
}

/** The castle, left to right, standing on the ground. */
export function createCastle(): Section[] {
  const section = (
    name: string,
    kind: Section['kind'],
    x: number,
    width: number,
    height: number,
    points: number,
  ): Section => ({ name, kind, x, y: GROUND_Y - height, width, height, points, destroyed: false });
  return [
    section('left tower', 'tower', 540, 50, 130, 30),
    section('left wall', 'wall', 590, 45, 70, 20),
    section('gatehouse', 'gate', 635, 50, 95, 40),
    section('right wall', 'wall', 685, 40, 70, 20),
    section('right tower', 'tower', 725, 50, 150, 30),
  ];
}

export function createState(): CatapultState {
  return {
    angle: 45,
    power: 60,
    shotsLeft: SHOTS_PER_ROUND,
    score: 0,
    bonus: 0,
    sections: createCastle(),
    stone: null,
    debris: [],
    message: null,
    phase: 'playing',
    scoreSubmitted: false,
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function adjustAngle(state: CatapultState, delta: number): void {
  if (state.phase !== 'playing') return;
  state.angle = clamp(state.angle + delta, ANGLE_LIMITS.min, ANGLE_LIMITS.max);
}

export function adjustPower(state: CatapultState, delta: number): void {
  if (state.phase !== 'playing') return;
  state.power = clamp(state.power + delta, POWER_LIMITS.min, POWER_LIMITS.max);
}

/** The stone's starting velocity for an angle in degrees and a power in percent. */
export function launchVelocity(angle: number, power: number): { vx: number; vy: number } {
  const speed = (MAX_SPEED * power) / 100;
  const radians = (angle * Math.PI) / 180;
  return { vx: Math.cos(radians) * speed, vy: -Math.sin(radians) * speed };
}

/** Throws a stone. Returns false while a stone is in the air, with no stones left, or after the round. */
export function fire(state: CatapultState): boolean {
  if (state.phase !== 'playing' || state.stone || state.shotsLeft === 0) return false;
  state.stone = { x: LAUNCH.x, y: LAUNCH.y, ...launchVelocity(state.angle, state.power), age: 0 };
  state.shotsLeft -= 1;
  return true;
}

/**
 * Where along the segment from `from` to `to`, as 0 to 1, a ball of `radius`
 * first touches `rect`, or null if it never does. Checking the whole segment
 * means a fast stone can't skip over a thin wall between two frames.
 */
export function sweepHit(
  from: { x: number; y: number },
  to: { x: number; y: number },
  rect: Rect,
  radius = 0,
): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const edges: [number, number][] = [
    [-dx, from.x - (rect.x - radius)],
    [dx, rect.x + rect.width + radius - from.x],
    [-dy, from.y - (rect.y - radius)],
    [dy, rect.y + rect.height + radius - from.y],
  ];
  let enter = 0;
  let exit = 1;
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > exit) return null;
      enter = Math.max(enter, t);
    } else {
      if (t < enter) return null;
      exit = Math.min(exit, t);
    }
  }
  return enter;
}

/** Knocks a section down and returns the points it earned: 0 if it was already down. */
export function destroySection(state: CatapultState, section: Section): number {
  if (section.destroyed) return 0;
  section.destroyed = true;
  state.score += section.points;
  const cx = section.x + section.width / 2;
  const cy = section.y + section.height / 3;
  for (let i = 0; i < 10; i++) {
    const spread = (i / 9) * 2 - 1;
    state.debris.push({ x: cx, y: cy, vx: spread * 160, vy: -120 - (i % 3) * 70, age: 0 });
  }
  return section.points;
}

export function standingSections(state: CatapultState): Section[] {
  return state.sections.filter((s) => !s.destroyed);
}

function resolveShot(state: CatapultState, text: string): void {
  state.stone = null;
  state.message = { text, age: 0 };
  if (standingSections(state).length === 0) {
    state.bonus = state.shotsLeft * BONUS_PER_SHOT;
    state.score += state.bonus;
    state.phase = 'over';
  } else if (state.shotsLeft === 0) {
    state.phase = 'over';
  }
}

/** Advances the game by `dt` seconds. */
export function step(state: CatapultState, dt: number): void {
  for (const piece of state.debris) {
    piece.vy += GRAVITY * dt;
    piece.x += piece.vx * dt;
    piece.y += piece.vy * dt;
    piece.age += dt;
  }
  state.debris = state.debris.filter((piece) => piece.age < DEBRIS_LIFE);
  if (state.message) {
    state.message.age += dt;
    if (state.message.age >= MESSAGE_LIFE) state.message = null;
  }

  const stone = state.stone;
  if (!stone) return;
  stone.vy += GRAVITY * dt;
  stone.age += dt;
  const from = { x: stone.x, y: stone.y };
  const to = { x: stone.x + stone.vx * dt, y: stone.y + stone.vy * dt };

  let hit: Section | undefined;
  let hitAt = Infinity;
  for (const section of standingSections(state)) {
    const t = sweepHit(from, to, section, STONE_RADIUS);
    if (t !== null && t < hitAt) {
      hit = section;
      hitAt = t;
    }
  }
  const groundLine = GROUND_Y - STONE_RADIUS;
  const groundAt =
    to.y >= groundLine ? clamp((groundLine - from.y) / (to.y - from.y || 1), 0, 1) : Infinity;

  if (hit && hitAt <= groundAt) {
    stone.x = from.x + (to.x - from.x) * hitAt;
    stone.y = from.y + (to.y - from.y) * hitAt;
    const points = destroySection(state, hit);
    resolveShot(state, `Hit the ${hit.name}! +${points}`);
  } else if (groundAt !== Infinity) {
    resolveShot(state, 'Miss');
  } else {
    stone.x = to.x;
    stone.y = to.y;
    const offscreen = stone.x > WIDTH + 30 || stone.x < -30;
    if (offscreen || stone.age >= FLIGHT_TIMEOUT) resolveShot(state, 'Miss');
  }
}

/** Sends the round's score once, the first time it is called after the round ends. */
export function submitScore(state: CatapultState, submit: (score: number) => void): void {
  if (state.phase !== 'over' || state.scoreSubmitted) return;
  state.scoreSubmitted = true;
  submit(state.score);
}

/** A fresh round once this one is over; the same state while it is still going. */
export function replay(state: CatapultState): CatapultState {
  return state.phase === 'over' ? createState() : state;
}

export type Action = 'angle-up' | 'angle-down' | 'power-down' | 'power-up' | 'fire';

const BUTTON_WIDTH = 140;
const BUTTON_GAP = 12;
export const BUTTONS: (Rect & { action: Action; label: string })[] = (
  [
    ['angle-up', 'Angle +'],
    ['angle-down', 'Angle -'],
    ['power-down', 'Power -'],
    ['power-up', 'Power +'],
    ['fire', 'FIRE'],
  ] as const
).map(([action, label], i) => ({
  action,
  label,
  x: 26 + i * (BUTTON_WIDTH + BUTTON_GAP),
  y: 436,
  width: BUTTON_WIDTH,
  height: 54,
}));

export function buttonAt(x: number, y: number): Action | undefined {
  return BUTTONS.find((b) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height)
    ?.action;
}

/** Degrees per keypress or button tap, and per second while a button is held. */
const ANGLE_STEP = 1;
const POWER_STEP = 2;
const ANGLE_RATE = 30;
const POWER_RATE = 40;

export function applyAction(state: CatapultState, action: Action, scale = 1): void {
  if (action === 'angle-up') adjustAngle(state, ANGLE_STEP * scale);
  else if (action === 'angle-down') adjustAngle(state, -ANGLE_STEP * scale);
  else if (action === 'power-up') adjustPower(state, POWER_STEP * scale);
  else if (action === 'power-down') adjustPower(state, -POWER_STEP * scale);
  else fire(state);
}

const KEY_ACTIONS: Record<string, Action> = {
  ArrowLeft: 'angle-up',
  ArrowRight: 'angle-down',
  ArrowUp: 'power-up',
  ArrowDown: 'power-down',
  ' ': 'fire',
};

function drawCatapult(ctx: CanvasRenderingContext2D, state: CatapultState) {
  const { colors } = theme;
  const pivot = { x: 100, y: 388 };

  // Frame and wheels.
  ctx.fillStyle = colors.wood;
  ctx.fillRect(50, 396, 110, 12);
  ctx.beginPath();
  ctx.moveTo(80, 398);
  ctx.lineTo(pivot.x - 4, pivot.y - 6);
  ctx.lineTo(pivot.x + 4, pivot.y - 6);
  ctx.lineTo(120, 398);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = colors.surface;
  for (const x of [66, 144]) {
    ctx.beginPath();
    ctx.arc(x, 410, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = colors.wood;
  ctx.lineWidth = 3;
  for (const x of [66, 144]) {
    ctx.beginPath();
    ctx.arc(x, 410, 10, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The arm leans back while aiming and swings forward after a throw.
  const radians = (state.angle * Math.PI) / 180;
  const armAngle = state.stone ? -radians : -Math.PI + 0.35;
  const armLength = 62;
  const tip = {
    x: pivot.x + Math.cos(armAngle) * armLength,
    y: pivot.y + Math.sin(armAngle) * armLength,
  };
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pivot.x, pivot.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = colors.wood;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 10, 0, Math.PI);
  ctx.fill();
  if (!state.stone && state.phase === 'playing' && state.shotsLeft > 0) {
    ctx.fillStyle = colors.muted;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y - 2, STONE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  // Aim: the arrow points along the angle and grows with power.
  if (state.phase === 'playing' && !state.stone) {
    const length = 30 + state.power * 0.9;
    const end = {
      x: LAUNCH.x + Math.cos(radians) * length,
      y: LAUNCH.y - Math.sin(radians) * length,
    };
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(LAUNCH.x, LAUNCH.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSection(ctx: CanvasRenderingContext2D, section: Section) {
  const { colors } = theme;
  const { x, y, width, height } = section;

  if (section.destroyed) {
    ctx.fillStyle = colors.muted;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(x - 4, GROUND_Y);
    ctx.lineTo(x + width * 0.2, GROUND_Y - 14);
    ctx.lineTo(x + width * 0.45, GROUND_Y - 8);
    ctx.lineTo(x + width * 0.7, GROUND_Y - 18);
    ctx.lineTo(x + width + 4, GROUND_Y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  ctx.fillStyle = colors.muted;
  ctx.fillRect(x, y + 10, width, height - 10);

  // Merlons along the top, inside the section so what you see is what you hit.
  const merlon = width / 5;
  for (let i = 0; i < 5; i += 2) ctx.fillRect(x + i * merlon, y, merlon, 10);

  // Brick courses.
  ctx.strokeStyle = colors.surface;
  ctx.lineWidth = 1;
  for (let row = y + 24, n = 0; row < GROUND_Y; row += 14, n++) {
    ctx.beginPath();
    ctx.moveTo(x, row);
    ctx.lineTo(x + width, row);
    ctx.stroke();
    for (let col = x + (n % 2 ? 6 : 16); col < x + width; col += 20) {
      ctx.beginPath();
      ctx.moveTo(col, row - 14);
      ctx.lineTo(col, row);
      ctx.stroke();
    }
  }

  if (section.kind === 'tower') {
    ctx.fillStyle = colors.background;
    ctx.fillRect(x + width / 2 - 4, y + 30, 8, 22);
    // Flagpole and pennant.
    ctx.fillStyle = colors.text;
    ctx.fillRect(x + width / 2 - 1, y - 30, 2, 30);
    ctx.fillStyle = colors.stripeA;
    ctx.beginPath();
    ctx.moveTo(x + width / 2 + 1, y - 30);
    ctx.lineTo(x + width / 2 + 22, y - 23);
    ctx.lineTo(x + width / 2 + 1, y - 16);
    ctx.closePath();
    ctx.fill();
  } else if (section.kind === 'gate') {
    const doorWidth = width * 0.6;
    const doorX = x + (width - doorWidth) / 2;
    ctx.fillStyle = colors.wood;
    ctx.beginPath();
    ctx.moveTo(doorX, GROUND_Y);
    ctx.lineTo(doorX, GROUND_Y - 30);
    ctx.arc(doorX + doorWidth / 2, GROUND_Y - 30, doorWidth / 2, Math.PI, 0);
    ctx.lineTo(doorX + doorWidth, GROUND_Y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colors.surface;
    ctx.lineWidth = 2;
    for (let bar = doorX + 7; bar < doorX + doorWidth; bar += 8) {
      ctx.beginPath();
      ctx.moveTo(bar, GROUND_Y);
      ctx.lineTo(bar, GROUND_Y - 40);
      ctx.stroke();
    }
  }
}

function draw(ctx: CanvasRenderingContext2D, state: CatapultState, held: Action | null) {
  const { colors } = theme;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Ground.
  ctx.fillStyle = colors.surface;
  ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);
  ctx.fillStyle = colors.wood;
  ctx.fillRect(0, GROUND_Y, WIDTH, 4);

  for (const section of state.sections) drawSection(ctx, section);
  drawCatapult(ctx, state);

  ctx.fillStyle = colors.muted;
  for (const piece of state.debris) {
    ctx.globalAlpha = 1 - piece.age / DEBRIS_LIFE;
    ctx.fillRect(piece.x - 4, piece.y - 4, 8, 8);
  }
  ctx.globalAlpha = 1;

  if (state.stone) {
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    ctx.arc(state.stone.x, state.stone.y, STONE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  // Readouts and instructions.
  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText(
    `Score ${state.score}   Stones ${state.shotsLeft}/${SHOTS_PER_ROUND}   Angle ${Math.round(state.angle)}°   Power ${Math.round(state.power)}%`,
    16,
    28,
  );
  ctx.fillStyle = colors.muted;
  ctx.font = canvasFont('small');
  ctx.fillText(
    'Left/Right: angle   Up/Down: power   Space: fire   Or hold the buttons below',
    16,
    50,
  );

  if (state.message) {
    ctx.globalAlpha = 1 - state.message.age / MESSAGE_LIFE;
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('body', 'bold');
    ctx.textAlign = 'center';
    ctx.fillText(state.message.text, WIDTH / 2, 110);
    ctx.globalAlpha = 1;
  }

  for (const button of BUTTONS) {
    const disabled = state.phase !== 'playing' || (button.action === 'fire' && !!state.stone);
    ctx.globalAlpha = disabled ? 0.4 : 1;
    ctx.fillStyle =
      button.action === held
        ? colors.accent
        : button.action === 'fire'
          ? colors.stripeA
          : colors.background;
    ctx.beginPath();
    ctx.roundRect(button.x, button.y, button.width, button.height, theme.radius);
    ctx.fill();
    ctx.fillStyle = button.action === held ? colors.background : colors.text;
    ctx.font = canvasFont('body', 'bold');
    ctx.textAlign = 'center';
    ctx.fillText(button.label, button.x + button.width / 2, button.y + button.height / 2 + 6);
  }
  ctx.globalAlpha = 1;

  if (state.phase === 'over') {
    const won = standingSections(state).length === 0;
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    ctx.fillText(
      won
        ? `The castle falls! You scored ${state.score}`
        : `Out of stones! You scored ${state.score}`,
      WIDTH / 2,
      HEIGHT / 2 - 20,
    );
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    if (won) {
      ctx.fillText(
        `Includes a ${state.bonus} point bonus for stones left`,
        WIDTH / 2,
        HEIGHT / 2 + 14,
      );
    }
    ctx.fillText('Tap or press Space to play again', WIDTH / 2, HEIGHT / 2 + 48);
  }
}

export const catapult: CarnivalGame = {
  id: 'catapult',
  name: 'Catapulte',
  description: 'Aim the catapult and knock down the castle, tower by tower, in ten stones.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    // Stop a finger on the buttons from scrolling or zooming the page.
    const touchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';

    let state = createState();
    let held: Action | null = null;

    const onKey = (event: KeyboardEvent) => {
      const action = KEY_ACTIONS[event.key];
      const replayKey = state.phase === 'over' && event.key === 'Enter';
      if (!action && !replayKey) return;
      event.preventDefault();
      if (state.phase === 'over') {
        if (!event.repeat && (event.key === ' ' || event.key === 'Enter')) state = replay(state);
      } else if (action && !(action === 'fire' && event.repeat)) {
        applyAction(state, action);
      }
    };
    const onDown = (event: PointerEvent) => {
      event.preventDefault();
      if (state.phase === 'over') {
        state = replay(state);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const action = buttonAt(
        ((event.clientX - rect.left) / rect.width) * WIDTH,
        ((event.clientY - rect.top) / rect.height) * HEIGHT,
      );
      if (!action) return;
      applyAction(state, action);
      held = action === 'fire' ? null : action;
    };
    const onUp = () => (held = null);
    window.addEventListener('keydown', onKey);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onUp);

    let frame = 0;
    let last = performance.now();
    const loop = (time: number) => {
      // Cap the step so a background tab doesn't teleport everything.
      const dt = Math.min((time - last) / 1000, 0.05);
      last = time;
      if (held) {
        const rate = held.startsWith('angle') ? ANGLE_RATE / ANGLE_STEP : POWER_RATE / POWER_STEP;
        applyAction(state, held, rate * dt);
      }
      step(state, dt);
      submitScore(state, (score) => recordScore(catapult.id, score));
      draw(ctx, state, held);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onUp);
      canvas.style.touchAction = touchAction;
    };
  },
};

export default catapult;
