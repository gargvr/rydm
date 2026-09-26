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

## Check-in chatbot (js/bot.js)

The chatbot collects what sensors can't, and hands the screening modules a structured report. It is a wellbeing check, never shown to the user as a score.

**Track A: the user opens chat.**
- Chips: "Just exploring" (loops back to the start), "Something's on my mind", "Can't sleep well", "Feeling stressed", "Feeling low", "Quick check-in".
- Problem paths go: acknowledge, then a small idea, then offer a check-in, then helplines if it persists.

**Track B: the data suggests a check-in.**
- A notification or pop-up ("Noticed you haven't been feeling quite yourself lately. Want to answer a few questions to see what could help?") opens a guided check-in.
- The guided check-in starts from the areas the data flagged.

**Questions**
- Core is the **WHO-5 Wellbeing Index**: 5 positively worded items about mood, calm, energy, waking rested and interest.
- If WHO-5 is low or the data flagged something, **PHQ-9 style items** follow for the DSM-5 areas nobody can track: low mood, appetite, slowed/restless (only if movement was flagged), self-worth, concentration, and thoughts of death.
- A progress counter shows the questions ("Question 3 of 5", growing to about 11 only when needed).
- Answer formats vary: 6-step frequency, a 1-10 energy battery, colour/weather chips, "I slept enough but I'm not rested".
- **"Not sure" is always allowed.** It is recorded as unknown and followed by a simpler, concrete question.

**Analysis**
- The nine DSM-5 symptoms are each marked met / not met / unknown, from chat, data, or both.
- A symptom from data counts only if the chat supports it.
- "Indicators met" follows the DSM rule: 5 of 9, including low mood or loss of interest.

**Outcomes**
- **Safety:** any sign of thoughts of death gives 143 and help immediately.
- **Data bad + chat bad:** hotline and referral.
- **Came on their own + chat bad:** suggest a psychologist.
- **Chat fine + data bad:** practical fixes.
- **All fine:** encouragement.

**Report:** `window.RYDM_lastReport`, also saved locally. Profile › Demo controls › Last check-in report shows it.

## Rules that make it fair and legal

- **Rewards follow effort, not outcomes.** In gentle mode (a rhythm shift has lasted about two weeks), one small quest makes the day count fully. Nobody loses a reward for having a hard month.
- **The insurer only sees** "goal met this month: yes/no" and points. No categories, no raw data, nothing the companion notices.
- **Rewards come from supplementary insurance (VVG) only.** Basic insurance (KVG) premiums can't change with behaviour.
- **Mental-health detection is disclosed** at onboarding, runs on the phone, and is never sent anywhere.

The insurer link in this prototype is a demo. No connection is made.
