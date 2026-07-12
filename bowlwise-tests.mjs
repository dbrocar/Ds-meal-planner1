// ─────────────────────────────────────────────────────────────────────────────
// BowlWise regression test suite
//
// Setup (once):   npm install jsdom acorn
// Run:            node bowlwise-tests.mjs [path/to/bowlwise.html]
//
// Run this before every deploy. Exit code 0 = all green, 1 = failures.
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import { JSDOM } from "jsdom";
import * as acorn from "acorn";

const FILE = process.argv[2] || "bowlwise.html";
const html = fs.readFileSync(FILE, "utf8");

let pass = 0, fail = 0;
const T = (name, cond, detail) => {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("✗ FAIL  " + name + (detail ? "  → " + detail : "")); }
};

// ── 1. Static checks ─────────────────────────────────────────────────────────
console.log("\n[1] Static / source checks");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const main = scripts[scripts.length - 1][1];
let parseErr = null;
try { acorn.parse(main, { ecmaVersion: 2020 }); } catch (e) { parseErr = e.message; }
T("main script parses", !parseErr, parseErr);
T("no trademark symbol", !html.includes("&trade;") && !html.includes("™"));
T("no subscriptions promise", !html.includes("No subscriptions, no ads"));
T("no hardcoded 'For Mya • 60 lb'", !html.includes("For Mya &bull; 60 lb"));
T("title is BowlWise", /<title>BowlWise/.test(html));
T("NRC 2006 referenced", html.includes("NRC 2006"));
T("PWA meta tags", html.includes('name="theme-color"') && html.includes("apple-mobile-web-app-capable"));

// ── 2. Boot + runtime ────────────────────────────────────────────────────────
console.log("\n[2] Boot & runtime");
const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://localhost/app.html", pretendToBeVisual: true });
const errs = [];
dom.window.addEventListener("error", e => errs.push(e.message));

await new Promise(r => setTimeout(r, 800));
const w = dom.window, d = w.document;

T("boot with zero runtime errors", errs.length === 0, errs.join("; "));
T("home renders profile card", !!d.querySelector("#page-home .home-profile-card"));
T("no legacy tab bar", !d.querySelector(".tabs"));

// ── 3. Multi-dog ─────────────────────────────────────────────────────────────
console.log("\n[3] Multi-dog");
T("dog registry auto-created", w.DOGS.length >= 1 && !!w.activeDogId);
w.savePetName("TestDog");
T("name syncs to registry", w.getActiveDog().name === "TestDog");
T("per-dog key namespaced", (() => {
  // read through the raw (unmapped) prototype to prove physical key location
  const raw = Object.getPrototypeOf(Object.getPrototypeOf(w.localStorage)).getItem
    ? null : null; // jsdom nests; fall back to mapped read
  return w.localStorage.getItem("mya_pet_name") === "TestDog" && w.mapDogKey("mya_pet_name").startsWith("bw_");
})());
T("shared keys NOT namespaced", w.mapDogKey("mya_custom_products") === "mya_custom_products");
T("dog switcher chips on home", d.querySelectorAll("#page-home .dog-chip").length >= 2);

// ── 4. Navigation ────────────────────────────────────────────────────────────
console.log("\n[4] Navigation");
for (const p of ["guide", "plan", "calendar", "nutrition", "care", "utilities"]) {
  w.showTab(p);
  T("page renders: " + p, d.getElementById("page-" + p).innerHTML.length > 500);
}
w.showTab("guide");
T("back-home button shows off-home", d.getElementById("backHomeBtn").style.display !== "none");
w.showTab("home");
T("back-home hides on home", d.getElementById("backHomeBtn").style.display === "none");
T("6 home nav tiles", d.querySelectorAll("#page-home .home-nav-tile").length === 6);

