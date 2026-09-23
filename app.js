// ===== ข้อมูลสกุลเงิน: รหัส -> ชื่อ (ไทย) + ธง =====
const CURRENCY_META = {
  THB: { name: "บาทไทย", flag: "🇹🇭" },
  USD: { name: "ดอลลาร์สหรัฐ", flag: "🇺🇸" },
  EUR: { name: "ยูโร", flag: "🇪🇺" },
  GBP: { name: "ปอนด์สเตอร์ลิง", flag: "🇬🇧" },
  JPY: { name: "เยนญี่ปุ่น", flag: "🇯🇵" },
  CNY: { name: "หยวนจีน", flag: "🇨🇳" },
  KRW: { name: "วอนเกาหลีใต้", flag: "🇰🇷" },
  SGD: { name: "ดอลลาร์สิงคโปร์", flag: "🇸🇬" },
  MYR: { name: "ริงกิตมาเลเซีย", flag: "🇲🇾" },
  HKD: { name: "ดอลลาร์ฮ่องกง", flag: "🇭🇰" },
  AUD: { name: "ดอลลาร์ออสเตรเลีย", flag: "🇦🇺" },
  NZD: { name: "ดอลลาร์นิวซีแลนด์", flag: "🇳🇿" },
  CAD: { name: "ดอลลาร์แคนาดา", flag: "🇨🇦" },
  CHF: { name: "ฟรังก์สวิส", flag: "🇨🇭" },
  INR: { name: "รูปีอินเดีย", flag: "🇮🇳" },
  IDR: { name: "รูเปียห์อินโดนีเซีย", flag: "🇮🇩" },
  PHP: { name: "เปโซฟิลิปปินส์", flag: "🇵🇭" },
  VND: { name: "ดองเวียดนาม", flag: "🇻🇳" },
  TWD: { name: "ดอลลาร์ไต้หวัน", flag: "🇹🇼" },
  AED: { name: "เดอร์แฮมสหรัฐอาหรับเอมิเรตส์", flag: "🇦🇪" },
  RUB: { name: "รูเบิลรัสเซีย", flag: "🇷🇺" },
  BRL: { name: "เรียลบราซิล", flag: "🇧🇷" },
  ZAR: { name: "แรนด์แอฟริกาใต้", flag: "🇿🇦" },
  SEK: { name: "โครนาสวีเดน", flag: "🇸🇪" },
  NOK: { name: "โครนนอร์เวย์", flag: "🇳🇴" },
  DKK: { name: "โครนเดนมาร์ก", flag: "🇩🇰" },
  MXN: { name: "เปโซเม็กซิโก", flag: "🇲🇽" },
  SAR: { name: "ริยัลซาอุดีอาระเบีย", flag: "🇸🇦" },
  TRY: { name: "ลีราตุรกี", flag: "🇹🇷" },
};

// base USD เสมอ เพื่อคำนวณ cross-rate ได้ทุกคู่จากชุดข้อมูลเดียว
const API_URL = "https://open.er-api.com/v6/latest/USD";
const STORAGE_KEY = "ccv2.rates.usd";
const PREFS_KEY = "ccv2.prefs"; // จำสกุลเงิน/จำนวนที่เลือกล่าสุด
const MAX_FRESH_MS = 12 * 60 * 60 * 1000; // ถือว่า "สด" ภายใน 12 ชม.

// ===== DOM =====
const $ = (id) => document.getElementById(id);
const amountEl = $("amount");
const fromEl = $("from");
const toEl = $("to");
const swapEl = $("swap");
const refreshEl = $("refresh");
const resultMainEl = $("resultMain");
const resultRateEl = $("resultRate");
const statusEl = $("status");
const updatedEl = $("updated");

// ===== สถานะข้อมูลอัตรา (base USD) =====
// { rates: {CODE:number}, timeUpdated: string, fetchedAt: number, source: 'live'|'cache'|'fallback' }
let rateData = null;

// ===== ฟอร์แมตตัวเลข =====
const fmt = (value, code) => {
  const decimals = value !== 0 && Math.abs(value) < 1 ? 6 : 2;
  return (
    new Intl.NumberFormat("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals,
    }).format(value) +
    " " +
    code
  );
};

const labelFor = (code) => {
  const meta = CURRENCY_META[code];
  return meta ? `${meta.flag} ${code} — ${meta.name}` : code;
};

