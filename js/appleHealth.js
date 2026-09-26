// Read an Apple Health export on the device. Accepts the "export.zip" the Health app creates
// (Health › profile › Export All Health Data) or the export.xml inside it.
// The file is streamed, so large exports (hundreds of MB) work; nothing is uploaded.
import { Unzip, UnzipInflate } from "./vendor/fflate.js";

const TYPES = {
  HKQuantityTypeIdentifierStepCount: "steps",
  HKQuantityTypeIdentifierAppleExerciseTime: "exercise",
  HKQuantityTypeIdentifierTimeInDaylight: "daylight",
  HKQuantityTypeIdentifierRestingHeartRate: "restingHR",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
  HKCategoryTypeIdentifierSleepAnalysis: "sleep",
};
const SUMMED = new Set(["steps", "exercise", "daylight"]);

// "2026-09-01 23:12:00 +0200" -> wall-clock parts in the person's own time zone
function wall(s) { const m = s && s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/); return m ? { date: m[1], mins: +m[2] * 60 + +m[3], abs: Date.parse(`${m[1]}T${m[2]}:${m[3]}:00Z`) / 60000 } : null; }
const attr = (tag, a) => { const i = tag.indexOf(` ${a}="`); if (i < 0) return null; const j = tag.indexOf('"', i + a.length + 3); return tag.slice(i + a.length + 3, j); };
const nextDate = iso => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

export function createParser({ sinceDays = 150 } = {}) {
  const cutoff = new Date(Date.now() - sinceDays * 86400000).toISOString().slice(0, 10);
  const sums = new Map();    // "steps|2026-09-01|Apple Watch" -> number   (per source, to avoid double counting)
  const avgs = new Map();    // "restingHR|2026-09-01" -> [sum, n]
  const sleep = new Map();   // wakeDate -> [[startAbs, endAbs, startWall]]
  let records = 0, buf = "";

  function handle(tag) {
    const type = attr(tag, "type"); const k = TYPES[type]; if (!k) return;
    const s = wall(attr(tag, "startDate")); if (!s || s.date < cutoff) return;
    records++;
    if (k === "sleep") {
      if (!/Asleep/.test(attr(tag, "value") || "")) return;           // ignore InBed / Awake
      const e = wall(attr(tag, "endDate")); if (!e) return;
      const wake = e.mins < 16 * 60 ? e.date : nextDate(e.date);
      if (!sleep.has(wake)) sleep.set(wake, []);
      sleep.get(wake).push([s.abs, e.abs, s]);
      return;
    }
    const v = parseFloat(attr(tag, "value")); if (isNaN(v)) return;
    if (SUMMED.has(k)) { const key = `${k}|${s.date}|${attr(tag, "sourceName") || ""}`; sums.set(key, (sums.get(key) || 0) + v); }
    else { const key = `${k}|${s.date}`; const a = avgs.get(key) || [0, 0]; a[0] += v; a[1]++; avgs.set(key, a); }
  }

  return {
    push(text) {
      buf += text;
      let i;
      while ((i = buf.indexOf("<Record ")) !== -1) {
        const j = buf.indexOf(">", i); if (j === -1) break;
        handle(buf.slice(i, j + 1)); buf = buf.slice(j + 1);
      }
      if (buf.length > 200000) buf = buf.slice(-5000);
    },
    get records() { return records; },
    finish() {
      const days = new Map();
      const get = d => { if (!days.has(d)) days.set(d, { date: d, source: "apple_health" }); return days.get(d); };
      // summed types: take the biggest single source per day (iPhone and Watch both count steps)
      const best = new Map();
      for (const [key, v] of sums) { const [k, d] = key.split("|"); const id = `${k}|${d}`; best.set(id, Math.max(best.get(id) || 0, v)); }
      for (const [id, v] of best) { const [k, d] = id.split("|"); if (v > 0) get(d)[k] = Math.round(v); }
      for (const [id, [sum, n]] of avgs) { const [k, d] = id.split("|"); get(d)[k] = Math.round((sum / n) * 10) / 10; }
      for (const [wake, segs] of sleep) {
        segs.sort((a, b) => a[0] - b[0]);
        let total = 0, cur = null;
        for (const [a, b] of segs) { if (!cur || a > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [a, b]; } else cur[1] = Math.max(cur[1], b); }
        if (cur) total += cur[1] - cur[0];
        if (total < 60) continue;
        const first = segs[0][2], day = get(wake);
        day.sleepMin = Math.round(total);
        const on = first.date === wake ? first.mins + 720 : first.mins - 720;   // minutes after noon, like engine.js
        if (on >= 0 && on <= 1200) day.onset = on;
      }
      return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    },
  };
}

// Read a File (export.zip or export.xml). onProgress(0..1).
export async function readAppleHealth(file, onProgress) {
  const p = createParser();
  const isZip = /\.zip$/i.test(file.name) || file.type === "application/zip";
  const reader = file.stream().getReader();
  let read = 0;
  if (!isZip) {
    const dec = new TextDecoder();
    for (;;) { const { value, done } = await reader.read(); if (done) break; read += value.length; p.push(dec.decode(value, { stream: true })); onProgress?.(read / file.size); }
  } else {
    let found = false;
    const dec = new TextDecoder();
    const uz = new Unzip(f => {
      if (!/(^|\/)export\.xml$/.test(f.name)) return;
      found = true;
      f.ondata = (err, chunk) => { if (err) throw err; p.push(dec.decode(chunk, { stream: true })); };
      f.start();
    });
    uz.register(UnzipInflate);
    for (;;) { const { value, done } = await reader.read(); if (done) { uz.push(new Uint8Array(0), true); break; } read += value.length; uz.push(value); onProgress?.(read / file.size); }
    if (!found) throw new Error("No export.xml found in that zip. Use the file the Health app exports.");
  }
  onProgress?.(1);
  const days = p.finish();
  if (!days.length) throw new Error("No steps, sleep or heart data found in the last five months.");
  return { days, records: p.records };
}
