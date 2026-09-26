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

## How the numbers are read (team spec, 26 Sep)

- **Sleep:** duration, plus timing as the **midpoint of sleep**. Regularity is how much the midpoint varies night to night.
- **Also read:** steps and HRV (wearable); time at home from location, since iOS doesn't let apps read screen time; mood and **enjoyment** from a two-tap daily check-in.
- **Baseline:** 14 days, compared with the next 14. The baseline is **anchored** once a change starts, so a slow slide can't become the new "usual".
- **General healthy ranges** are checked as well as personal change: sleep under 6 h or over 10.5 h, under 4,000 steps, mood or enjoyment ≤ 2 most days.

## Notifications and escalation (team "nudging" notes)

| Stage | When | Note |
|---|---|---|
| 1 Informational | something moved | "Sleep was shorter than usual. You slept 5h 42 last night, around 1h 20 below your usual range." |
| 2 Question | one signal clearly shifted | "…How have you been feeling lately?" [Quick check-in] |
| 3 Sustained | several signals, for a while | "We've noticed a sustained change in your routine… This doesn't tell us why, but it may be worth checking in." [I'm ready to share my results] [Review with a professional] |
| 4 Escalate | stage 3 unchanged after 14 days | "Things still feel different after two weeks… your GP can prescribe sessions with a psychologist." [See who's available now] |

- Wording follows the reactance research (DOI 10.1177/2055207619832767): "you could", never "you should".
- Heart-rate notes never show bpm, to avoid health anxiety.
- "Who's available now" lists 143, 147, your GP (office hours only), FSP Psyfinder, the AGPsy directory and HUG emergencies.

## Rules that make it fair and legal

- **Rewards follow effort, not outcomes.** In gentle mode (a rhythm shift has lasted about two weeks), one small quest makes the day count fully. Nobody loses a reward for having a hard month.
- **The insurer only sees** "goal met this month: yes/no" and points. No categories, no raw data, nothing the companion notices.
- **Rewards come from supplementary insurance (VVG) only.** Basic insurance (KVG) premiums can't change with behaviour.
- **Mental-health detection is disclosed** at onboarding, runs on the phone, and is never sent anywhere.

The insurer link in this prototype is a demo. No connection is made.
