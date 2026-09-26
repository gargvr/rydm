// RYDM check-in chatbot: collects what sensors can't, gently, and produces an analysable report.
//
// Design
//  - Core: WHO-5 Wellbeing Index (5 positively worded items, 0-5 each; raw < 13 = low wellbeing;
//    any item scored 0-1 = worth a closer look). Free to use with attribution:
//    Psychiatric Research Unit, Mental Health Centre North Zealand.
//  - Extension, only if WHO-5 is low or the phone data has flagged something: items for the DSM-5
//    depression symptoms nobody can track, with PHQ-9 style frequency answers over the last two weeks
//    (PHQ-9: Kroenke, Spitzer & Williams 2001; free to reproduce).
//  - The user never sees a score or a label. Other teams read the structured report.
//  - "Not sure" is always allowed: recorded as unknown (never as zero) and followed by a simpler question.
//  - Any sign of thoughts of death triggers the safety step immediately, whatever else is going on.

// ---------- answer scales ----------
const WHO5 = [ // 5..0
  ["All of the time", 5], ["Most of the time", 4], ["More than half the time", 3],
  ["Less than half the time", 2], ["Some of the time", 1], ["At no time", 0], ["Not sure 🤷", null],
];
const FREQ = [ // PHQ style 0..3
  ["Not at all", 0], ["A few days", 1], ["More than half the days", 2], ["Nearly every day", 3], ["Not sure 🤷", null],
];

// ---------- the question bank ----------
// dsm: which of the nine DSM-5 symptoms an item informs (1 low mood, 2 loss of interest, 3 appetite,
// 4 sleep, 5 slowed/restless, 6 fatigue, 7 worthlessness/guilt, 8 concentration, 9 thoughts of death).
// area: the five plain-language areas people see in summaries.
export const ITEMS = [
  // WHO-5 (over the last two weeks)
  { id: "w1", set: "who5", area: "mood", dsm: [1], lead: "First one's easy.", q: "Over the last two weeks, I've felt cheerful and in good spirits…", kind: "scale", opts: WHO5,
    unsure: { q: "No worries. If you had to pick a colour for your last two weeks?", opts: [["☀️ Mostly bright", 4], ["⛅ Mixed", 2], ["🌧️ Mostly grey", 1], ["🌑 Really dark", 0]] } },
  { id: "w2", set: "who5", area: "mood", dsm: [], lead: "", q: "…I've felt calm and relaxed", kind: "scale", opts: WHO5,
    unsure: { q: "How tense has your body felt, roughly?", opts: [["Loose, mostly relaxed", 4], ["A bit wound up", 2], ["Tense most days", 1], ["Knotted all the time", 0]] } },
  { id: "w3", set: "who5", area: "energy", dsm: [6], lead: "", q: "…I've felt active and full of energy", kind: "scale", opts: WHO5,
    unsure: { q: "On a 1 to 10 battery, where's your energy most days?", kind: "battery" } },
  { id: "w4", set: "who5", area: "energy", dsm: [4], lead: "", q: "…I've woken up feeling fresh and rested", kind: "scale", opts: WHO5,
    unsure: { q: "How do mornings usually feel?", opts: [["Refreshed 🌅", 4], ["Okay once I'm up", 3], ["Still tired", 1], ["I slept enough but I'm not rested", 1], ["It really varies", 2]] } },
  { id: "w5", set: "who5", area: "enjoyment", dsm: [2], lead: "Last of the quick ones.", q: "…my days have been filled with things that interest me", kind: "scale", opts: WHO5,
    unsure: { q: "When did something last make you properly smile?", opts: [["Today or yesterday", 4], ["This week", 3], ["Can't really remember", 1], ["Things feel a bit flat lately", 0]] } },
  // Extension (only when needed). PHQ-style: over the last two weeks, how often…
  { id: "d1", set: "ext", area: "mood", dsm: [1], lead: "Thanks for sticking with me. A few more, then we're done.", q: "How often have you felt down, empty or hopeless?", kind: "freq", opts: FREQ,
    unsure: { q: "Which feels closer?", opts: [["Mostly okay", 0], ["Some heavy days", 1], ["More heavy days than light ones", 2], ["Heavy almost every day", 3]] } },
  { id: "d3", set: "ext", area: "body", dsm: [3], lead: "", q: "How often has your appetite changed, eating much less or much more than usual?", kind: "freq", opts: FREQ,
    unsure: { q: "Have meals felt…", opts: [["Normal", 0], ["A bit off", 1], ["Like a chore, or I've been skipping", 2], ["I've been eating a lot more to cope", 2]] } },
  { id: "d5", set: "ext", area: "body", dsm: [5], lead: "", q: "Have you felt slowed down, or restless and unable to sit still?", kind: "freq", opts: FREQ, when: ctx => ctx.flags.movement,
    unsure: { q: "Has anyone mentioned you seem…", opts: [["Same as usual", 0], ["A bit slower", 2], ["More fidgety or on edge", 2], ["No one's said anything", 0]] } },
  { id: "d7", set: "ext", area: "mind", dsm: [7], lead: "This one's a bit personal. There's no wrong answer.", q: "How often have you felt bad about yourself, like you've let yourself or others down?", kind: "freq", opts: FREQ,
    unsure: { q: "How kind has your inner voice been lately?", opts: [["Pretty kind", 0], ["Mixed", 1], ["Quite harsh", 2], ["Really harsh", 3]] } },
  { id: "d8", set: "ext", area: "mind", dsm: [8], lead: "", q: "How often has it been hard to focus, like reading or watching something?", kind: "freq", opts: FREQ,
    unsure: { q: "When you watch a series, do you…", opts: [["Follow it fine", 0], ["Drift off sometimes", 1], ["Rewind a lot", 2], ["Can't really follow anymore", 3]] } },
  { id: "d9", set: "ext", area: "mind", dsm: [9], lead: "I ask everyone this, gently.", q: "Have you had thoughts that you'd be better off not here, or of hurting yourself?", kind: "freq", opts: [["No, not at all", 0], ["A few days", 1], ["More than half the days", 2], ["Nearly every day", 3], ["I'd rather not say", null]], safety: true },
];