// ===== จัดการค่าในช่องจำนวนเงิน (มีตัวคั่นหลักพัน) =====
// แปลงข้อความในช่อง input -> ตัวเลข (ตัด comma ออก)
function parseAmount(str) {
  if (typeof str !== "string") return NaN;
  const cleaned = str.replace(/,/g, "").trim();
  if (cleaned === "") return NaN;
  return parseFloat(cleaned);
}

// จัดรูปแบบข้อความในช่อง input ให้มีตัวคั่นหลักพัน โดยคงตำแหน่ง cursor ให้ใช้งานได้
// เก็บทศนิยมที่ผู้ใช้กำลังพิมพ์ไว้ (เช่น "1,234." หรือ "1,234.5")
function formatAmountField() {
  const raw = amountEl.value;

  // อนุญาตเฉพาะตัวเลขและจุดทศนิยม (ตัด comma และอักขระอื่นทิ้ง)
  let digits = raw.replace(/[^\d.]/g, "");

  // อนุญาตจุดทศนิยมได้จุดเดียว
  const firstDot = digits.indexOf(".");
  if (firstDot !== -1) {
    digits =
      digits.slice(0, firstDot + 1) +
      digits.slice(firstDot + 1).replace(/\./g, "");
  }

  if (digits === "" || digits === ".") {
    amountEl.value = digits;
    return;
  }

  const [intPart, decPart] = digits.split(".");
  const intNum = intPart === "" ? "" : parseInt(intPart, 10).toLocaleString("en-US");

  let formatted = intNum;
  if (digits.includes(".")) {
    // จำกัดทศนิยมไม่เกิน 2 ตำแหน่ง
    formatted += "." + (decPart || "").slice(0, 2);
  }

  // นับจำนวนหลัก (ไม่รวม comma) ทางซ้ายของ cursor เพื่อคืนตำแหน่ง cursor หลัง reformat
  const selStart = amountEl.selectionStart;
  const digitsLeftOfCaret = raw.slice(0, selStart).replace(/[^\d.]/g, "").length;

  amountEl.value = formatted;

  // หา cursor ตำแหน่งใหม่: เดินจากซ้ายจนนับหลัก/จุด ได้เท่าเดิม
  let count = 0;
  let newPos = formatted.length;
  for (let i = 0; i < formatted.length; i++) {
    if (count >= digitsLeftOfCaret) {
      newPos = i;
      break;
    }
    if (/[\d.]/.test(formatted[i])) count++;
  }
  try {
    amountEl.setSelectionRange(newPos, newPos);
  } catch (e) {
    /* บาง input type ไม่รองรับ setSelectionRange — ข้ามได้ */
  }
}

// ===== เติมตัวเลือกใน dropdown =====
function populateSelects(codes) {
  const known = codes.filter((c) => CURRENCY_META[c]).sort();
  const others = codes.filter((c) => !CURRENCY_META[c]).sort();
  const ordered = [...known, ...others];

  const prevFrom = fromEl.value;
  const prevTo = toEl.value;

  const buildOptions = (selectEl) => {
    selectEl.innerHTML = "";
    ordered.forEach((code) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = labelFor(code);
      selectEl.appendChild(opt);
    });
  };

  buildOptions(fromEl);
  buildOptions(toEl);

  fromEl.value = ordered.includes(prevFrom) ? prevFrom : (ordered.includes("VND") ? "VND" : ordered[0]);
  toEl.value = ordered.includes(prevTo) ? prevTo : (ordered.includes("THB") ? "THB" : ordered[1] || ordered[0]);
}

// ===== localStorage helpers =====
function saveToCache(entry) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch (e) {
    console.warn("บันทึกแคชไม่สำเร็จ:", e);
  }
}

function loadFromCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.rates && typeof parsed.rates === "object") {
      return parsed;
    }
  } catch (e) {
    console.warn("อ่านแคชไม่สำเร็จ:", e);
  }
  return null;
}

function loadFallback() {
  const fb = window.FALLBACK_RATES;
  if (!fb || !fb.rates) return null;
  return {
    rates: fb.rates,
    timeUpdated: fb.time_last_update_utc || "",
    fetchedAt: 0,
    source: "fallback",
  };
}

