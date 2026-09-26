// Synthetic demo data. Ranges follow what consumer trackers report for working adults;
// the "gradual shift" persona plants the pattern described by Wang 2018 and Fang 2021:
// later and more irregular sleep, shorter sleep, fewer steps, fewer places, lower check-ins.
import { addDays, isoDate } from "./engine.js";

function rng(seed) { // mulberry32, so the demo is identical on every phone
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const PERSONAS = {
  shift: { label: "Gradual shift", blurb: "Six steady weeks, then three weeks where sleep slides later, movement drops and check-ins dip." },
  steady: { label: "Steady rhythm", blurb: "Eight ordinary weeks, with the normal ups and downs and one tagged trip." },
};

export function generate(persona = "shift", nDays = 63, endDate = isoDate(new Date())) {
  const r = rng(persona === "shift" ? 42 : 7);
  const start = addDays(endDate, -(nDays - 1));
  const driftStart = nDays - 18;
  const out = [];
  for (let i = 0; i < nDays; i++) {
    const date = addDays(start, i);
    const dow = new Date(date + "T12:00:00").getDay();
    const weekend = dow === 0 || dow === 6;
    // drift progress 0 -> 1 over the last three weeks (only for the shift persona)
    const p = persona === "shift" && i >= driftStart ? Math.min(1, (i - driftStart + 1) / 7) : 0;

    const onset = 680 + (weekend ? 35 : 0) + p * 85 + gauss(r) * (18 + p * 32);      // 23:20 -> ~00:45, noisier
    const sleepMin = 445 + (weekend ? 30 : 0) - p * 70 + gauss(r) * (24 + p * 10);    // 7h25 -> ~6h15
    const steps = (weekend ? 9400 : 8100) * (1 - p * 0.5) + gauss(r) * 1500;          // ~8.3k -> ~4.2k
    const places = Math.round(clamp((weekend ? 3.6 : 3) * (1 - p * 0.55) + gauss(r) * 0.9, 0, 8));
    const homeStay = Math.round(clamp((weekend ? 62 : 55) + p * 28 + gauss(r) * 5, 20, 98));     // % of day at home
    const rangeKm = Math.round(clamp((weekend ? 8 : 6) * (1 - p * 0.6) + gauss(r) * 1.1, 0.3, 40) * 10) / 10;
    const checked = r() < 0.82;
    const mood = checked ? Math.round(clamp(3.8 - p * 1.5 + gauss(r) * 0.6, 1, 5)) : undefined;
    const pleasure = checked ? Math.round(clamp(3.7 - p * 2 + gauss(r) * 0.55, 1, 5)) : undefined;

    const day = { date, onset: Math.round(onset), sleepMin: Math.round(sleepMin), steps: Math.max(300, Math.round(steps)), places, homeStay, rangeKm, source: "demo" };
    if (mood) { day.mood = mood; day.pleasure = pleasure; }
    if (persona === "steady" && i >= 30 && i <= 33) day.tags = ["travel"];
    if (persona === "shift" && i === 12) day.tags = ["ill"];
    out.push(day);
  }
  return out;
}

// ---------- Test profiles (for checking the whole path: data -> notes -> chatbot -> outcome) ----------
export const TEST_PROFILES = {
  lea:   { name: "Léa",   age: 29, label: "Test A · Léa: data shifted, struggling",      blurb: "Six steady weeks, then 3 weeks of shorter, later, irregular sleep, fewer steps, more time at home, lower HRV, higher resting heart rate, low mood and enjoyment check-ins." },
  marco: { name: "Marco", age: 34, label: "Test B · Marco: data shifted, feels fine",     blurb: "Sleep got short and late and steps dropped (new job, long commute), but his mood and enjoyment check-ins stay normal." },
  sofia: { name: "Sofia", age: 22, label: "Test C · Sofia: data steady, opens chat herself", blurb: "Sleep, steps, places and heart all look normal. She opens the chat on her own because she feels low." },
};
export function generateProfile(id, nDays = 63, endDate = isoDate(new Date())) {
  const r = rng({ lea: 11, marco: 22, sofia: 33 }[id] || 1);
  const start = addDays(endDate, -(nDays - 1)), drift = nDays - 21;
  const out = [];
  for (let i = 0; i < nDays; i++) {
    const date = addDays(start, i), dow = new Date(date + "T12:00:00").getDay(), we = dow === 0 || dow === 6;
    const p = id !== "sofia" && i >= drift ? Math.min(1, (i - drift + 1) / 7) : 0;       // ramps in over a week
    const feel = id === "lea" ? p : 0;                                                   // only Léa's check-ins drop
    const d = { date, source: "test" };
    d.onset = Math.round(680 + (we ? 30 : 0) + p * 95 + gauss(r) * (15 + p * 35));        // 23:20 -> ~01:00
    d.sleepMin = Math.round(450 + (we ? 25 : 0) - p * 95 + gauss(r) * 20);                // 7h30 -> ~5h55
    d.steps = Math.max(400, Math.round((we ? 9300 : 8300) * (1 - p * 0.55) + gauss(r) * 1100));
    d.exercise = Math.max(0, Math.round((we ? 40 : 30) * (1 - p * 0.7) + gauss(r) * 6));
    d.daylight = Math.max(3, Math.round((we ? 85 : 65) * (1 - p * 0.6) + gauss(r) * 12));
    d.restingHR = Math.round((58 + p * (id === "lea" ? 7 : 3) + gauss(r) * 1.5) * 10) / 10;
    d.hrv = Math.round((47 - p * (id === "lea" ? 15 : 6) + gauss(r) * 4) * 10) / 10;
    d.places = Math.round(clamp((we ? 3.5 : 3) * (1 - p * 0.55) + gauss(r) * 0.7, 1, 8));
    d.homeStay = Math.round(clamp((we ? 60 : 52) + p * 30 + gauss(r) * 5, 20, 98));
    d.rangeKm = Math.round(clamp((we ? 8 : 6) * (1 - p * 0.6) + gauss(r) * 1, 0.3, 40) * 10) / 10;
    if (r() < 0.85) {
      d.mood = Math.round(clamp(3.9 - feel * 2 + gauss(r) * 0.5, 1, 5));
      d.pleasure = Math.round(clamp(3.8 - feel * 2.1 + gauss(r) * 0.5, 1, 5));
    }
    out.push(d);
  }
  return out;
}