const ACK = {
  good: ["Love hearing that 💛", "That's really good.", "Nice, keep that close.", "That's lovely."],
  mid: ["Thanks for being honest.", "Mixed weeks are so normal.", "Got it, thank you.", "That makes sense."],
  low: ["That sounds hard. Thank you for telling me.", "I hear you. That's a lot to carry.", "That's really valid. You're not alone in it.", "Thanks for trusting me with that."],
  unsure: ["Totally fine not to know. Let's try it another way.", "Honestly, most people aren't sure. Here's an easier one."],
};
const pick = (a, i) => a[i % a.length];

// ---------- guided check-in ----------
// ctx: { flags: {sleep, movement, recovery, mood}, source: "self"|"app", bioFlagged: bool, name }
export function planQuestions(ctx) {
  return ITEMS.filter(it => it.set === "who5");
}
export function extensionNeeded(answers, ctx) {
  const w = who5(answers);
  return ctx.bioFlagged || w.raw < 13 || w.lowItems > 0 || w.unknown >= 2;
}
export function extensionQuestions(ctx) { return ITEMS.filter(it => it.set === "ext" && (!it.when || it.when(ctx))); }

export function ackFor(item, value, i) {
  if (value == null) return pick(ACK.unsure, i);
  const max = item.set === "who5" ? 5 : 3, good = item.set === "who5" ? value >= 4 : value === 0;
  const low = item.set === "who5" ? value <= 1 : value >= 2;
  return good ? pick(ACK.good, i) : low ? pick(ACK.low, i) : pick(ACK.mid, i);
}

