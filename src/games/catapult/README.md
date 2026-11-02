# Catapulte

Aim the wooden catapult and knock down the castle, tower by tower, with ten stones.

## How to play

- Set the angle and the power, then fire. The dashed arrow points where the stone
  will leave the catapult, and grows longer with more power.
- Keyboard: **Left** raises the angle and **Right** lowers it (15° to 80°),
  **Up** and **Down** change the power (20% to 100%), **Space** fires.
- Mouse or touch: tap the **Angle +**, **Angle -**, **Power -**, **Power +** and
  **FIRE** buttons along the bottom of the game. Hold an angle or power button to
  keep changing it.
- The stone flies in an arc and falls under gravity. Only one stone can be in the
  air at a time, and you can't aim or fire once the round is over.
- Every throw uses a stone, hit or miss. A stone that lands on the ground, flies
  off the screen or stays up longer than 6 seconds is a miss.
- While the game is open, the arrow keys and Space control the catapult and
  don't scroll the page.

## Scoring

Each castle section falls to one hit and scores once. A stone that hits rubble
flies on through it.

| Section                 | Points |
| ----------------------- | ------ |
| Left tower, right tower | 30     |
| Gatehouse               | 40     |
| Left wall, right wall   | 20     |

Knocking down the whole castle is worth 140 points.

## How a round ends

- The round ends when your last stone has landed, or as soon as the whole castle
  is down.
- If the castle falls early, you get a bonus of 15 points for each stone you have
  left. Taking the castle in five stones scores 140 + 5 × 15 = 215.
- The end screen shows your score. Tap the game, or press Space or Enter, to play
  a fresh round.

Your final score is saved to the carnival's score board once, when the round ends.

## Files

- `game.ts`: the game logic (`createState`, `adjustAngle`, `adjustPower`, `fire`,
  `step`, `sweepHit`, `destroySection`, `submitScore`, `replay`) and the
  `catapult` entry, the default export the midway finds.
- `game.test.ts`: tests for the game logic.
