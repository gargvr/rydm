import { kv, allDays, putDays, upsertDay, getDay, clearDays, wipeAll } from "./store.js";
import { analyze, isoDate, addDays, fmtDur, fmtClock } from "./engine.js";
import { generate, TEST_PROFILES, generateProfile } from "./demo.js";
import { COMPANIONS, byId } from "./companions.js";
import { createMascot, renderThumbnail } from "./mascot3d.js";
import { ALL, quest, planToday, getLog, setLog, complete, isActiveDay, monthStats, streak, insurerView, demoLog, INSURERS, RULES } from "./quests.js";
import { decide, directWithModel } from "./director.js";
import { FREE, ITEMS, planQuestions, extensionNeeded, extensionQuestions, ackFor, analyse, closing } from "./bot.js";
import { stageOf, buildNudges, availableNow, daysBetween } from "./nudges.js";
import { readAppleHealth } from "./appleHealth.js";
import { isNative, native, platform } from "./native.js";
import { hasWebGPU, loadModel, isLoaded, getEngine } from "./slm.js";

const $app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => isoDate(new Date());
const SPEED = Math.max(0.5, Math.min(4, +new URLSearchParams(location.search).get("speed") || 1)); // demo recordings only
const HOUR = new URLSearchParams(location.search).get("hour"); // demo recordings only
const hour = () => (HOUR != null && HOUR !== "" ? +HOUR : new Date().getHours());

const DEFAULTS = {
  onboarded: false, step: 0, name: "", companion: "pip",
  consent: { steps: true, sleep: true, heart: false, daylight: true, places: false, checkin: true, agreedAt: null },
  insurer: null, insurerLinkedAt: null, trusted: { name: "", contact: "" }, persona: null,
};
const S = { nudges: [], stage: 0, banner: null, s: null, days: [], result: null, log: {}, plan: null, gentleDays: new Set(), dir: null, tab: "home", sheet: null, chat: null, journey: "week", thumbs: {}, busy: false };

// ---------- one persistent 3D companion, moved between screens ----------
const host = document.createElement("div"); host.style.cssText = "width:100%;height:100%";
let mascot = null;
function ensureMascot() { if (!mascot) mascot = createMascot(host, { companion: S.s.companion, expression: "happy", onTap: onMascotTap }); return mascot; }
function mountMascot() { const st = document.querySelector(".sheet [data-stage]") || document.querySelector("[data-stage]"); if (st) { st.appendChild(host); ensureMascot(); } }
function thumb(id, exp = "happy", size = 200) { const k = `${id}:${exp}:${size}`; return S.thumbs[k] ||= renderThumbnail(id, exp, size); }
let tapCount = 0;
function onMascotTap() {
  tapCount++;
  if (S.tab === "home" && S.s.onboarded && tapCount % 3 === 0) { S.tab = "chat"; startFree(); }
}

// ---------- data ----------
async function save(patch) { S.s = { ...S.s, ...patch }; await kv.set("settings", S.s); }
const sources = () => ["steps", "sleep", "heart", "daylight", "places", "checkin"].filter(k => S.s.consent[k]);

