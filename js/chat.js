// Tap-to-answer conversations. Every companion line is written by us, so the companion can
// never say something harmful. It is a friendly guide, not a therapist.
import { byId } from "./companions.js";

export function node(id, ctx) {
  const c = byId(ctx.companionId), you = ctx.name || "friend";
  const N = {
    start: {
      say: [`Hi ${you}! ${ctx.gentle ? c.rest : "How's your day going?"}`],
      choices: [["😊 Pretty good", "good"], ["😐 So-so", "meh"], ["😣 A bit stressed", "stressed"], ["😴 Tired", "tired"], ["Just wanted to say hi", "hi"]],
    },
    good: { say: [c.cheer, "Want a quest to keep the good rhythm going?"], choices: [["Show me a quest", "act:quests"], ["Maybe later", "end"]], mood: 4 },
    meh: { say: ["Thanks for being honest. So-so days are normal.", "Would something small help? A short walk, or a minute of breathing with me?"], choices: [["A short walk", "act:quest:walk10"], ["Breathe with you", "act:breathe"], ["Just chat", "chit"]], mood: 3 },
    stressed: { say: ["That sounds like a lot. I'm here with you.", "Would you like to try a short breathing exercise together?"], choices: [["Yes, let's try", "act:breathe"], ["Tell me something light", "chit"], ["Maybe later", "end"]], mood: 2 },
    tired: { say: ["Tired days happen. Your body might be asking for rest.", "Tonight, how about winding down a little earlier? I'll remind you."], choices: [["OK, remind me", "act:quest:winddown"], ["It's been going on a while", "while"], ["Thanks", "end"]], mood: 2 },
    while: {
      say: ["Thank you for telling me. When tiredness or stress sticks around for a couple of weeks, talking to someone can really help.", "You decide what happens next."],
      choices: [["Message someone I trust", "act:trusted"], ["See who I can talk to", "act:support"], ["Not now", "end"]],
    },
    hi: { say: [`Hi hi! ${c.hello.split(".")[0]}.`, "Anything you'd like to do?"], choices: [["Today's quests", "act:quests"], ["A fun fact", "chit"], ["Nothing, just saying hi", "end"]] },
    chit: { say: [FACTS[(new Date().getDate() + ctx.companionId.length) % FACTS.length]], choices: [["Ha, another one", "chit2"], ["Back to my day", "end"]] },
    chit2: { say: [FACTS[(new Date().getDate() + ctx.companionId.length + 3) % FACTS.length]], choices: [["Thanks!", "end"]] },
    end: { say: ["I'm always here. Tap me any time."], choices: [] },
  };
  return N[id] || N.end;
}

const FACTS = [
  "Otters hold hands while they sleep so they don't drift apart.",
  "Ten minutes of morning daylight helps your body clock find its rhythm.",
  "Cows have best friends and get stressed when they're apart.",
  "A short walk can clear your head as well as a coffee does.",
  "Koalas sleep up to 20 hours a day. Goals.",
  "Humming slowly can help your breathing calm down.",
  "Penguins give pebbles to the ones they like.",
];
