// The nine RYDM companions. Each is a personality, never a picture of the user.
// Colours drive the 3D model in mascot3d.js; lines give each one its own voice.

export const COMPANIONS = [
  { id: "pip",    name: "Pip",    trait: "Cheerful & positive",   species: "pip",
    colors: { body: "#FFD84D", belly: "#FFE89A", accent: "#7CC36B", cheek: "#FF9E8F" },
    hello: "Hi! I'm Pip. Let's make today a little brighter!", cheer: "Yay, you did it!", rest: "Slow days count too. I'm right here." },
  { id: "koko",   name: "Koko",   trait: "Calm & supportive",     species: "koala",
    colors: { body: "#A9ADB8", belly: "#E6E6EC", accent: "#F2C6CF", cheek: "#F6A9B4" },
    hello: "Hello, I'm Koko. We'll take things one calm step at a time.", cheer: "Lovely. That was a good step.", rest: "Rest is also progress." },
  { id: "lumi",   name: "Lumi",   trait: "Gentle & caring",       species: "bunny",
    colors: { body: "#FFFFFF", belly: "#FFF4F6", accent: "#FFC2D1", cheek: "#FFB3C4" },
    hello: "Hi, I'm Lumi. I'll be gentle with you, always.", cheer: "That made me so happy!", rest: "Be soft with yourself today." },
  { id: "bram",   name: "Bram",   trait: "Steady & loyal",        species: "bear",
    colors: { body: "#9A6A45", belly: "#D9B48C", accent: "#6B452B", cheek: "#E89A86" },
    hello: "I'm Bram. Whatever the day brings, I'm in your corner.", cheer: "Steady wins. Well done.", rest: "Even bears hibernate. You're allowed to slow down." },
  { id: "nori",   name: "Nori",   trait: "Curious & adventurous", species: "fox",
    colors: { body: "#F28A3C", belly: "#FFF3E6", accent: "#3B2A26", cheek: "#FFB08A" },
    hello: "Hey, I'm Nori! Let's discover something new today.", cheer: "Adventure unlocked!", rest: "Small adventures count. Even the window view." },
  { id: "mochi",  name: "Mochi",  trait: "Playful & silly",       species: "cat",
    colors: { body: "#BFC3CC", belly: "#FFFFFF", accent: "#6E737E", cheek: "#FFB1BD" },
    hello: "Mochi here! Ready to have some fun?", cheer: "Purr-fect!", rest: "Cats nap 16 hours a day. Just saying." },
  { id: "ollie",  name: "Ollie",  trait: "Chill & relaxed",       species: "penguin",
    colors: { body: "#2E3A55", belly: "#FFFFFF", accent: "#FFB02E", cheek: "#FFA9A0" },
    hello: "Yo, I'm Ollie. No rush, we'll glide through it.", cheer: "Smooth. Really smooth.", rest: "Chill days are part of the rhythm." },
  { id: "ziggy",  name: "Ziggy",  trait: "Energetic & fun",       species: "redpanda",
    colors: { body: "#D8552E", belly: "#5A3026", accent: "#FFFFFF", cheek: "#FFB08A" },
    hello: "Ziggy's here! Let's get moving!", cheer: "Boom! Nailed it!", rest: "Recharging is a move too." },
  { id: "willow", name: "Willow", trait: "Kind & thoughtful",     species: "deer",
    colors: { body: "#C98E5B", belly: "#F4E2CC", accent: "#8A5A36", cheek: "#F0A58E" },
    hello: "I'm Willow. I'll walk beside you, at your pace.", cheer: "That was kind to yourself.", rest: "Every season has quiet weeks." },
];

export const byId = id => COMPANIONS.find(c => c.id === id) || COMPANIONS[0];

// Expressions the 3D model can show.
export const EXPRESSIONS = ["happy", "joy", "calm", "caring", "sleepy", "surprised", "celebrate", "wave"];
