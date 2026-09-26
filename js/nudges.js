// Nudges, following the team's "how it all works" notes:
//  - informational first, then questions, then one "sustained change" note, then escalation;
//  - "you could", never "you should" (controlling language triggers reactance,
//    DOI 10.1177/2055207619832767);
//  - don't cause health anxiety: plain facts, the person's own range, no alarm words;
//  - "I'm ready to share my results" rather than "talk to someone".
import { fmtDur, fmtDelta } from "./engine.js";

// Escalation stages
//  0 steady | 1 something changed (informational) | 2 it's lasting (question)
//  3 several things changed for a while (sustained) | 4 still the same two weeks later (escalate)
export function stageOf(result, stage3Since, todayIso) {
  if (!result || result.learning) return 0;
  if (result.level >= 2) {
    if (stage3Since && daysBetween(stage3Since, todayIso) >= 14) return 4;
    return 3;
  }
  const shifts = result.signals.filter(s => s.status === "shift").length;
  if (shifts >= 1) return 2;
  if (result.level >= 1) return 1;
  return 0;
}
export function daysBetween(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000); }

const pct = (a, b) => Math.round(100 * Math.abs(a - b) / b);

// One informational line per moved signal, using last night / this week against the usual range.
function info(sig, days) {
  const lastWith = k => [...days].reverse().find(d => typeof d[k] === "number");
  const week = k => { const v = days.slice(-7).map(d => d[k]).filter(x => typeof x === "number"); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  switch (sig.key) {
    case "sleepMin": {
      const d = lastWith("sleepMin"); if (!d) return null;
      const low = sig.center - sig.scale, diff = low - d.sleepMin;
      if (sig.direction === "down" && diff > 10) return { title: "Sleep was shorter than usual", body: `You slept ${fmtDur(d.sleepMin)} last night, around ${fmtDelta(diff)} below your usual range.`, cta: "View trend", go: "journey" };
      return { title: "Your sleep has changed a little", body: `You've been sleeping around ${fmtDur(sig.recentMedian)} lately, compared with your usual ${fmtDur(sig.center)}.`, cta: "View trend", go: "journey" };
    }
    case "midpoint": return { title: "Your nights are running later", body: `The middle of your sleep has moved about ${fmtDelta(Math.abs(sig.recentMedian - sig.center))} later than usual.`, cta: "View trend", go: "journey" };
    case "irregularity": return { title: "Your sleep timing is less regular", body: `Your nights have varied more than usual this week.`, cta: "View trend", go: "journey" };
    case "steps": { const w = week("steps"); if (!w || pct(w, sig.center) < 15 || w > sig.center) return null; return { title: "Activity has dipped this week", body: `Your step count is ${pct(w, sig.center)}% below your normal weekly average.`, cta: "View activity", go: "journey" }; }
    case "exercise": return { title: "Fewer active minutes lately", body: `You've been a bit less active than your usual.`, cta: "View activity", go: "journey" };
    case "homeStay": return { title: "More time at home lately", body: `You've spent more of your days at home than usual this week.`, cta: "See quests", go: "quests" };
    case "places": case "rangeKm": return { title: "You've stayed closer to home", body: `You've been to fewer places than usual this week.`, cta: "See quests", go: "quests" };
    // Heart: softened on purpose (the team's rule: don't cause health anxiety). No bpm in the notification.
    case "restingHR": return { title: "Your body may be working harder", body: `Your resting heart rate has been a little above your usual lately. Rest and sleep could help.`, cta: "See details", go: "journey" };
    case "hrv": return { title: "Your recovery looks lower", body: `Your recovery signals have been below your usual. An easier day could help.`, cta: "See details", go: "journey" };
    case "daylight": return { title: "Less daylight lately", body: `You've had less time outside than usual. Ten minutes of daylight could help.`, cta: "See quests", go: "quests" };
    case "mood": return { title: "Your check-ins have been lower", body: `Your mood check-ins have been lower than your usual this week.`, cta: "Check in", go: "checkin" };
    case "pleasure": return { title: "Enjoying things a little less?", body: `Your check-ins show you've enjoyed things less than usual lately.`, cta: "Check in", go: "checkin" };
  }
  return null;
}

// Build the nudges for today. Newest and most important first.
export function buildNudges(result, stage, ctx) {
  const out = [];
  if (!result || result.learning) return out;
  const moved = result.signals.filter(s => s.status === "shift" || s.status === "mild").sort((a, b) => (b.status === "shift") - (a.status === "shift") || b.zMedian - a.zMedian);
  const days = result.days;

  if (stage >= 4) out.push({ kind: "escalate", title: "Things still feel different after two weeks",
    body: "It's been a couple of weeks since your routine changed, and it hasn't eased yet. You could talk it through with a professional. Your GP can prescribe sessions with a psychologist, covered by basic insurance.",
    ctas: [["See who's available now", "available"], ["I'm ready to share my results", "share"]] });
  if (stage >= 3) out.push({ kind: "sustained", title: "We've noticed a sustained change in your routine",
    body: `Your ${listAreas(moved)} have been different from your usual for the past ${Math.max(8, ctx.shiftDays || 8)} days. This doesn't tell us why, but it may be worth checking in.`,
    ctas: [["Answer a few questions", "checkin"], ["I'm ready to share my results", "share"], ["Review with a professional", "available"]] });
  if (stage >= 2) {
    const top = moved.find(s => s.status === "shift");
    const i = top && info(top, days);
    if (i) out.push({ kind: "question", title: "How have you been lately?", body: `${i.body} Noticed you haven't been feeling quite yourself. Want to answer a few questions to see what could help?`, ctas: [["Answer a few questions", "checkin"], ["I'm fine, thanks", "dismiss"]] });
  }
  for (const n of result.norms || []) out.push({ kind: "info", title: n.key === "sleepMin" ? "About your sleep" : n.key === "steps" ? "About your movement" : "About your check-ins", body: n.text + (n.key === "sleepMin" ? " You could try winding down 30 minutes earlier." : n.key === "steps" ? " A short walk could be a nice start." : ""), ctas: [["See quests", "quests"]] });
  const normKeys = new Set((result.norms || []).map(n => n.key));
  const askedKey = moved.find(s => s.status === "shift")?.key;
  for (const s of moved.filter(s => !normKeys.has(s.key) && s.key !== askedKey).slice(0, 3)) { const i = info(s, days); if (i && !out.some(o => o.title === i.title)) out.push({ kind: "info", title: i.title, body: i.body, ctas: [[i.cta, i.go]] }); }
  return out;
}

function listAreas(moved) {
  const names = { sleepMin: "sleep", midpoint: "sleep", irregularity: "sleep", steps: "activity", exercise: "activity", homeStay: "time out", places: "time out", rangeKm: "time out", restingHR: "recovery", hrv: "recovery", daylight: "daylight", mood: "mood", pleasure: "mood" };
  const a = [...new Set(moved.filter(s => s.status === "shift").map(s => names[s.key]).filter(Boolean))];
  if (!a.length) return "patterns";
  return a.length === 1 ? `${a[0]} patterns` : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]} patterns`;
}

// Who can help, and who is reachable right now.
export function availableNow(date = new Date()) {
  const h = date.getHours(), wd = date.getDay(), office = wd >= 1 && wd <= 5 && h >= 8 && h < 18;
  return [
    { name: "143 · La Main Tendue", what: "Talk to someone, anonymous", when: "24/7", now: true, tel: "143", web: "https://www.143.ch" },
    { name: "147 · Pro Juventute", what: "For young people up to 25", when: "24/7", now: true, tel: "147" },
    { name: "Your GP", what: "Can prescribe sessions with a psychologist (covered by basic insurance)", when: "Weekdays, office hours", now: office },
    { name: "Psyfinder (FSP)", what: "Find a psychologist near you, with profiles", when: "Book online any time", now: true, web: "https://www.psychologie.ch/en/psyfinder" },
    { name: "AGPsy directory, Geneva", what: "Geneva psychologists", when: "Book online any time", now: true, web: "https://www.agpsy.ch/members/search" },
    { name: "HUG psychiatric emergencies", what: "Urgent help in Geneva", when: "24/7", now: true, tel: "+41223723862", telLabel: "022 372 38 62" },
  ];
}