async function liveSync() {
  if (!isNative || S.s.persona !== "Apple Health (live)") return;
  const days = await native.sync(90);
  if (days?.length) {
    const have = new Map((await allDays()).map(d => [d.date, d]));
    for (const d of days) { if (d.moodHealth != null && have.get(d.date)?.mood == null) d.mood = Math.round(d.moodHealth); delete d.moodHealth; delete d.sleepSrc; delete d.stepsSrc; }
    await putDays(days);
  }
}
async function refresh() {
  await liveSync();
  S.days = await allDays();
  let anchor = await kv.get("anchor");
  S.result = analyze(S.days, sources(), { anchor });
  // Freeze the baseline while a change lasts, so a slow slide can't become the new "usual".
  if (!S.result.learning) {
    if (S.result.level >= 1 && !anchor) { anchor = S.result.window?.baseTo; await kv.set("anchor", anchor); }
    if (S.result.level === 0 && anchor) { anchor = null; await kv.del("anchor"); S.result = analyze(S.days, sources()); }
  }
  let since = await kv.get("stage3Since");
  S.stage = stageOf(S.result, since, today());
  if (S.stage >= 3 && !since) { since = today(); await kv.set("stage3Since", since); }
  if (S.stage < 3 && since) { since = null; await kv.del("stage3Since"); }
  S.stage = stageOf(S.result, since, today());
  S.nudges = buildNudges(S.result, S.stage, { shiftDays: shiftDays() });
  S.log = await getLog();
  S.gentleDays = new Set((await kv.get("gentleDays")) || []);
  const td = S.days.find(d => d.date === today()) || {};
  const doneToday = S.log[today()] || [];
  let rule = decide({ result: S.result, hour: hour(), doneToday, planned: S.plan?.ids || [], checkin: td.mood, streakDays: streak(S.log, today(), S.gentleDays), companionId: S.s.companion, name: S.s.name });
  // today's plan: rebuilt when the day or the mode changes
  let plan = await kv.get("plan");
  if (!plan || plan.date !== today() || plan.gentle !== rule.gentle) {
    plan = { date: today(), gentle: rule.gentle, ids: planToday(today(), rule.focus, rule.gentle) };
    await kv.set("plan", plan);
  }
  S.plan = plan;
  if (rule.gentle && !S.gentleDays.has(today())) { S.gentleDays.add(today()); await kv.set("gentleDays", [...S.gentleDays]); }
  // quests your data already proves
  for (const id of plan.ids) { const q = quest(id); if (q?.auto && q.auto(td) && !doneToday.includes(id)) S.log = await complete(today(), id); }
  rule = decide({ result: S.result, hour: hour(), doneToday: S.log[today()] || [], planned: plan.ids, checkin: td.mood, streakDays: streak(S.log, today(), S.gentleDays), companionId: S.s.companion, name: S.s.name });
  S.dir = rule;
  if (isLoaded()) directWithModel(getEngine(), { hour: hour(), companionId: S.s.companion }, rule).then(d => { S.dir = d; applyDirector(); });
  document.body.classList.toggle("night", hour() >= 20 || hour() < 6);
  render();
  maybeBanner().then(() => setTimeout(maybeInvite, 1800));
}
function shiftDays() { const off = S.result?.signals?.filter(x => x.status === "shift").map(x => x.offDays || 0) || []; return off.length ? Math.max(...off) : 0; }
async function maybeInvite() {
  if (S.stage < 2 || S.sheet || S.tab === "chat" || S.chat?.mode === "guided") return false;
  const snooze = await kv.get("inviteSnooze"), last = await kv.get("lastCheckin");
  if ((snooze && snooze > today()) || (last && daysBetween(last, today()) < 7)) return false;
  S.sheet = { type: "invite" }; render(); return true;
}
async function maybeBanner() {
  const top = S.nudges[0]; if (!top || S.sheet) return;
  const seen = (await kv.get("seenNudges")) || {}, key = `${today()}:${top.kind}:${top.title}`;
  if (seen[key]) return;
  seen[key] = 1; await kv.set("seenNudges", seen);
  showBanner(top);
  if (isNative) native.notify(top.title, top.body, key);
}
function showBanner(n) {
  document.querySelector(".banner")?.remove();
  const el = document.createElement("button"); el.className = "banner"; el.setAttribute("data-act", "openNotes");
  el.innerHTML = `<img src="${thumb(S.s.companion, "caring", 80)}" alt=""><span><span class="bh"><b>RYDM</b><span>now</span></span><b>${esc(n.title)}</b><span class="bb">${esc(n.body)}</span></span>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("out"), 6500); setTimeout(() => el.remove(), 7000);
}
function applyDirector() {
  if (!mascot || !S.dir) return;
  mascot.setExpression(S.dir.expression);
  const b = document.querySelector(".bubble");
  if (b) b.innerHTML = `${esc(S.dir.line)}${S.dir.ai ? `<span class="ai">✨ written on your phone</span>` : ""}`;
}

// ---------- helpers ----------
function toast(t) { const el = document.createElement("div"); el.className = "toast"; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2200); }
const greet = () => { const h = hour(); return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const month = () => today().slice(0, 7);
const monthName = m => new Date(m + "-15").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const NAV = [["home", "🏠", "Home"], ["quests", "⭐", "Quests"], ["chat", "💬", "Chat"], ["journey", "📈", "Journey"], ["support", "🌿", "Support"]];
function nav() { return `<nav class="nav" aria-label="Main"><div>${NAV.map(([id, i, l]) => `<button data-act="tab" data-arg="${id}" ${S.tab === id ? 'aria-current="page"' : ""}><span class="i">${i}</span>${l}</button>`).join("")}</div></nav>`; }
function header(title, sub) {
  return `<div class="top"><div><div class="hello">${title}</div>${sub ? `<p class="muted small">${sub}</p>` : ""}</div>
    <div class="row" style="gap:8px"><button class="bell" data-act="openNotes" aria-label="Notifications">🔔${S.nudges.length ? `<i>${S.nudges.length}</i>` : ""}</button>
    <button class="avatar" data-act="profile" aria-label="Your profile"><img alt="" src="${thumb(S.s.companion, "happy", 120)}"></button></div></div>`;
}
function spark(vals, color = "var(--lav-ink)") {
  const v = vals.map(x => (typeof x === "number" ? x : null)); const nums = v.filter(x => x != null);
  if (nums.length < 2) return "";
  const lo = Math.min(...nums), hi = Math.max(...nums) || 1;
  return `<div class="bars">${v.map(x => `<i style="height:${x == null ? 8 : 20 + 80 * ((x - lo) / ((hi - lo) || 1))}%;background:${color}"></i>`).join("")}</div>`;
}
const last = (k, n = 7) => S.days.slice(-n).map(d => d[k]);
const avg = a => { const n = a.filter(x => typeof x === "number"); return n.length ? n.reduce((s, x) => s + x, 0) / n.length : null; };

// ================= screens =================
function home() {
  const td = S.days.find(d => d.date === today()) || {};
  const done = S.log[today()] || [];
  const st = streak(S.log, today(), S.gentleDays), ms = monthStats(S.log, month(), S.gentleDays);
  const qs = S.plan.ids.map(quest).filter(Boolean);
  const r = S.result;
  const n3 = S.nudges.find(n => n.kind === "escalate") || S.nudges.find(n => n.kind === "sustained");
  return `${header(`${greet()},<br>${esc(S.s.name || "friend")} ${hour() >= 20 || hour() < 6 ? "🌙" : "☀️"}`)}
  <div class="stack-lg">
    <div class="scene"><div class="sun"></div><div class="bubble">${esc(S.dir?.line || "")}</div><div class="stage" data-stage></div>
      <span class="flower" style="left:22px">🌼</span><span class="flower" style="right:30px;bottom:30px">🌷</span></div>

    <div class="row wrap"><span class="chip">🔥 ${st} day${st === 1 ? "" : "s"}</span><span class="chip">⭐ ${ms.points} pts</span>${S.s.insurer ? `<span class="chip">🛡️ ${ms.active}/${RULES.activeDaysForGoal} days</span>` : ""}</div>

    ${S.plan.gentle ? `<div class="gentle-banner"><b>Gentle mode is on 🌙</b><span class="small">Your quests are smaller for a while. One is enough for today to count fully, rewards included.</span></div>` : ""}

    <div class="card stack">
      <div class="row between"><h3>Today's check-in</h3><span class="tiny muted">10 seconds</span></div>
      <p class="small muted">How are you feeling today?</p>
      <div class="faces">${["😣", "😕", "😐", "🙂", "😄"].map((f, i) => `<button class="face" data-act="checkin" data-arg="${i + 1}" aria-pressed="${td.mood === i + 1}" aria-label="Mood ${i + 1} of 5">${f}</button>`).join("")}</div>
      <div class="face-labels"><span>Very low</span><span>Very good</span></div>
      ${td.mood ? `<p class="small muted" style="margin-top:6px">And how much did you enjoy things today?</p>
      <div class="faces">${["🌧️", "🌥️", "⛅", "🌤️", "🌈"].map((f, i) => `<button class="face" data-act="pleasure" data-arg="${i + 1}" aria-pressed="${td.pleasure === i + 1}" aria-label="Enjoyment ${i + 1} of 5">${f}</button>`).join("")}</div>
      <div class="face-labels"><span>Not at all</span><span>A lot</span></div>` : ""}
    </div>

    <div class="stack">
      <div class="row between"><h2>Today's quests</h2><button class="link small" data-act="tab" data-arg="quests">All quests</button></div>
      ${qs.map(q => questRow(q, done.includes(q.id))).join("")}
    </div>

    ${n3 ? `<div class="card stack" style="background:var(--peach)"><h3>${esc(n3.title)}</h3><p class="small">${esc(n3.body)}</p>
      <div class="row wrap">${n3.ctas.map(([l, a], i) => `<button class="btn ${i ? "ghost " : ""}small" data-act="cta" data-arg="${a}">${esc(l)}</button>`).join("")}</div></div>` : ""}

    <div class="stack"><h2>Your rhythm this week</h2>
      <div class="tiles">
        ${tile("🌙", "Sleep", avg(last("sleepMin")) != null ? fmtDur(avg(last("sleepMin"))) : "–", spark(last("sleepMin")), "avg per night")}
        ${tile("👟", "Steps", avg(last("steps")) != null ? Math.round(avg(last("steps"))).toLocaleString("en-CH").replace(/’/g, "'") : "–", spark(last("steps"), "var(--good)"), "avg per day")}
        ${tile("😊", "Mood", avg(last("mood")) != null ? (Math.round(avg(last("mood")) * 10) / 10) + " / 5" : "–", spark(last("mood"), "var(--warn)"), "check-ins")}
        ${tile("🧭", "Places", avg(last("places")) != null ? (Math.round(avg(last("places")) * 10) / 10) + " a day" : "–", spark(last("places"), "#5A9BD5"), "different spots")}
      </div></div>
  </div>`;
}
function tile(i, l, v, s, d) { return `<div class="tile"><span class="l">${i} ${l}</span><span class="v">${v}</span>${s}<span class="d">${d}</span></div>`; }
function questRow(q, done) {
  return `<button class="quest ${done ? "done" : ""}" data-act="quest" data-arg="${q.id}" aria-pressed="${done}">
    <span class="ic">${q.icon}</span><span class="t"><b>${esc(q.title)}</b><span>${esc(q.sub)}${q.auto ? " · checks itself" : ""}</span></span>
    <span class="pts">+${RULES.pointsPerQuest}</span><span class="check">${done ? "✓" : ""}</span></button>`;
}

function quests() {
  const ms = monthStats(S.log, month(), S.gentleDays), st = streak(S.log, today(), S.gentleDays);
  const done = S.log[today()] || [];
  const ins = INSURERS.find(i => i.id === S.s.insurer);
  const view = insurerView(S.log, S.gentleDays).slice(0, 4);
  const pct = Math.min(100, Math.round(100 * ms.active / RULES.activeDaysForGoal));
  return `${header("Quests & rewards", "Small steps, real rewards")}
  <div class="stack-lg">
    <div class="card row" style="gap:16px">
      <div class="ring" style="--p:${pct}"><div><b>${ms.active}</b><span>of ${RULES.activeDaysForGoal} days</span></div></div>
      <div class="stack" style="gap:6px"><h3>${monthName(month())}</h3>
        <p class="small muted">${ms.goalMet ? "Goal reached! 🎉 Your reward is unlocked." : `${RULES.activeDaysForGoal - ms.active} more active days to unlock this month's reward.`}</p>
        <div class="row wrap"><span class="chip">⭐ ${ms.points}</span><span class="chip">🔥 ${st}</span></div></div>
    </div>

    <div class="stack"><h2>Today</h2>${S.plan.ids.map(quest).map(q => questRow(q, done.includes(q.id))).join("")}
      <p class="tiny muted">An active day is ${RULES.questsForActiveDay} quests, or ${RULES.gentleQuestsForActiveDay} in gentle mode. Effort counts, not results.</p></div>

    <div class="stack"><h2>More quests</h2>${ALL.filter(q => !S.plan.ids.includes(q.id) && !q.gentle).slice(0, 6).map(q => questRow(q, done.includes(q.id))).join("")}</div>

    <div class="card stack">
      <div class="row between"><h3>Insurance rewards</h3><span class="demo-tag">Demo</span></div>
      ${ins ? `<div class="insurer"><div class="logo">${esc(ins.name.slice(0, 4).toUpperCase())}</div><div class="stack" style="gap:2px"><b>${esc(ins.name)}</b><span class="tiny muted">Linked ${esc(S.s.insurerLinkedAt || "")} · supplementary insurance</span></div></div>
        <p class="small">Each month you reach ${RULES.activeDaysForGoal} active days, your insurer can give you a reward or a discount on supplementary insurance. Basic insurance premiums can't change by law.</p>
        <h3 style="margin-top:6px">What ${esc(ins.name)} sees</h3>
        <table class="sees"><thead><tr><th>Month</th><th>Goal met</th><th>Points</th></tr></thead><tbody>
        ${view.map(v => `<tr><td>${monthName(v.month)}</td><td>${v.goalMet ? "✅ Yes" : "— Not yet"}</td><td>${v.points}</td></tr>`).join("")}</tbody></table>
        <p class="tiny muted">That's everything. Never your steps, sleep, places, mood or what your companion notices.</p>
        <button class="btn ghost small" data-act="unlink">Unlink insurer</button>`
      : `<p class="small">Link your supplementary insurance to turn active months into rewards. Your insurer only ever learns "goal met: yes or no".</p><button class="btn" data-act="linkInsurer">Link my insurer</button>`}
    </div>
  </div>`;
}

function chat() {
  const c = byId(S.s.companion);
  if (!S.chat) startFree(false);
  const ch = S.chat, p = ch.pending;
  const prog = ch.mode === "guided" && ch.total && p?.item ? `<div class="prog"><span>Question ${Math.min(ch.done + 1, ch.total)} of ${ch.total}</span><i style="--p:${Math.round(100 * ch.done / ch.total)}%"></i></div>` : "";
  let answers = "";
  if (!ch.typing && p) {
    if (p.type === "chips") answers = `<div class="choices">${p.opts.map(([l], i) => `<button class="choice" data-act="ans" data-arg="${i}">${esc(l)}</button>`).join("")}</div>`;
    if (p.type === "scale") answers = `<div class="choices scale6">${p.opts.map(([l], i) => `<button class="choice ${l.startsWith("Not sure") ? "soft" : ""}" data-act="ans" data-arg="${i}">${esc(l)}</button>`).join("")}</div>`;
    if (p.type === "freq") answers = `<div class="choices">${p.opts.map(([l], i) => `<button class="choice ${/Not sure|rather not/.test(l) ? "soft" : ""}" data-act="ans" data-arg="${i}">${esc(l)}</button>`).join("")}</div>`;
    if (p.type === "battery") answers = `<div class="battery">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button data-act="ans" data-arg="${n}" aria-label="${n} of 10">${n}</button>`).join("")}</div><div class="face-labels"><span>🪫 Empty</span><span>Full 🔋</span></div>`;
  }
  return `<div class="top"><div class="row"><img src="${thumb(c.id, "happy", 120)}" alt="" style="width:48px;height:48px"><div><b>${esc(c.name)}</b><div class="tiny muted">${ch.mode === "guided" ? "Check-in · only you see your answers" : esc(c.trait)}</div></div></div>
    ${ch.mode === "guided" ? `<button class="link small" data-act="endGuided">Stop</button>` : ""}</div>
  ${prog}
  <div class="msgs">${ch.msgs.map(m => m.me ? `<div class="msg me">${esc(m.text)}</div>` : `<div class="msgrow"><img src="${thumb(c.id, m.exp || "happy", 80)}" alt=""><div class="msg them">${esc(m.text)}</div></div>`).join("")}
  ${ch.typing ? `<div class="msgrow"><img src="${thumb(c.id, "happy", 80)}" alt=""><div class="msg them typing"><i></i><i></i><i></i></div></div>` : ""}</div>
  ${answers}
  ${!ch.typing && ch.actions?.length ? `<div class="choices">${ch.actions.map(a => ({
      hotline: `<a class="choice warm" href="tel:143">📞 Call 143 · La Main Tendue (24/7)</a>`,
      hotline_soft: `<p class="tiny muted" style="text-align:center">If it ever gets heavy, 143 is there 24/7, anonymous.</p>`,
      professional: `<button class="choice" data-act="available">See who's available now</button>`,
      share: `<button class="choice" data-act="share">I'm ready to share my results</button>`,
      quests: `<button class="choice" data-act="tab" data-arg="quests">Show me today's quests</button>`,
      restart: `<button class="choice soft" data-act="restartChat">Back to start</button>`,
    }[a] || "")).join("")}</div>` : ""}
  <p class="tiny muted" style="text-align:center;margin-top:14px">${esc(c.name)} is a friendly guide, not a therapist, and this isn't a diagnosis. In an emergency call 144.</p>`;
}