function who5(ans) {
  const vals = ["w1", "w2", "w3", "w4", "w5"].map(id => ans[id]);
  const known = vals.filter(v => typeof v === "number");
  const raw = known.length ? Math.round(known.reduce((a, b) => a + b, 0) * 5 / known.length) : 25; // pro-rated
  return { raw, percent: raw * 4, lowItems: known.filter(v => v <= 1).length, unknown: vals.length - known.length };
}

// ---------- analysis ----------
// Combines answers with the bio flags into the nine DSM-5 symptoms. A symptom "counts" when the chat
// answer is clear (WHO-5 item <= 1, or "more than half the days" or worse), or when the phone data
// flagged it AND the chat supports it (WHO-5 <= 2 or "a few days").
export function analyse(answers, ctx) {
  const w = who5(answers);
  const A = id => answers[id];
  const sym = {
    1: { name: "Low mood", chat: A("d1") >= 2 || (A("d1") == null && A("w1") != null && A("w1") <= 1), bio: ctx.flags.mood },
    2: { name: "Loss of interest", chat: A("w5") != null && A("w5") <= 1, bio: ctx.flags.mood },
    3: { name: "Appetite change", chat: A("d3") >= 2, bio: false },
    4: { name: "Sleep problems", chat: A("w4") != null && A("w4") <= 1, bio: ctx.flags.sleep, support: A("w4") != null && A("w4") <= 2 },
    5: { name: "Slowed or restless", chat: A("d5") >= 2, bio: ctx.flags.movement, support: A("d5") >= 1 },
    6: { name: "Tiredness", chat: A("w3") != null && A("w3") <= 1, bio: ctx.flags.recovery, support: A("w3") != null && A("w3") <= 2 },
    7: { name: "Feeling worthless or guilty", chat: A("d7") >= 2, bio: false },
    8: { name: "Hard to concentrate", chat: A("d8") >= 2, bio: false },
    9: { name: "Thoughts of death or self-harm", chat: A("d9") >= 1, bio: false },
  };
  const out = {};
  let met = 0;
  for (const [k, s] of Object.entries(sym)) {
    const byBio = s.bio && (s.support ?? false);
    const status = s.chat || byBio ? "met" : answeredFor(+k, answers) ? "not_met" : "unknown";
    if (status === "met") met++;
    out[k] = { symptom: s.name, status, from: s.chat && byBio ? "chat+data" : s.chat ? "chat" : byBio ? "data" : answeredFor(+k, answers) ? "chat" : "none" };
  }
  const core = out[1].status === "met" || out[2].status === "met";
  const phqItems = ["d1", "d3", "d5", "d7", "d8", "d9"].map(A).filter(v => typeof v === "number");
  const safety = (A("d9") ?? 0) >= 1;
  const indicatorsMet = met >= 5 && core;              // DSM rule: 5 of 9 including low mood or loss of interest
  const lowWellbeing = w.raw < 13;
  const chatConcern = indicatorsMet || lowWellbeing || (core && met >= 3);

  // Outcome rules from the team brief
  let outcome;
  if (safety) outcome = "safety";                                             // always first
  else if (chatConcern && ctx.bioFlagged) outcome = "hotline_and_referral";   // data bad + chat bad
  else if (chatConcern && ctx.source === "self") outcome = "suggest_professional"; // came on their own
  else if (chatConcern) outcome = "suggest_professional";
  else if (ctx.bioFlagged) outcome = "lifestyle";                              // feels fine, data isn't
  else outcome = "all_good";

  return {
    version: 1, at: new Date().toISOString(), source: ctx.source,
    who5: { raw: w.raw, percent: w.percent, lowItems: w.lowItems, unknownItems: w.unknown },
    dsm5: out, indicatorsMet: met, coreSymptomMet: core, safetyFlag: safety,
    bioFlags: ctx.flags, outcome,
    answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v ?? "unknown"])),
    note: "Wellbeing check, not a diagnosis. For clinical use this would require validation and certification.",
  };
}
function answeredFor(k, ans) {
  const map = { 1: ["d1", "w1"], 2: ["w5"], 3: ["d3"], 4: ["w4"], 5: ["d5"], 6: ["w3"], 7: ["d7"], 8: ["d8"], 9: ["d9"] };
  return map[k].some(id => typeof ans[id] === "number");
}