// ===== จำ/โหลดสกุลเงินและจำนวนที่เลือกล่าสุด =====
function savePrefs() {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        from: fromEl.value,
        to: toEl.value,
        // เก็บเป็นสตริงตัวเลขที่ตัด comma ออกแล้ว เพื่อความชัดเจน
        amount: amountEl.value.replace(/,/g, ""),
      })
    );
  } catch (e) {
    console.warn("บันทึกค่าที่เลือกไม่สำเร็จ:", e);
  }
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (e) {
    console.warn("อ่านค่าที่เลือกไม่สำเร็จ:", e);
  }
  return null;
}

// ===== ดึงอัตราจาก API (base USD) =====
async function fetchLiveRates() {
  const res = await fetch(API_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.result !== "success" || !data.rates) {
    throw new Error("รูปแบบข้อมูลไม่ถูกต้อง");
  }
  return {
    rates: data.rates,
    timeUpdated: data.time_last_update_utc || "",
    fetchedAt: Date.now(),
    source: "live",
  };
}

// ===== แปลงค่าและแสดงผล (cross-rate ผ่าน USD) =====
function convert() {
  if (!rateData) {
    resultMainEl.textContent = "—";
    return;
  }

  const amount = parseAmount(amountEl.value);
  const from = fromEl.value;
  const to = toEl.value;

  if (isNaN(amount) || amount < 0) {
    resultMainEl.textContent = "—";
    resultRateEl.textContent = "";
    setStatusData("กรุณากรอกจำนวนเงินที่ถูกต้อง", true);
    return;
  }

  const rFrom = rateData.rates[from]; // 1 USD = rFrom FROM
  const rTo = rateData.rates[to]; // 1 USD = rTo TO
  if (typeof rFrom !== "number" || typeof rTo !== "number") {
    setStatusData("ไม่มีอัตราสำหรับสกุลเงินที่เลือก", true);
    return;
  }

  // 1 FROM = (rTo / rFrom) TO
  const rate = rTo / rFrom;
  const converted = amount * rate;

  resultMainEl.textContent = fmt(converted, to);
  resultRateEl.textContent =
    `1 ${from} = ` +
    new Intl.NumberFormat("th-TH", { maximumFractionDigits: 6 }).format(rate) +
    ` ${to}`;

  setStatusData();
}

// ===== สถานะ + แหล่งข้อมูล =====
function setStatusData(msg, isError = false) {
  if (msg) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("status--error", isError);
    return;
  }

  const online = navigator.onLine;
  let text = "";
  if (rateData) {
    if (rateData.source === "live") {
      text = "🟢 อัตราแลกเปลี่ยนแบบสด";
    } else if (rateData.source === "cache") {
      text = online
        ? "🟡 กำลังใช้อัตราที่บันทึกไว้ (อัปเดตไม่สำเร็จ)"
        : "🟡 ออฟไลน์ — ใช้อัตราที่บันทึกไว้ล่าสุด";
    } else {
      text = "🟠 ออฟไลน์ — ใช้อัตราสำรองในแอป (อาจไม่เป็นปัจจุบัน)";
    }
  }
  statusEl.textContent = text;
  statusEl.classList.remove("status--error");

  updatedEl.textContent = rateData && rateData.timeUpdated
    ? "อัปเดตอัตรา: " + formatUpdated(rateData.timeUpdated)
    : "";
}

function formatUpdated(utcStr) {
  const d = new Date(utcStr);
  if (isNaN(d.getTime())) return utcStr;
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

// ===== สลับสกุลเงิน =====
function swap() {
  const tmp = fromEl.value;
  fromEl.value = toEl.value;
  toEl.value = tmp;
  convert();
}

// ===== debounce =====
let debounceTimer;
function debouncedConvert() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(convert, 250);
}

// ===== รีเฟรชอัตราจากเน็ต =====
// manual = true เมื่อผู้ใช้กดปุ่มเอง (แสดง feedback ชัดเจน)
async function tryRefresh(manual = false) {
  if (!navigator.onLine) {
    if (manual) setStatusData("ไม่มีการเชื่อมต่ออินเทอร์เน็ต — อัปเดตไม่ได้", true);
    return false;
  }

  if (manual) setRefreshing(true);
  try {
    const live = await fetchLiveRates();
    rateData = live;
    saveToCache(live);
    // เติม dropdown ใหม่เผื่อชุดสกุลเงินเปลี่ยน (คงค่าที่เลือกไว้)
    populateSelects(Object.keys(live.rates));
    convert();
    return true;
  } catch (e) {
    console.warn("รีเฟรชอัตราไม่สำเร็จ:", e);
    if (manual) {
      setStatusData("อัปเดตไม่สำเร็จ: " + e.message + " — ยังใช้อัตราเดิมได้", true);
    } else {
      // การรีเฟรชอัตโนมัติที่ล้มเหลวไม่ถือเป็น error ร้ายแรง
      setStatusData();
    }
    return false;
  } finally {
    if (manual) setRefreshing(false);
  }
}

