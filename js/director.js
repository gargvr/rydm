// The mascot's "director": looks at the person's situation and decides how the companion
// behaves (expression, what it says, which quest it nudges).
//
// 1. Rules always produce a safe answer.
// 2. If the on-device Qwen model is loaded, it may re-phrase the line and choose among the
//    expressions allowed for that scenario. It only sees words like "short sleep", "quest done",
//    "evening", never numbers, names or raw data. Its answer is validated; anything off is dropped.
import { byId } from "./companions.js";

export const SCENARIOS = {
  learning:     { expressions: ["happy", "wave"],             focus: [] },
  morning:      { expressions: ["happy", "wave", "joy"],      focus: ["outside", "move"] },
  shortSleep:   { expressions: ["caring", "calm", "sleepy"],  focus: ["sleep", "outside"] },
  lowMove:      { expressions: ["happy", "caring", "wave"],   focus: ["move", "outside"] },
  homeBound:    { expressions: ["caring", "happy"],           focus: ["outside", "connect"] },
  streak:       { expressions: ["joy", "celebrate", "happy"], focus: [] },
  allDone:      { expressions: ["celebrate", "joy"],          focus: [] },
  evening:      { expressions: ["calm", "sleepy", "caring"],  focus: ["sleep", "calm"] },
  lateNight:    { expressions: ["sleepy", "calm"],            focus: ["sleep"] },
  checkinLow:   { expressions: ["caring", "calm"],            focus: ["calm", "connect"] },
  checkinGood:  { expressions: ["joy", "happy"],              focus: [] },
  gentle:       { expressions: ["caring", "calm", "sleepy"],  focus: ["calm", "outside"] },
  reachOut:     { expressions: ["caring"],                    focus: ["connect"] },
};

const FACT_WORDS = {
  learning: "still getting to know the person", morning: "morning, fresh start", shortSleep: "slept shorter than usual",
  lowMove: "less movement than usual lately", homeBound: "has been staying home more than usual", streak: "on a streak of good days",
  allDone: "finished all of today's quests", evening: "evening, winding down", lateNight: "it is late at night",
  checkinLow: "said they feel low today", checkinGood: "said they feel good today", gentle: "a harder stretch lately, going easy",
  reachOut: "several things have shifted for two weeks",
};

// ---------- rules ----------
export function decide(ctx) {
  const { result, hour, doneToday = [], planned = [], checkin, streakDays = 0, companionId, name } = ctx;
  const c = byId(companionId), you = name ? `, ${name}` : "";
  const moved = new Set((result?.signals || []).filter(s => s.status !== "steady" && s.status !== "learning").map(s => s.key));
  let s = "morning";
  if (result?.learning) s = "learning";
  else if (result?.level >= 2) s = checkin && checkin <= 2 ? "reachOut" : "gentle";
  else if (checkin && checkin <= 2) s = "checkinLow";
  else if (planned.length && doneToday.length >= planned.length) s = "allDone";
  else if (hour >= 23 || hour < 5) s = "lateNight";
  else if (hour >= 19) s = "evening";
  else if (moved.has("sleepMin") || moved.has("midpoint") || moved.has("irregularity")) s = "shortSleep";
  else if (moved.has("homeStay") || moved.has("places") || moved.has("rangeKm")) s = "homeBound";
  else if (moved.has("steps") || moved.has("exercise")) s = "lowMove";
  else if (checkin >= 4) s = "checkinGood";
  else if (streakDays >= 3) s = "streak";

  const lines = {
    learning: `${c.hello}`,
    morning: `Good morning${you}! Three small quests are ready when you are.`,
    shortSleep: `Nights have been a bit short lately${you}. Let's keep today light and get some daylight.`,
    lowMove: `Fancy a little walk together${you}? Even ten minutes counts.`,
    homeBound: `How about a change of scenery today? A café, a park, a different street.`,
    streak: `${streakDays} good days in a row${you}! ${c.cheer}`,
    allDone: `All done for today! ${c.cheer}`,
    evening: `Evening${you}. Time to slow down. How about winding down a bit earlier tonight?`,
    lateNight: `It's getting late. Your rhythm will thank you for some sleep.`,
    checkinLow: `Thanks for telling me. I'm here with you. Want to try something small together?`,
    checkinGood: `Love that! Let's keep the good rhythm going.`,
    gentle: `${c.rest} Today, one small quest is plenty, and it still counts fully.`,
    reachOut: `${c.rest} Would it help to share how you are with someone you trust?`,
  };
  const exp = SCENARIOS[s].expressions[0];
  return { scenario: s, expression: exp, line: lines[s], focus: SCENARIOS[s].focus, gentle: s === "gentle" || s === "reachOut", ai: false };
}

// ---------- optional on-device model ----------
const BANNED = /\b(depress\w*|burn[- ]?out|disorder|diagnos\w*|symptom\w*|illness|anxiety|therap\w*|suicid\w*|medication|patient|clinical|insurance|premium)\b/i;

export async function directWithModel(engine, ctx, rule) {
  if (!engine) return rule;
  const c = byId(ctx.companionId);
  const allowed = SCENARIOS[rule.scenario].expressions;
  const sys = `You are ${c.name}, a cute companion in a wellbeing app. Personality: ${c.trait}.
Reply ONLY with JSON: {"expression": one of ${JSON.stringify(allowed)}, "line": "..."}.
The line: one or two short sentences, under 22 words, warm, playful, speaking to the user as "you".
Never mention illness, diagnosis, numbers, money or insurance. Never tell the user what they feel.`;
  const user = `Situation: ${FACT_WORDS[rule.scenario]}. Time: ${ctx.hour < 12 ? "morning" : ctx.hour < 18 ? "afternoon" : "evening"}.`;
  try {
    const r = await engine.chat.completions.create({ messages: [{ role: "system", content: sys }, { role: "user", content: user }], temperature: 0.6, max_tokens: 80, response_format: { type: "json_object" } });
    const j = JSON.parse(r.choices?.[0]?.message?.content || "{}");
    const line = String(j.line || "").trim();
    const words = line.split(/\s+/).length;
    if (!allowed.includes(j.expression) || !line || words > 26 || /\d/.test(line) || BANNED.test(line)) return rule;
    return { ...rule, expression: j.expression, line, ai: true };
  } catch { return rule; }
}