// What the user reads at the end: warm, plain, no score.
export function closing(report, ctx) {
  const hard = Object.values(report.dsm5).filter(s => s.status === "met").map(s => s.symptom.toLowerCase());
  const areas = hard.slice(0, 3).join(", ").replace(/, ([^,]*)$/, " and $1");
  const flagTips = {
    sleep: "Screens off 30 minutes before bed, and the same wake-up time every day, even weekends.",
    movement: "A 10-minute walk in daylight tomorrow morning. Small counts.",
    recovery: "An easier day: water, an early night, and one thing you enjoy.",
    mood: "Message one person you like today, even just an emoji.",
  };
  const tips = Object.entries(ctx.flags).filter(([, v]) => v).map(([k]) => flagTips[k]).filter(Boolean);
  switch (report.outcome) {
    case "safety": return { say: ["Thank you for telling me that. It took courage, and it matters.", "You deserve support with this right now, from a real person. You don't have to go through it alone."], actions: ["hotline", "professional"] };
    case "hotline_and_referral": return { say: [`Thank you for answering so honestly. It sounds like ${areas || "things"} have been really hard lately, and your routine has been showing it too.`, "That's a lot to carry on your own. Talking to someone can really help, and it's a normal, strong step."], actions: ["hotline", "professional", "share"] };
    case "suggest_professional": return { say: [`Thank you for opening up. It sounds like ${areas || "things"} have been weighing on you.`, ctx.source === "self" ? "You came here because part of you wanted some support, and that's a good instinct. A psychologist could really help you sort through it." : "Talking it through with a professional could really help. You decide when."], actions: ["professional", "share", "hotline_soft"] };
    case "lifestyle": return { say: ["Glad to hear you're feeling mostly okay 💛", "Your routine has been a bit off lately though. A small change could help:", ...tips.slice(0, 2)], actions: ["quests"] };
    default: return { say: ["You're doing well. Thanks for checking in with yourself 🌿", "I'm here whenever you want to chat."], actions: [] };
  }
}