// ---------- conversation engine ----------
function say(lines, exp = "happy", then) {
  S.chat.typing = true; S.chat.pending = null; S.chat.actions = null; render(); scrollEnd();
  let i = 0;
  const next = () => {
    if (i >= lines.length) { S.chat.typing = false; then && then(); render(); scrollEnd(); return; }
    setTimeout(() => { S.chat.msgs.push({ text: lines[i], exp }); i++; render(); scrollEnd(); next(); }, Math.min(1400, 450 + lines[i].length * 12) / SPEED);
  };
  next();
}
function startFree(go = true) { S.chat = { mode: "free", msgs: [], pending: null }; if (go) freeNode("start"); }
function freeNode(id) {
  const n = FREE[id] || FREE.start;
  say(n.say(S.s.name || "friend"), id === "low" || id === "persist" ? "caring" : id === "better" ? "joy" : "happy", () => { S.chat.pending = { type: "chips", opts: n.chips, free: true }; });
}
function bioFlags() {
  // Only clear shifts count as data flags for the chat; small wobbles don't.
  const moved = new Set((S.result?.signals || []).filter(x => x.status === "shift").map(x => x.key));
  const has = (...k) => k.some(x => moved.has(x));
  const flags = { sleep: has("sleepMin", "midpoint", "irregularity"), movement: has("steps", "exercise", "homeStay", "places", "rangeKm"), recovery: has("hrv", "restingHR"), mood: has("mood", "pleasure") };
  return { flags, bioFlagged: S.stage >= 2 || (S.result?.signals || []).some(x => x.status === "shift") };
}
function startGuided(source) {
  const { flags, bioFlagged } = bioFlags();
  const ctx = { flags, bioFlagged, source, name: S.s.name };
  const queue = planQuestions(ctx);
  const prev = S.chat?.mode === "free" ? S.chat.msgs : [];
  S.chat = { mode: "guided", msgs: prev, ctx, queue, answers: {}, done: 0, total: queue.length, extended: false };
  S.tab = "chat"; S.sheet = null;
  const areas = Object.entries(flags).filter(([, v]) => v).map(([k]) => ({ sleep: "sleep", movement: "activity", recovery: "energy", mood: "check-ins" }[k]));
  const intro = source === "app"
    ? [`Hey ${S.s.name || "you"} 💛 I noticed your ${areas.length ? areas.slice(0, 2).join(" and ") : "routine"} ${areas.length > 1 ? "have" : "has"} been a bit different lately.`, "Mind answering a few quick questions? It helps us see what could make things easier. \"Not sure\" is always a fine answer."]
    : ["Let's do a quick check-in together.", "Five short questions, maybe a few more. There are no wrong answers, and \"not sure\" is always okay."];
  window.scrollTo({ top: 0 });
  say(intro, "caring", () => askNext());
}
function askNext() {
  const ch = S.chat;
  if (ch.done >= ch.queue.length) {
    if (!ch.extended && extensionNeeded(ch.answers, ch.ctx)) {
      ch.extended = true; const ext = extensionQuestions(ch.ctx); ch.queue.push(...ext); ch.total = ch.queue.length;
    } else return finishGuided();
  }
  const item = ch.queue[ch.done];
  const lines = [item.lead, item.q].filter(Boolean);
  say(lines, "calm", () => { ch.pending = { type: item.kind === "scale" ? "scale" : item.kind, opts: item.opts, item }; });
}
function answer(idx) {
  const ch = S.chat, p = ch.pending; if (!p) return;
  if (p.free) { const [label, next] = p.opts[+idx]; ch.msgs.push({ me: true, text: label });
    if (next === "CHECKIN") return startGuided("self");
    if (next === "CHECKIN_SELF") return startGuided("self");
    if (next === "BREATHE") { S.sheet = { type: "breathe" }; render(); runBreath(); ch.pending = { type: "chips", opts: FREE.better.chips, free: true }; return; }
    if (next === "HELP") { ch.pending = null; say(["Of course. Reaching out is a strong step.", "Here's who you can talk to, some of them right now."], "caring", () => { ch.actions = ["professional", "hotline", "restart"]; }); return; }
    return freeNode(next);
  }
  const item = p.item;
  let label, value;
  if (p.type === "battery") { const n = +idx; label = `${n}/10 🔋`; value = n >= 9 ? 5 : n >= 7 ? 4 : n >= 5 ? 3 : n >= 3 ? 2 : n === 2 ? 1 : 0; }
  else { [label, value] = p.opts[+idx]; }
  ch.msgs.push({ me: true, text: label });
  const isFollow = !!p.follow;
  if (value == null && !isFollow && item.unsure) { // not sure: ask it another way
    say([ackFor(item, null, ch.done), item.unsure.q], "caring", () => { ch.pending = { type: item.unsure.kind || "chips", opts: item.unsure.opts, item, follow: true }; });
    return;
  }
  ch.answers[item.id] = value;
  ch.done++;
  if (item.safety && value != null && value >= 1) return finishGuided();   // safety first, stop asking
  say([ackFor(item, value, ch.done)], value != null && ((item.set === "who5" && value <= 1) || (item.set === "ext" && value >= 2)) ? "caring" : "happy", () => askNext());
}
async function finishGuided() {
  const ch = S.chat;
  const report = analyse(ch.answers, ch.ctx);
  ch.report = report;
  const reports = (await kv.get("reports")) || []; reports.unshift(report); await kv.set("reports", reports.slice(0, 20));
  await kv.set("lastCheckin", today());
  window.RYDM_lastReport = report;   // what the screening and referral modules read
  const end = closing(report, ch.ctx);
  say(end.say, report.outcome === "all_good" ? "joy" : "caring", () => { ch.pending = null; ch.actions = [...end.actions, "restart"]; ch.mode = "free"; });
}
const scrollEnd = () => requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));