// ===== แสดงสถานะปุ่มอัปเดต =====
function setRefreshing(on) {
  refreshEl.classList.toggle("refresh--spinning", on);
  const label = refreshEl.querySelector(".refresh__label");
  if (label) label.textContent = on ? "กำลังอัปเดต…" : "อัปเดตอัตราตอนนี้";
  // ระหว่างอัปเดตให้ปิดปุ่ม; เมื่อเสร็จให้กลับไปใช้สถานะตามการเชื่อมต่อ
  if (on) {
    refreshEl.disabled = true;
  } else {
    updateRefreshAvailability();
  }
}

// ปิดปุ่มอัปเดตเมื่อออฟไลน์ (กดไปก็อัปเดตไม่ได้)
function updateRefreshAvailability() {
  const online = navigator.onLine;
  refreshEl.disabled = !online;
  refreshEl.title = online ? "ดึงอัตราล่าสุดจากอินเทอร์เน็ต" : "ออฟไลน์ — เชื่อมต่ออินเทอร์เน็ตเพื่ออัปเดต";
}

// ตั้งค่า from/to ล่วงหน้า เพื่อให้ populateSelects คงค่าที่จำไว้
function applyPrefsBeforePopulate(prefs) {
  if (!prefs) return;
  if (prefs.from) fromEl.value = prefs.from;
  if (prefs.to) toEl.value = prefs.to;
}

function applyAmountPref(prefs) {
  if (prefs && prefs.amount !== undefined && prefs.amount !== "") {
    amountEl.value = prefs.amount;
    formatAmountField(); // ใส่ตัวคั่นหลักพันให้ค่าที่คืนมา
  }
}

// ===== เริ่มต้น =====
async function init() {
  // 1) โหลดข้อมูลที่ดีที่สุดที่มีอยู่แบบทันที (แคช > fallback) เพื่อให้ UI ใช้งานได้เลย
  const cached = loadFromCache();
  if (cached) {
    rateData = { ...cached, source: "cache" };
  } else {
    rateData = loadFallback();
  }

  // โหลดสกุลเงิน/จำนวนที่เลือกล่าสุด (ถ้ามี) ก่อนสร้าง dropdown
  const prefs = loadPrefs();

  if (rateData) {
    applyPrefsBeforePopulate(prefs);
    populateSelects(Object.keys(rateData.rates));
    applyAmountPref(prefs);
    convert();
  } else {
    applyPrefsBeforePopulate(prefs);
    populateSelects(Object.keys(CURRENCY_META));
    applyAmountPref(prefs);
    setStatusData("ยังไม่มีข้อมูลอัตรา กรุณาเชื่อมต่ออินเทอร์เน็ตครั้งแรก", true);
  }

  // 2) ถ้าออนไลน์และข้อมูลเก่ากว่าเกณฑ์ (หรือไม่ใช่ live) ให้ลองรีเฟรช
  const stale = !cached || Date.now() - (cached.fetchedAt || 0) > MAX_FRESH_MS;
  if (navigator.onLine && (stale || !cached)) {
    tryRefresh();
  }

  // 3) event listeners
  amountEl.addEventListener("input", () => {
    formatAmountField(); // ใส่ตัวคั่นหลักพันขณะพิมพ์
    debouncedConvert();
    savePrefs();
  });
  fromEl.addEventListener("change", () => {
    convert();
    savePrefs();
  });
  toEl.addEventListener("change", () => {
    convert();
    savePrefs();
  });
  swapEl.addEventListener("click", () => {
    swap();
    savePrefs();
  });
  refreshEl.addEventListener("click", () => tryRefresh(true));

  window.addEventListener("online", () => {
    updateRefreshAvailability();
    setStatusData();
    tryRefresh();
  });
  window.addEventListener("offline", () => {
    updateRefreshAvailability();
    setStatusData();
  });

  updateRefreshAvailability();
}

document.addEventListener("DOMContentLoaded", init);

// ===== ลงทะเบียน service worker (สำหรับ offline shell / PWA) =====
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => {
      console.warn("ลงทะเบียน service worker ไม่สำเร็จ:", e);
    });
  });
}
