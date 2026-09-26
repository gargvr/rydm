# RYDM: move with your rhythm

A playful wellbeing app with a 3D companion. Daily quests earn rewards from your supplementary health insurer, and a quiet on-device layer notices when your rhythm shifts and gently helps you find support. Geneva {ai} Hackathon 2026, AGPsy challenge.

## Run

```bash
node serve.js 5190
```

Open http://localhost:5190 at phone width. No build step.

## What's inside

| File | Job |
|---|---|
| `js/mascot3d.js` | Nine real-time 3D companions (three.js), built from shapes. 8 expressions: happy, joy, calm, caring, sleepy, surprised, celebrate, wave. They blink, breathe, look at your finger, jump when tapped, show confetti and "z"s. |
| `js/companions.js` | Pip, Koko, Lumi, Bram, Nori, Mochi, Ollie, Ziggy, Willow: colours and voice lines. |
| `js/director.js` | Decides how the companion behaves from your situation (time of day, sleep, movement, places, check-in, streak, rhythm shift). Rules always give a safe answer. If the on-device Qwen model is on, it may re-word the line and choose among the expressions allowed for that scenario; its output is validated. |
| `js/quests.js` | Quests, gentle quests, points, streaks, the monthly insurer goal, and `insurerView()`, the only data an insurer receives. |
| `js/chat.js` | Tap-to-answer conversations. Every line is written by us, so the companion is a guide, not a therapist. |
| `js/engine.js` | The personal-baseline drift engine from Lueur. |

## Rules that make it fair and legal

- **Rewards follow effort, not outcomes.** In gentle mode (a rhythm shift has lasted about two weeks), one small quest makes the day count fully. Nobody loses a reward for having a hard month.
- **The insurer only sees** "goal met this month: yes/no" and points. No categories, no raw data, nothing the companion notices.
- **Rewards come from supplementary insurance (VVG) only.** Basic insurance (KVG) premiums can't change with behaviour.
- **Mental-health detection is disclosed** at onboarding, runs on the phone, and is never sent anywhere.

The insurer link in this prototype is a demo. No connection is made.