function journey() {
  const n = S.journey === "week" ? 7 : S.journey === "month" ? 30 : 63;
  const days = S.days.slice(-n), prev = S.days.slice(-2 * n, -n);
  const cmp = (k) => { const a = avg(days.map(d => d[k])), b = avg(prev.map(d => d[k])); return a != null && b ? (a - b) / b : null; };
  const hi = [];
  const sl = cmp("sleepMin"), stp = cmp("steps"), md = cmp("mood"), pl = cmp("places");
  if (sl > 0.03) hi.push(["🌙", "You slept more", `+${Math.round(sl * 100)}%`]);
  if (stp > 0.03) hi.push(["👟", "You moved more", `+${Math.round(stp * 100)}%`]);
  if (md > 0.03) hi.push(["😊", "Your mood has been brighter", `+${Math.round(md * 100)}%`]);
  if (pl > 0.03) hi.push(["🧭", "You explored more places", `+${Math.round(pl * 100)}%`]);
  const q = Object.entries(S.log).filter(([k]) => days.some(d => d.date === k)).reduce((s, [, v]) => s + v.length, 0);
  hi.push(["⭐", "Quests completed", `${q}`]);
  if (hi.length === 1) hi.unshift(["🌱", "Every day you show up counts", "Keep going"]);
  return `${header("Your journey")}
  <div class="stack-lg">
    <div class="seg">${[["week", "Week"], ["month", "Month"], ["all", "All time"]].map(([k, l]) => `<button data-act="journey" data-arg="${k}" aria-pressed="${S.journey === k}">${l}</button>`).join("")}</div>
    <div class="card stack"><h3>Mood trend</h3>${lineChart(days.map(d => d.mood), 1, 5, "var(--good)", ["😣", "😐", "😄"])}</div>
    <div class="card stack"><h3>Sleep</h3>${lineChart(days.map(d => d.sleepMin != null ? d.sleepMin / 60 : null), 4, 10, "var(--lav-ink)", ["4h", "7h", "10h"])}</div>
    <div class="stack"><h2>Highlights</h2>${hi.map(([i, t, v]) => `<div class="card row"><span style="font-size:24px">${i}</span><div class="stack" style="gap:0"><b>${t}</b><span class="small" style="color:var(--good);font-weight:800">${v}</span></div></div>`).join("")}</div>
  </div>`;
}
function lineChart(vals, lo, hi, color, labels) {
  const W = 320, H = 120, L = 30, P = 8, pts = vals.map((v, i) => [L + (i / Math.max(1, vals.length - 1)) * (W - L - P), v == null ? null : H - 16 - ((v - lo) / (hi - lo)) * (H - 28)]);
  let d = "", on = false; for (const [x, y] of pts) { if (y == null) continue; d += `${on ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; on = true; }
  if (!d) return `<p class="small muted">Not enough data yet.</p>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend">
    ${labels.map((t, i) => `<text x="0" y="${H - 16 - (i / (labels.length - 1)) * (H - 28) + 4}">${t}</text>`).join("")}
    <path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.filter(p => p[1] != null).slice(-1).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${color}"/>`).join("")}</svg>`;
}

function support() {
  return `${header("Support & resources")}
  <div class="stack-lg">
    <div class="cats">${[["🌿", "Stress", "breathe"], ["🌙", "Sleep", "sleepTips"], ["🎯", "Focus", "focus"], ["💛", "Mood", "moodTips"]].map(([i, l, a]) => `<button class="cat" data-act="res" data-arg="${a}"><div>${i}</div>${l}</button>`).join("")}</div>
    <div class="card"><h3 style="margin-bottom:6px">Recommended for you</h3>
      ${[["🫧", "Breathe with " + byId(S.s.companion).name, "One minute, reduces stress in the moment", "breathe"], ["🌙", "Tips for better sleep", "Build a gentle evening routine", "sleepTips"], ["💼", "Managing work stress", "Practical steps for busy weeks", "workTips"], ["🤝", "When to talk to a professional", "Signs and next steps", "pro"]]
        .map(([i, t, s, a]) => `<button class="lrow" data-act="res" data-arg="${a}"><span class="ic">${i}</span><span class="t"><b>${t}</b><span>${s}</span></span>›</button>`).join("")}</div>
    <div class="card stack"><h3>Someone in your corner</h3>
      <p class="small muted">${S.s.trusted.name ? `${esc(S.s.trusted.name)} is your trusted person. They only hear from you if you choose.` : "Add someone you trust. RYDM never contacts them for you."}</p>
      <div class="row"><button class="btn small" data-act="share">Share how I'm doing</button><button class="btn ghost small" data-act="trusted">${S.s.trusted.name ? "Change" : "Add person"}</button></div></div>
    <button class="card lrow" data-act="available"><span class="ic">🟢</span><span class="t"><b>Who's available now</b><span>Helplines, your GP, psychologists near you</span></span>›</button>
    <div class="card stack" style="background:var(--peach)"><h3>Talk to someone now</h3>
      <p class="small">Free and confidential, any time.</p>
      <div class="row wrap"><a class="btn small" href="tel:143" style="text-decoration:none">143 · La Main Tendue</a><a class="btn ghost small" href="tel:144" style="text-decoration:none">144 Emergency</a></div>
      <p class="tiny muted">Under 25? Call 147 (Pro Juventute). Geneva psychiatric emergencies: 022 372 38 62.</p></div>
  </div>`;
}

function profile() {
  const c = byId(S.s.companion), ins = INSURERS.find(i => i.id === S.s.insurer);
  return `<div class="top"><button class="link" data-act="tab" data-arg="home">‹ Back</button></div>
  <div class="stack-lg">
    <div class="card row" style="gap:14px"><img src="${thumb(c.id, "joy", 160)}" alt="" style="width:84px;height:84px"><div><h2>${esc(S.s.name || "You")}</h2><p class="muted small">with ${esc(c.name)} · ${esc(c.trait)}</p></div></div>
    <div class="card">
      ${[["🐣", "My companion", c.name, "changeCompanion"], ["🤝", "Trusted person", S.s.trusted.name || "Not set", "trusted"], ["🛡️", "Insurance", ins ? ins.name : "Not linked", ins ? "tab-quests" : "linkInsurer"], ["🔒", "Privacy & data", "What stays on your phone", "privacy"], ["✨", "On-device AI", isLoaded() ? "On" : "Off", "ai"], ["📊", "Your data", S.s.persona ? S.s.persona : "None yet", "dataSheet"], ["🧪", "Demo controls", "Stories, notifications, skip ahead", "demo"]]
        .map(([i, t, s, a]) => `<button class="lrow" data-act="${a}"><span class="ic">${i}</span><span class="t"><b>${t}</b><span>${esc(s)}</span></span>›</button>`).join("")}
    </div>
    <p class="tiny muted" style="text-align:center">RYDM prototype · Geneva {ai} Hackathon 2026 · Your data never leaves this device.</p>
  </div>`;
}

// ================= onboarding =================
function onboarding() {
  const st = S.s.step || 0, c = byId(S.s.companion);
  const dots = `<div class="onb-dots">${[0, 1, 2, 3, 4, 5].map(i => `<i class="${i === st ? "on" : ""}"></i>`).join("")}</div>`;
  const back = st ? `<button class="link" data-act="back">‹ Back</button>` : "";
  const V = [
    () => `<div class="stack" style="text-align:center;padding-top:20px"><div class="logo">RY<em>D</em>M</div><p class="muted" style="font-size:18px">Move with your rhythm</p></div>
      <div class="welcome-stage" data-stage></div>
      <div class="stack"><button class="btn" data-act="next">Get started →</button><p class="tiny muted" style="text-align:center">Tap the companion. It likes that.</p></div>`,
    () => `${back}<div class="stack" style="text-align:center"><h1>Choose your companion</h1><p class="muted small">Pick a friend who'll be with you on your journey.</p></div>
      <div style="height:210px" data-stage></div>
      <div class="pick">${COMPANIONS.map(x => `<button data-act="pickCompanion" data-arg="${x.id}" aria-pressed="${x.id === c.id}"><img src="${thumb(x.id, "happy", 176)}" alt=""><b>${x.name}</b><span>${x.trait}</span></button>`).join("")}</div>
      <button class="btn" data-act="next">Continue with ${c.name}</button>`,
    () => `${back}<div style="height:220px" data-stage></div><div class="stack" style="text-align:center"><h1>${esc(c.hello)}</h1><p class="muted">What should I call you?</p></div>
      <input type="text" id="f-name" placeholder="Your first name" value="${esc(S.s.name)}" autocomplete="given-name">
      <button class="btn" data-act="saveName">Nice to meet you</button>`,
    () => `${back}<div class="stack"><h1>What can ${esc(c.name)} notice?</h1><p class="muted small">Everything stays on your phone. Turn on what you're comfortable with.</p></div>
      <div class="card">${[["steps", "👟 Movement", "Steps and active minutes"], ["sleep", "🌙 Sleep", "How long and how regular"], ["daylight", "☀️ Time outside", "Minutes in daylight (Apple Watch)"], ["places", "🧭 Places", "How many places, never where"], ["heart", "❤️ Heart rhythm", "Resting heart rate (watch)"], ["checkin", "😊 Check-ins", "One tap a day"]]
        .map(([k, t, d]) => `<div class="trow"><div class="txt"><b>${t}</b><span class="small muted">${d}</span></div><label class="toggle"><input type="checkbox" data-act="consent" data-arg="${k}" ${S.s.consent[k] ? "checked" : ""} aria-label="${t}"><span></span></label></div>`).join("")}</div>
      <div class="note">💛 ${esc(c.name)} also notices when your rhythm shifts for a while and gently helps you find support. Only you ever see this.</div>
      <label class="row small" style="align-items:flex-start"><input type="checkbox" id="agree" ${S.s.consent.agreedAt ? "checked" : ""} data-act="agree" style="width:20px;height:20px;margin-top:2px"><span>I agree that RYDM processes these health-related signals on my phone only, to suggest quests and notice changes in my own rhythm. I can change this any time.</span></label>
      <button class="btn" data-act="next" ${S.s.consent.agreedAt ? "" : "disabled"}>Continue</button>`,
    () => `${back}<div class="stack"><h1>Get rewarded 🛡️</h1><p class="muted small">Link your supplementary health insurance and turn active months into rewards. Optional.</p></div>
      <div class="card">${INSURERS.map(i => `<button class="lrow" data-act="chooseInsurer" data-arg="${i.id}"><span class="ic" style="font-size:12px;font-weight:900;color:#2B5C8A;background:var(--sky)">${esc(i.name.slice(0, 4).toUpperCase())}</span><span class="t"><b>${esc(i.name)}</b></span>${S.s.insurer === i.id ? "✓" : "›"}</button>`).join("")}</div>
      <div class="note"><b>Your insurer only ever sees:</b> "Goal met this month: yes or no" and your points. Never your steps, sleep, places, mood or anything ${esc(c.name)} notices. <span class="demo-tag">Demo, no real connection</span></div>
      <button class="btn" data-act="next">${S.s.insurer ? "Continue" : "Skip for now"}</button>`,
    () => `${back}<div style="height:200px" data-stage></div><div class="stack"><h1>Last step</h1><p class="muted small">${esc(c.name)} needs a few weeks to learn your usual rhythm. For the demo, pick a story:</p></div>
      <button class="card lrow" data-act="startDemo" data-arg="steady"><span class="ic">🌤️</span><span class="t"><b>A good rhythm</b><span>Steady weeks, quests and rewards</span></span>›</button>
      <button class="card lrow" data-act="startDemo" data-arg="shift"><span class="ic">🌙</span><span class="t"><b>A harder stretch</b><span>Sleep and movement slide for three weeks: see gentle mode</span></span>›</button>
      <button class="card lrow" data-act="dataSheet"><span class="ic">🍎</span><span class="t"><b>Use my Apple Health data</b><span>${platform === "ios" ? "Connect live, read on this iPhone" : "Import your Health export, read on this phone"}</span></span>›</button>
      <button class="card lrow" data-act="startDemo" data-arg="fresh"><span class="ic">🌱</span><span class="t"><b>Start fresh</b><span>Begin today with check-ins</span></span>›</button>`,
  ];
  return `<div class="stack-lg">${dots}${V[st]()}</div>`;
}

// ================= sheets =================
function sheetHTML() {
  const s = S.sheet; if (!s) return "";
  const c = byId(S.s.companion);
  let b = "";
  if (s.type === "celebrate") b = `<div style="height:240px" data-stage></div><div class="stack" style="text-align:center"><h2>${esc(c.cheer)}</h2><p class="muted">+${RULES.pointsPerQuest} points${s.active ? ` · Active day! +${RULES.dayBonus} bonus` : ""}</p><button class="btn" data-act="close">Yay!</button></div>`;
  if (s.type === "breathe") b = `<h2 style="text-align:center">Breathe with ${esc(c.name)}</h2><div class="breath-stage" data-stage></div><p class="breath-label" id="blabel">Get comfy</p><p class="small muted" style="text-align:center">In 4 · hold 4 · out 4 · hold 4</p><button class="btn ghost" data-act="breathDone">Done</button>`;
  if (s.type === "chat") b = `<div class="stack">${chat()}</div>`;
  if (s.type === "dataSheet") {
    const isDemo = /^(A good rhythm|A harder stretch|Fresh start)$/.test(S.s.persona || "");
    const n = S.days.length, first = S.days[0]?.date, last = S.days[n - 1]?.date;
    b = `<h2>Your data</h2>
    <div class="card stack small"><p><b>Now using:</b> ${esc(S.s.persona || "Nothing yet")}${isDemo ? ` <span class="demo-tag">Demo</span>` : ""}</p>
      ${n ? `<p class="muted">${n} days, ${esc(first)} to ${esc(last)}. Stored only on this phone.</p>` : ""}</div>
    ${platform === "ios" ? `<div class="card stack"><h3>Connect Apple Health (live) 🍎</h3>
      <p class="small muted">RYDM reads your Health data directly on this iPhone and keeps it up to date. Nothing leaves the phone. Notes arrive as real notifications.</p>
      <button class="btn" data-act="liveHealth">${S.s.persona === "Apple Health (live)" ? "Sync now" : "Connect Apple Health"}</button>
      <button class="btn ghost small" data-act="livePlaces">Also notice places and time at home</button></div>` : ""}
    <div class="card stack"><h3>${platform === "ios" ? "Or import a Health export" : "Use real Apple Health data"}</h3>
      <p class="small muted">On the iPhone: Health app › your profile picture › <b>Export All Health Data</b>. Save the file, then choose it here. It's read on this phone; nothing is uploaded.</p>
      <label class="btn" style="position:relative">Choose export.zip or export.xml<input type="file" id="ah-file" accept=".zip,.xml,application/zip,text/xml" data-act="ahFile" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
      <p class="small" id="ah-status">${s.status ? esc(s.status) : ""}</p>
      <p class="tiny muted">Reads the last five months of steps, sleep, active minutes, time in daylight, resting heart rate and heart rate variability.</p></div>
    ${n && isDemo ? `<button class="btn ghost" data-act="removeDemo">Remove demo data</button><p class="tiny muted" style="text-align:center">Your companion, name and settings stay. Only the example days, quests and points go.</p>` : ""}
    ${n && !isDemo ? `<button class="btn ghost" data-act="removeDemo">Remove this data</button>` : ""}
    ${!n || !isDemo ? `<button class="btn ghost" data-act="demo">Load demo data instead</button>` : ""}`;
  }
  if (s.type === "invite") b = `<div style="height:200px" data-stage></div><div class="stack" style="text-align:center"><h2>Hey ${esc(S.s.name || "you")}, can I check in? 💛</h2><p class="muted">Noticed you haven't been feeling quite yourself lately. Want to answer a few questions to see what could help? About two minutes.</p></div>
    <button class="btn" data-act="startCheckin" data-arg="app">Sure, let's do it</button><button class="btn ghost" data-act="inviteLater">Remind me later</button><button class="link" data-act="inviteNo" style="justify-self:center">Not now</button>`;
  if (s.type === "report") { const r = window.RYDM_lastReport; b = `<h2>Check-in report</h2><p class="small muted">What the screening and referral modules receive from the chat. Stored on this phone only. The user never sees a score.</p><pre style="white-space:pre-wrap;font:12px/1.45 ui-monospace,Menlo,monospace;background:var(--card);padding:12px;border-radius:14px;max-height:55vh;overflow:auto">${esc(r ? JSON.stringify(r, null, 2) : "No check-in yet.")}</pre>`; }
  if (s.type === "notes") b = `<h2>Notes from ${esc(c.name)}</h2>${S.nudges.length ? S.nudges.map(n => `<div class="card stack note-${n.kind}"><span class="tiny muted">${{ info: "Something changed", question: "A quick question", sustained: "Worth checking in", escalate: "Next step" }[n.kind]}</span><h3>${esc(n.title)}</h3><p class="small">${esc(n.body)}</p><div class="row wrap">${n.ctas.map(([l, a], i) => `<button class="btn ${i ? "ghost " : ""}small" data-act="cta" data-arg="${a}">${esc(l)}</button>`).join("")}</div></div>`).join("") : `<p class="muted">Nothing new. Your rhythm looks close to your usual. 🌿</p>`}
    <p class="tiny muted">Notes compare you only with your own usual pattern and general healthy ranges. They are not a diagnosis.</p>`;
  if (s.type === "available") b = availableHTML();
  if (s.type === "linkInsurer") b = `<h2>Link your insurer</h2><div class="card">${INSURERS.map(i => `<button class="lrow" data-act="chooseInsurer" data-arg="${i.id}"><span class="ic" style="font-size:12px;font-weight:900;color:#2B5C8A;background:var(--sky)">${esc(i.name.slice(0, 4).toUpperCase())}</span><span class="t"><b>${esc(i.name)}</b></span>›</button>`).join("")}</div><p class="tiny muted">Demo. No real connection is made and nothing is sent.</p>`;
  if (s.type === "changeCompanion") b = `<h2>Choose your companion</h2><div class="pick">${COMPANIONS.map(x => `<button data-act="pickCompanion" data-arg="${x.id}" aria-pressed="${x.id === c.id}"><img src="${thumb(x.id, "happy", 176)}" alt=""><b>${x.name}</b><span>${x.trait}</span></button>`).join("")}</div><button class="btn" data-act="close">Done</button>`;
  if (s.type === "trusted") b = `<h2>Your trusted person</h2><p class="small muted">Someone who'd walk beside you. They never hear from RYDM, only from you.</p><input type="text" id="f-tname" placeholder="Their name" value="${esc(S.s.trusted.name)}"><input type="text" id="f-tcontact" placeholder="How you reach them (optional)" value="${esc(S.s.trusted.contact)}"><button class="btn" data-act="saveTrusted">Save</button>`;
  if (s.type === "share") b = `<h2>Share how you're doing</h2><p class="small muted">Edit it any way you like. Nothing is sent until you choose where.</p><textarea id="share-text" rows="7" style="width:100%;font:15px var(--font);border-radius:14px;border:1.5px solid var(--line);padding:12px;background:var(--card);color:var(--ink)">${esc(shareText())}</textarea><button class="btn" data-act="doShare">Share…</button>`;
  if (s.type === "privacy") b = `<h2>Privacy & data</h2><div class="card stack small">
      <p><b>On this phone only:</b> your steps, sleep, places, heart rhythm, check-ins, chats and anything ${esc(c.name)} notices.</p>
      <p><b>Your insurer gets:</b> goal met yes/no and points per month. Nothing else.</p>
      <p><b>We get:</b> nothing. RYDM has no server that could receive your data.</p>
      <p><b>The AI</b> (optional) runs on your phone and only helps ${esc(c.name)} choose words and expressions. It never decides anything about your health.</p></div>
      <button class="btn ghost" data-act="wipe">Delete everything</button>`;
  if (s.type === "ai") b = `<h2>On-device AI ✨</h2><p class="small muted">Let a small AI model on your phone help ${esc(c.name)} react to your day in its own words. About 880 MB, downloaded once, Wi-Fi recommended. It only sees words like "short sleep" or "quest done", never your data.</p>
      ${isLoaded() ? `<p><b>It's on.</b></p>` : hasWebGPU() ? `<button class="btn" data-act="loadAI">Download and turn on</button><p class="tiny muted" id="aiprog"></p>` : `<p class="small">This device can't run it yet. ${esc(c.name)} will use its own lines.</p>`}`;
  if (s.type === "demo") b = `<h2>Demo controls</h2><button class="card lrow" data-act="startDemo" data-arg="steady"><span class="ic">🌤️</span><span class="t"><b>A good rhythm</b></span>›</button><button class="card lrow" data-act="startDemo" data-arg="shift"><span class="ic">🌙</span><span class="t"><b>A harder stretch (gentle mode)</b></span>›</button>
    <h3 style="margin-top:6px">Test profiles</h3>
    ${Object.entries(TEST_PROFILES).map(([id, t]) => `<button class="card lrow" data-act="loadProfile" data-arg="${id}"><span class="ic">🧪</span><span class="t"><b>${esc(t.label)}</b><span>${esc(t.blurb)}</span></span>›</button>`).join("")}
    <h3 style="margin-top:6px">Tools</h3>
    <button class="card lrow" data-act="demoNote" data-arg="0"><span class="ic">🔔</span><span class="t"><b>Show the top notification</b><span>As it would arrive on the phone</span></span>›</button>
    <button class="card lrow" data-act="startCheckin" data-arg="app"><span class="ic">💬</span><span class="t"><b>Start the check-in (as if from a notification)</b><span>Guided questions, based on the flagged data</span></span>›</button>
    <button class="card lrow" data-act="showReport"><span class="ic">📄</span><span class="t"><b>Last check-in report</b><span>What the other modules receive</span></span>›</button>
    <button class="card lrow" data-act="skip2w"><span class="ic">⏩</span><span class="t"><b>Skip two weeks, no improvement</b><span>Shows the escalation step</span></span>›</button>`;
  if (s.type === "res") {
    const R = {
      sleepTips: ["Tips for better sleep", ["Get daylight within an hour of waking.", "Keep wake-up time steady, even on weekends.", "Screens away 30 minutes before bed.", "Cool, dark, quiet room.", "Can't sleep after 20 minutes? Get up, do something calm, try again."]],
      workTips: ["Managing work stress", ["Write tomorrow's top 3 before you log off.", "Protect one focus block a day.", "Take a real lunch away from the screen.", "Say what's too much, early. It's a skill, not a weakness."]],
      focus: ["Focus", ["One task, 25 minutes, phone in another room.", "A 5-minute walk resets attention.", "Water and daylight help more than another coffee."]],
      moodTips: ["Lifting your mood", ["Do one small thing you used to enjoy.", "Message someone, even just an emoji.", "Get outside, even briefly.", "Notice one good moment before bed."]],
      pro: ["When to talk to a professional", ["If low mood, stress or exhaustion lasts more than two weeks.", "If sleep, appetite or energy change a lot.", "If daily life feels hard to manage.", "In Switzerland, your GP can prescribe sessions with a psychologist, covered by basic insurance since July 2022.", "Psyfinder by the Swiss psychologists' federation (FSP) has profiles of psychologists near you.", "In Geneva, the AGPsy directory lists psychologists: agpsy.ch"]],
    }[s.arg] || ["", []];
    b = `<h2>${R[0]}</h2><div class="card stack small">${R[1].map(x => `<p>• ${esc(x)}</p>`).join("")}</div>${s.arg === "pro" ? `<a class="btn" href="https://www.psychologie.ch/en/psyfinder" target="_blank" rel="noopener" style="text-decoration:none">Find a psychologist (Psyfinder)</a>` : ""}`;
  }
  return `<div class="scrim" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="stack-lg">${b}</div></div></div>`;
}
function availableHTML() {
  return `<h2>Who's available now</h2><p class="small muted">You choose who, and when. RYDM never contacts anyone for you.</p>
  ${availableNow().map(a => `<div class="card stack" style="gap:6px"><div class="row between"><b>${esc(a.name)}</b><span class="pill ${a.now ? "on" : ""}">${a.now ? "Available now" : a.when}</span></div><p class="small muted">${esc(a.what)}${a.when === "24/7" ? " · 24/7" : ""}</p>
    <div class="row wrap">${a.tel ? `<a class="btn small" href="tel:${a.tel}" style="text-decoration:none">Call ${esc(a.telLabel || a.tel)}</a>` : ""}${a.web ? `<a class="btn ghost small" href="${a.web}" target="_blank" rel="noopener" style="text-decoration:none">Open</a>` : ""}</div></div>`).join("")}
  <button class="btn ghost" data-act="share">I'm ready to share my results</button>`;
}
function shareText() {
  const r = S.result;
  const lines = [`Hi${S.s.trusted.name ? " " + S.s.trusted.name : ""}, I wanted to share how I've been doing lately.`, ""];
  (r?.facts || []).slice(0, 4).forEach(f => lines.push("• " + f.replace(/your usual/g, "my usual")));
  if (!r?.facts?.length) lines.push("• Things have felt a bit off and I'd like to talk.");
  lines.push("", "Could we talk sometime soon?");
  return lines.join("\n");
}

// ================= render =================
function render() {
  if (!S.s.onboarded) { $app.innerHTML = onboarding() + sheetHTML(); mountMascot(); if (mascot) { mascot.setCompanion(S.s.companion); mascot.setExpression(S.s.step === 0 ? "wave" : "happy"); } return; }
  const scr = { home, quests, chat, journey, support, profile }[S.tab] || home;
  $app.innerHTML = scr() + (S.tab === "profile" ? "" : nav()) + sheetHTML();
  mountMascot();
  if (mascot && S.dir) { if (!S.sheet || S.sheet.type === "chat") mascot.setExpression(S.dir.expression); }
}

// ================= actions =================
async function act(a, arg, el, ev) {
  switch (a) {
    case "tab": S.tab = arg; S.sheet = null; if (arg === "chat" && (!S.chat || (!S.chat.pending && !S.chat.typing && !S.chat.actions))) startFree(); render(); window.scrollTo({ top: 0 }); break;
    case "ans": answer(arg); break;
    case "endGuided": S.chat.mode = "free"; S.chat.pending = null; say(["No problem at all. We can pick this up anytime 💛"], "caring", () => { S.chat.actions = ["restart"]; }); break;
    case "startCheckin": startGuided(arg || "app"); break;
    case "inviteLater": { await kv.set("inviteSnooze", addDays(today(), 1)); S.sheet = null; render(); toast("I'll ask again tomorrow"); break; }
    case "inviteNo": { await kv.set("inviteSnooze", addDays(today(), 3)); S.sheet = null; render(); break; }
    case "showReport": S.sheet = { type: "report" }; render(); break;
    case "tab-quests": S.tab = "quests"; render(); break;
    case "profile": S.tab = "profile"; render(); window.scrollTo({ top: 0 }); break;
    case "next": await save({ step: Math.min(5, (S.s.step || 0) + 1) }); render(); window.scrollTo({ top: 0 }); break;
    case "back": await save({ step: Math.max(0, S.s.step - 1) }); render(); break;
    case "pickCompanion": await save({ companion: arg }); if (mascot) { mascot.setCompanion(arg); mascot.react("wave"); } if (S.s.onboarded) await refresh(); else render(); break;
    case "saveName": await save({ name: document.getElementById("f-name").value.trim(), step: 3 }); render(); break;
    case "consent": await save({ consent: { ...S.s.consent, [arg]: el.checked } }); break;
    case "agree": await save({ consent: { ...S.s.consent, agreedAt: el.checked ? new Date().toISOString() : null } }); render(); break;
    case "chooseInsurer": await save({ insurer: arg, insurerLinkedAt: new Date().toLocaleDateString("en-GB") }); if (S.s.onboarded) { S.sheet = null; toast("Insurer linked (demo)"); await refresh(); } else render(); break;
    case "linkInsurer": S.sheet = { type: "linkInsurer" }; render(); break;
    case "unlink": await save({ insurer: null, insurerLinkedAt: null }); toast("Insurer unlinked"); render(); break;
    case "startDemo": await kv.del("inviteSnooze"); await kv.del("lastCheckin"); await startDemo(arg); break;
    case "checkin": await upsertDay(today(), { mood: +arg }); if (mascot) mascot.react(+arg >= 4 ? "celebrate" : "tap"); await refresh(); break;
    case "pleasure": await upsertDay(today(), { pleasure: +arg }); if (mascot) mascot.react(+arg >= 4 ? "celebrate" : "tap"); await refresh(); toast("Thanks for checking in"); break;
    case "quest": {
      const done = (S.log[today()] || []).includes(arg);
      if (done) break;
      if (arg === "breathe" || arg === "g-breathe") { S.sheet = { type: "breathe", quest: arg }; render(); runBreath(); break; }
      await markDone(arg); break;
    }
    case "restartChat": startFree(); break;
    case "journey": S.journey = arg; render(); break;
    case "res": if (arg === "breathe") { S.sheet = { type: "breathe" }; render(); runBreath(); } else { S.sheet = { type: "res", arg }; render(); } break;
    case "breathDone": { const q = S.sheet?.quest || (S.plan.ids.includes("breathe") ? "breathe" : S.plan.ids.includes("g-breathe") ? "g-breathe" : null); S.sheet = null; if (q) await markDone(q); else render(); break; }
    case "share": S.sheet = { type: "share" }; render(); break;
    case "doShare": { const t = document.getElementById("share-text").value; if (navigator.share) { try { await navigator.share({ text: t }); } catch {} } else { try { await navigator.clipboard.writeText(t); toast("Copied"); } catch { toast("Select and copy the text"); } } break; }
    case "trusted": S.sheet = { type: "trusted" }; render(); break;
    case "saveTrusted": await save({ trusted: { name: document.getElementById("f-tname").value.trim(), contact: document.getElementById("f-tcontact").value.trim() } }); S.sheet = null; toast("Saved"); render(); break;
    case "changeCompanion": case "privacy": case "ai": case "demo": S.sheet = { type: a }; render(); break;
    case "loadAI": { const p = document.getElementById("aiprog"); try { await loadModel("phone", x => { if (p) p.textContent = `Downloading… ${Math.round(x * 100)}%`; }); toast("AI is on"); S.sheet = null; await refresh(); } catch (e) { if (p) p.textContent = e.message; } break; }
    case "wipe": await wipeAll(); location.reload(); break;
    case "dataSheet": S.sheet = { type: "dataSheet" }; render(); break;
    case "loadProfile": {
      const t = TEST_PROFILES[arg];
      await clearDays(); await putDays(generateProfile(arg, 63, today()));
      await setLog({}); await kv.set("gentleDays", []); await kv.set("plan", null);
      for (const k of ["anchor", "stage3Since", "inviteSnooze", "lastCheckin"]) await kv.del(k);
      await kv.set("seenNudges", {}); window.RYDM_lastReport = null;
      await save({ onboarded: true, name: t.name, persona: t.label, consent: { steps: true, sleep: true, heart: true, daylight: true, places: true, checkin: true, agreedAt: S.s.consent.agreedAt || new Date().toISOString() } });
      S.sheet = null; S.tab = "home"; S.chat = null; await refresh(); window.scrollTo({ top: 0 }); break;
    }
    case "liveHealth": {
      const r = await native.requestHealth(); await native.requestNotifications();
      if (!r?.granted) { toast("Health access wasn't granted"); break; }
      if (S.s.persona !== "Apple Health (live)") { await clearDays(); await setLog({}); await kv.set("gentleDays", []); await kv.set("plan", null); await kv.del("anchor"); await kv.del("stage3Since"); await kv.set("seenNudges", {}); }
      await save({ persona: "Apple Health (live)", onboarded: true, consent: { ...S.s.consent, agreedAt: S.s.consent.agreedAt || new Date().toISOString(), steps: true, sleep: true, heart: true, daylight: true } });
      S.sheet = null; S.tab = "home"; await refresh(); window.scrollTo({ top: 0 });
      toast(`Synced ${S.days.length} days from Apple Health`); break;
    }
    case "livePlaces": { await native.requestLocation(); await save({ consent: { ...S.s.consent, places: true } }); toast("Places will build up from today"); break; }
    case "removeDemo": {
      await clearDays(); await setLog({}); await kv.set("gentleDays", []); await kv.set("plan", null);
      await kv.del("anchor"); await kv.del("stage3Since"); await kv.set("seenNudges", {});
      await save({ persona: null }); S.sheet = null; S.tab = "home"; await refresh(); toast("Data removed"); break;
    }
    case "ahFile": {
      const f = el.files?.[0]; if (!f) break;
      const st = document.getElementById("ah-status");
      try {
        const { days, records } = await readAppleHealth(f, x => { if (st) st.textContent = `Reading on this phone… ${Math.round(x * 100)}%`; });
        await clearDays(); await putDays(days);
        await setLog({}); await kv.set("gentleDays", []); await kv.set("plan", null);
        await kv.del("anchor"); await kv.del("stage3Since"); await kv.set("seenNudges", {});
        const has = k => days.some(d => d[k] != null);
        await save({ persona: "Apple Health (imported)", onboarded: true, consent: { ...S.s.consent, agreedAt: S.s.consent.agreedAt || new Date().toISOString(), steps: has("steps") || S.s.consent.steps, sleep: has("sleepMin") || S.s.consent.sleep, heart: has("restingHR") || has("hrv"), daylight: has("daylight") } });
        S.sheet = null; S.tab = "home"; await refresh(); window.scrollTo({ top: 0 });
        toast(`Imported ${days.length} days from ${records.toLocaleString("en-CH")} records`);
      } catch (e) { if (st) st.textContent = e.message; }
      break;
    }
    case "openNotes": document.querySelector(".banner")?.remove(); S.sheet = { type: "notes" }; render(); break;
    case "cta": {
      S.sheet = null;
      if (arg === "journey" || arg === "quests") { S.tab = arg; render(); window.scrollTo({ top: 0 }); }
      else if (arg === "checkin") { startGuided("app"); }
      else if (arg === "share") { S.sheet = { type: "share" }; render(); }
      else if (arg === "available") { S.sheet = { type: "available" }; render(); }
      else render();
      break;
    }
    case "available": S.sheet = { type: "available" }; render(); break;
    case "skip2w": { const sinceD = addDays(today(), -15); await kv.set("stage3Since", sinceD); S.sheet = null; S.tab = "home"; await kv.set("seenNudges", {}); await refresh(); toast("Jumped two weeks ahead, no improvement"); break; }
    case "demoNote": { S.sheet = null; render(); const n = S.nudges[+arg] || S.nudges[0]; if (n) { showBanner(n); if (isNative) native.notify(n.title, n.body, "demo" + Date.now()); } else toast("No notes right now"); break; }
    case "close": S.sheet = null; host.style.transform = ""; render(); break;
    case "scrim": if (ev.target === el) { S.sheet = null; render(); } break;
  }
}
async function markDone(id) {
  const before = isActiveDay(S.log[today()] || [], S.plan.gentle);
  S.log = await complete(today(), id);
  const after = isActiveDay(S.log[today()], S.plan.gentle);
  S.sheet = { type: "celebrate", active: after && !before };
  await refresh();
  mascot?.react("celebrate");
}
let breathTimer = null;
function runBreath() {
  clearInterval(breathTimer);
  const phases = [["Breathe in", "calm", 1.12], ["Hold", "calm", 1.12], ["Breathe out", "sleepy", 0.92], ["Hold", "calm", 0.92]];
  let i = 0, cycles = 0;
  host.style.transition = "transform 4s ease-in-out";
  const step = () => {
    const lab = document.getElementById("blabel");
    if (!lab || S.sheet?.type !== "breathe") { host.style.transform = ""; return clearInterval(breathTimer); }
    if (cycles >= 4) { lab.textContent = "Well done 💛"; mascot?.setExpression("joy"); host.style.transform = "scale(1)"; return clearInterval(breathTimer); }
    const [t, e, sc] = phases[i % 4];
    lab.textContent = t; mascot?.setExpression(e); host.style.transform = `scale(${sc})`;
    i++; if (i % 4 === 0) cycles++;
  };
  setTimeout(step, 400); breathTimer = setInterval(step, 4000);
}
async function startDemo(kind) {
  await clearDays();
  if (kind !== "fresh") {
    await putDays(generate(kind, 63, today()));
    const log = demoLog(today(), kind === "shift" ? 9 : 12);
    const gentle = new Set();
    if (kind === "shift") { // effort still shows up in the harder weeks, just smaller and less often
      for (let i = 1; i <= 20; i++) { const k = addDays(today(), -i); gentle.add(k); if (i % 3 === 0) delete log[k]; else if (log[k]) log[k] = ["g-window"]; }
      gentle.add(today());
    }
    // make this month's progress land mid-way, so the goal is still something to work towards
    const target = kind === "shift" ? 9 : 12, mk = today().slice(0, 7);
    const actDays = Object.keys(log).filter(k => k.startsWith(mk) && isActiveDay(log[k], gentle.has(k))).sort().reverse();
    for (const k of actDays.slice(target)) delete log[k];
    await kv.set("gentleDays", [...gentle]);
    await setLog(log);
  } else { await setLog({}); await kv.set("gentleDays", []); }
  await kv.set("plan", null); await kv.del("anchor"); await kv.del("stage3Since"); await kv.set("seenNudges", {});
  await save({ onboarded: true, persona: kind === "shift" ? "A harder stretch" : kind === "steady" ? "A good rhythm" : "Fresh start", consent: { ...S.s.consent, agreedAt: S.s.consent.agreedAt || new Date().toISOString(), checkin: true } });
  S.sheet = null; S.tab = "home"; S.chat = null;
  await refresh(); window.scrollTo({ top: 0 });
  mascot?.react("wave");
}

document.addEventListener("click", e => { const el = e.target.closest("[data-act]"); if (!el || el.tagName === "INPUT") return; act(el.dataset.act, el.dataset.arg, el, e); });
document.addEventListener("change", e => { const el = e.target.closest("input[data-act]"); if (el) act(el.dataset.act, el.dataset.arg, el, e); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && S.sheet) { S.sheet = null; render(); } });

(async function boot() {
  S.s = { ...structuredClone(DEFAULTS), ...((await kv.get("settings")) || {}) };
  S.s.consent = { ...DEFAULTS.consent, ...S.s.consent };
  document.body.classList.toggle("night", hour() >= 20 || hour() < 6);
  if (S.s.onboarded) await refresh(); else render();
  setInterval(() => { if (S.s.onboarded && !S.sheet) refresh(); }, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.s.onboarded && !S.sheet) refresh(); });
})();