// ---------- free chat (track A) ----------
export const FREE = {
  start: { say: n => [`Hey ${n}! What brings you here?`], chips: [["Just exploring 👋", "explore"], ["Something's on my mind", "mind"], ["Can't sleep well", "sleep"], ["Feeling stressed", "stress"], ["Feeling low", "low"], ["Quick check-in", "CHECKIN"]] },
  explore: { say: () => ["Welcome! I'm your companion. I can chat, suggest small quests, breathe with you, or do a quick check-in on how you're doing.", "What sounds fun?"], chips: [["Tell me a fun fact", "fact"], ["Breathe with me", "BREATHE"], ["Back to start", "start"]] },
  fact: { say: () => [FACTS[Math.floor(Math.random() * FACTS.length)]], chips: [["Another one!", "fact"], ["Back to start", "start"]] },
  mind: { say: () => ["Thanks for sharing that with me.", "Is it more about…"], chips: [["Work or studies", "mind_work"], ["People in my life", "mind_people"], ["My health", "mind_health"], ["Honestly, not sure", "mind_unsure"]] },
  mind_work: { say: () => ["Work stress can take over everything, it makes sense you'd feel it.", "One thing that often helps: write tomorrow's top 3 before you stop for the day, and let the rest wait."], chips: [["That might help", "better"], ["It's more than that", "persist"]] },
  mind_people: { say: () => ["Relationships can weigh so much, even when we love the people involved.", "Sometimes just naming it to someone you trust takes some of the weight off."], chips: [["Yeah, maybe", "better"], ["It's been going on a while", "persist"]] },
  mind_health: { say: () => ["Worrying about your health is exhausting on its own.", "A GP visit can often settle a lot of the what-ifs. You could jot down your questions first."], chips: [["Good idea", "better"], ["It's more than that", "persist"]] },
  mind_unsure: { say: () => ["That's completely okay. Sometimes it's just a general heaviness without a clear reason.", "Would a quick check-in help us understand it together?"], chips: [["Sure, let's do it", "CHECKIN"], ["Maybe later", "start"]] },
  sleep: { say: () => ["Rough nights make everything harder. What's keeping you up?"], chips: [["My thoughts won't stop", "sleep_thoughts"], ["I'm on my phone late", "sleep_screen"], ["I wake up in the night", "sleep_wake"], ["I sleep but I'm not rested", "sleep_rest"], ["Not sure", "sleep_unsure"]] },
  sleep_thoughts: { say: () => ["A racing mind at night is so common.", "Try a 'worry list' before bed: write it down so your brain doesn't have to hold it. Then slow breathing."], chips: [["Breathe with me", "BREATHE"], ["It's been weeks like this", "persist"], ["Thanks", "better"]] },
  sleep_screen: { say: () => ["Totally relatable. Phones are designed to keep us scrolling.", "You could try putting it on charge outside the bedroom, or turning the screen to grayscale after 22:00."], chips: [["I'll try that", "better"], ["It's been weeks like this", "persist"]] },
  sleep_wake: { say: () => ["Waking up in the night is draining.", "If you're awake for more than 20 minutes, getting up and doing something calm in dim light often helps more than lying there."], chips: [["Okay", "better"], ["It's been weeks like this", "persist"]] },
  sleep_rest: { say: () => ["That feeling of sleeping enough but not being rested is really common, and really frustrating.", "It can come from stress, irregular timing, or just a heavy stretch. A quick check-in could show what's going on."], chips: [["Let's do the check-in", "CHECKIN"], ["Maybe later", "start"]] },
  sleep_unsure: { say: () => ["No problem. Keeping the same wake-up time every day, even weekends, is one of the simplest things that helps most people."], chips: [["Thanks", "better"], ["It's been weeks like this", "persist"]] },
  stress: { say: () => ["Stress piles up quietly, then all at once. It makes sense you're feeling it.", "Want to try one minute of slow breathing together?"], chips: [["Yes, let's", "BREATHE"], ["It's more than stress", "persist"], ["Maybe later", "start"]] },
  low: { say: () => ["I'm really glad you told me. Feeling low is hard, and you don't have to explain it perfectly.", "Would you answer a few gentle questions with me? It helps us see what could help."], chips: [["Okay", "CHECKIN_SELF"], ["I just want to talk", "low_talk"]] },
  low_talk: { say: () => ["Of course. I'm here, no pressure.", "Sometimes the smallest thing helps a little: water, fresh air, or a message to someone who gets you."], chips: [["I'll try one", "better"], ["It still feels heavy", "persist"]] },
  better: { say: () => ["I'm glad. Be gentle with yourself today 💛", "Anything else on your mind?"], chips: [["No, I'm good", "bye"], ["Back to start", "start"]] },
  persist: { say: () => ["Thank you for telling me. When something's been hanging around for a while, it deserves proper attention.", "Would a quick check-in be okay? It takes about two minutes."], chips: [["Okay, let's do it", "CHECKIN_SELF"], ["I'd rather talk to someone", "HELP"], ["Not now", "start"]] },
  bye: { say: () => ["Anytime. Tap me whenever you want to chat."], chips: [["Start again", "start"]] },
};
const FACTS = [
  "Otters hold hands while they sleep so they don't drift apart.",
  "Ten minutes of morning daylight helps your body clock find its rhythm.",
  "Cows have best friends and get stressed when they're apart.",
  "Koalas sleep up to 20 hours a day. Goals.",
  "Humming slowly can help your breathing calm down.",
  "Penguins give pebbles to the ones they like.",
];
