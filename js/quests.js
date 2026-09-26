// Quests, points and the insurer goal.
// Fairness rule: rewards follow effort, not outcomes. On a hard stretch ("gentle mode"),
// one small quest makes the day count, so nobody loses their reward for having a hard month.
import { kv } from "./store.js";

export const QUESTS = [
  // movement
  { id: "walk10",    area: "move",    icon: "👟", title: "10-minute walk",               sub: "Any pace, anywhere",               auto: d => d?.steps >= 1500 },
  { id: "steps6k",   area: "move",    icon: "🚶", title: "Reach 6,000 steps",            sub: "Your phone counts them",           auto: d => d?.steps >= 6000 },
  { id: "stretch",   area: "move",    icon: "🤸", title: "Two-minute stretch",           sub: "Reach up, roll shoulders" },
  // daylight / outside
  { id: "daylight",  area: "outside", icon: "☀️", title: "10 minutes in daylight",       sub: "Morning light is best",            auto: d => d?.daylight >= 10 },
  { id: "newplace",  area: "outside", icon: "🧭", title: "Go somewhere different",       sub: "A café, a park, another street",   auto: d => d?.places >= 3 },
  // sleep
  { id: "winddown",  area: "sleep",   icon: "🌙", title: "Wind down by 23:00",           sub: "Screens away, lights low" },
  { id: "samewake",  area: "sleep",   icon: "⏰", title: "Wake at your usual time",      sub: "Even after a late night" },
  // connection
  { id: "message",   area: "connect", icon: "💬", title: "Message someone you like",     sub: "One line is enough" },
  { id: "call",      area: "connect", icon: "📞", title: "A short call with a friend",   sub: "Five minutes counts" },
  // calm
  { id: "breathe",   area: "calm",    icon: "🫧", title: "One minute of slow breathing", sub: "Breathe with your companion" },
  { id: "water",     area: "calm",    icon: "💧", title: "A glass of water",             sub: "Small, and it helps" },
];

// Gentle quests: tiny, achievable, and worth a full day on hard stretches.
export const GENTLE = [
  { id: "g-window",  area: "outside", icon: "🪟", title: "Open a window for two minutes", sub: "Fresh air, no effort",  gentle: true },
  { id: "g-step",    area: "outside", icon: "🚪", title: "Step outside for a moment",     sub: "Just the doorstep counts", gentle: true },
  { id: "g-emoji",   area: "connect", icon: "💛", title: "Send one emoji to someone",     sub: "No words needed",       gentle: true },
  { id: "g-breathe", area: "calm",    icon: "🫧", title: "Three slow breaths",            sub: "With your companion",   gentle: true },
  { id: "g-water",   area: "calm",    icon: "💧", title: "Drink some water",              sub: "That's it",             gentle: true },
];

export const ALL = [...QUESTS, ...GENTLE];
export const quest = id => ALL.find(q => q.id === id);

export const RULES = {
  pointsPerQuest: 10,
  dayBonus: 20,          // for an active day
  questsForActiveDay: 3,
  gentleQuestsForActiveDay: 1,
  activeDaysForGoal: 15, // per month; this is all the insurer ever learns (met / not met)
};

// Pick today's three quests from the areas where the rhythm has moved, plus variety.
export function planToday(dateIso, focusAreas = [], gentle = false) {
  const pool = gentle ? GENTLE : QUESTS;
  const seed = [...dateIso].reduce((a, c) => a + c.charCodeAt(0), 0);
  const pick = [];
  const order = [...new Set([...focusAreas, "move", "outside", "sleep", "connect", "calm"])];
  for (const area of order) {
    const opts = pool.filter(q => q.area === area && !pick.includes(q));
    if (opts.length) pick.push(opts[seed % opts.length]);
    if (pick.length === 3) break;
  }
  return pick.map(q => q.id);
}

// ---------- persistence ----------
export async function getLog() { return (await kv.get("questLog")) || {}; }       // { "2026-09-26": ["walk10", ...] }
export async function setLog(log) { await kv.set("questLog", log); }

export async function complete(dateIso, id) {
  const log = await getLog();
  const done = new Set(log[dateIso] || []); done.add(id); log[dateIso] = [...done];
  await setLog(log); return log;
}

export function isActiveDay(done = [], gentle = false) {
  const n = done.length, g = done.filter(id => id.startsWith("g-")).length;
  return n >= RULES.questsForActiveDay || (gentle && (g >= RULES.gentleQuestsForActiveDay || n >= 1));
}

export function monthStats(log, monthIso, gentleDays = new Set()) {
  let points = 0, active = 0;
  for (const [date, done] of Object.entries(log)) {
    if (!date.startsWith(monthIso)) continue;
    points += done.length * RULES.pointsPerQuest;
    if (isActiveDay(done, gentleDays.has(date))) { active++; points += RULES.dayBonus; }
  }
  return { points, active, goalMet: active >= RULES.activeDaysForGoal };
}

export function streak(log, todayIso, gentleDays = new Set()) {
  let n = 0; const d = new Date(todayIso + "T12:00:00");
  // today counts if already active; otherwise start from yesterday
  if (!isActiveDay(log[todayIso], gentleDays.has(todayIso))) d.setDate(d.getDate() - 1);
  for (;;) {
    const k = d.toISOString().slice(0, 10);
    if (!isActiveDay(log[k], gentleDays.has(k))) break;
    n++; d.setDate(d.getDate() - 1);
  }
  return n;
}

// The only thing an insurer ever receives: one row per month.
export function insurerView(log, gentleDays = new Set()) {
  const months = [...new Set(Object.keys(log).map(d => d.slice(0, 7)))].sort().reverse();
  return months.map(m => { const s = monthStats(log, m, gentleDays); return { month: m, goalMet: s.goalMet, points: s.points }; });
}

// Demo history so the rewards screen has a story: earlier months, and most of this month.
export function demoLog(todayIso, activeSoFar = 11) {
  const log = {}; const d = new Date(todayIso + "T12:00:00");
  const ids = QUESTS.map(q => q.id);
  for (let i = 1; i <= 75; i++) {
    const x = new Date(d); x.setDate(d.getDate() - i);
    const k = x.toISOString().slice(0, 10);
    const inThisMonth = k.slice(0, 7) === todayIso.slice(0, 7);
    const pActive = inThisMonth ? 0.75 : 0.72;
    if ((i * 7919) % 100 / 100 < pActive) log[k] = [ids[i % ids.length], ids[(i + 3) % ids.length], ids[(i + 6) % ids.length]];
    else if (i % 3) log[k] = [ids[i % ids.length]];
  }
  // trim this month to the requested number of active days
  const thisMonth = Object.keys(log).filter(k => k.startsWith(todayIso.slice(0, 7)) && log[k].length >= 3).sort();
  for (const k of thisMonth.slice(activeSoFar)) log[k] = log[k].slice(0, 1);
  return log;
}

export const INSURERS = [
  { id: "css", name: "CSS" }, { id: "helsana", name: "Helsana" }, { id: "swica", name: "SWICA" },
  { id: "visana", name: "Visana" }, { id: "sanitas", name: "Sanitas" }, { id: "groupemutuel", name: "Groupe Mutuel" },
  { id: "other", name: "Another insurer" },
];