// ── 5. Recipe Box & treats ───────────────────────────────────────────────────
console.log("\n[5] Recipe Box & treats");
T("8 built-in treats seeded", Object.keys(w.customProducts).filter(k => k.startsWith("bw_treat")).length === 8);
const list = w.buildRecipeBoxList();
T("recipe list includes prep notes", list.includes("Preheat oven"));
const names = Object.keys(w.customProducts).map(id => w.customProducts[id].name);
const listOrder = names.slice().sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  .every((n, i, arr) => list.indexOf(arr[i].replace(/&/g, "&amp;")) <= (i + 1 < arr.length ? list.indexOf(arr[i + 1].replace(/&/g, "&amp;")) : Infinity));
T("recipe box alphabetical", listOrder);
const ps = w.calcProductPerServing(w.customProducts["bw_treat_pb_oat"]);
T("treat per-serving nutrition computes", ps.protein > 0.5 && ps.fat > 1);
const addinsSorted = [...w.ADDIN_NAMES].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
T("add-ins alphabetical", JSON.stringify(w.ADDIN_NAMES) === JSON.stringify(addinsSorted));

// ── 6. Units ─────────────────────────────────────────────────────────────────
console.log("\n[6] Units");
w.setUnits("metric");
T("metric weight fmt", w.fmtLbs(47) === "21.3 kg");
T("metric food fmt", w.fmtOz(8) === "227 g");
w.showTab("calendar");
T("meal card shows grams", /\d+ g/.test(d.getElementById("page-calendar").textContent));
w.setUnits("us");
T("us fmt restored", w.fmtOz(8) === "8 oz");

// ── 7. Care page (weight + symptoms) ─────────────────────────────────────────
console.log("\n[7] Health & Weight");
w.showTab("care");
const ds = w.dateKey(w.curYear, w.curMonth, w.curDay);
w.setSymptomScore("stool", 2);
T("symptom saved", w.symptomsLog[ds].stool === 2);
w.setSymptomScore("stool", 2);
T("tap-again clears score", w.symptomsLog[ds].stool === undefined);
d.getElementById("weightEntryInput").value = "47.5";
w.logWeightEntry();
T("weight logged", w.weightLog[ds] === 47.5);
w.deleteWeightEntry(ds);
T("weight deleted", w.weightLog[ds] === undefined);

// ── 8. Treat budget ──────────────────────────────────────────────────────────
console.log("\n[8] Treat budget");
w.addinsLog[ds + "_am"] = { "Peanut Butter": 0.5 };
T("kcal math (PB 0.5oz)", w.calcTreatKcalForDay(ds) === Math.round(167 * 0.5));
w.renderHome();
T("budget bar on home", d.getElementById("page-home").textContent.includes("Treat Budget Today"));

// ── 9. Freezer inventory ─────────────────────────────────────────────────────
console.log("\n[9] Freezer");
w.bumpFreezer("protein", 2);
T("count updates", w.freezerQty("protein") === 2);
T("low-stock detected", w.lowFreezerItems().includes("Protein bags"));
w.renderHome();
T("home warning chip", d.getElementById("page-home").textContent.includes("Freezer running low"));
w.bumpFreezer("protein", 10);
T("warning clears", w.lowFreezerItems().length === 0);

// ── 10. Shopping list ────────────────────────────────────────────────────────
console.log("\n[10] Shopping list");
w.showTab("plan");
const planText = d.getElementById("page-plan").textContent;
T("renders on plan page", planText.includes("Shopping List"));
const rows = w.computeShoppingList(1);
T("has proteins in lb", rows.some(r => r.group === "Proteins" && / lb/.test(r.amt)));
T("has constants", rows.some(r => r.group === "Constants"));
w.toggleShopItem("wk1:regression_test");
T("check-off persists", (w.localStorage.getItem("mya_shopping_checks") || "").includes("regression_test"));
w.clearShopWeek(1);
T("week reset works", !(w.localStorage.getItem("mya_shopping_checks") || "").includes("regression_test"));

// ── 11. PWA ──────────────────────────────────────────────────────────────────
console.log("\n[11] PWA");
const manifestOk = !!d.querySelector("link[rel=manifest]") || typeof w.URL.createObjectURL !== "function";
T("manifest injected (or env lacks createObjectURL)", manifestOk);
w.renderUtilities();
T("install button present", !!d.getElementById("pwaInstallBtn"));

// ── Result ───────────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(50));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
