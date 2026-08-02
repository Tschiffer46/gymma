/**
 * Kontrollerar beroendefällorna som kraschar appen TYST.
 *
 * Bakgrund: Sprint 1 gick till TestFlight med all NativeWind-styling död.
 * `tsc`, `test:db` och `expo export` gick alla igenom — ingen av dem säger något
 * om huruvida stilar faktiskt appliceras vid körning. Felet upptäcktes via ett
 * fotografi av telefonen.
 *
 * Orsaken var beroendedrift: `nativewind: "^4.1.23"` löstes till 4.2.6, som
 * kräver react-native-css-interop 0.2.6, medan vår direkta dependency krävde
 * 0.1.22. npm installerade båda, och babel-transformen respektive
 * runtime-registret hamnade i olika kopior.
 *
 * Körs av `npm run verify`.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const pkg = require(path.join(ROOT, "package.json"));

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const pass = (msg) => console.log(`  ✓ ${msg}`);

function version(mod) {
  try {
    return require(path.join(ROOT, "node_modules", mod, "package.json")).version;
  } catch {
    return null;
  }
}

/** Alla installerade kopior av ett paket, inklusive nästlade under andra paket. */
function copies(name, dir = path.join(ROOT, "node_modules"), found = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(dir, e.name);
    if (e.name === name || (e.name.startsWith("@") && false)) {
      const manifest = path.join(full, "package.json");
      if (fs.existsSync(manifest)) {
        found.push({ dir: path.relative(ROOT, full), version: require(manifest).version });
      }
    }
    const nested = path.join(full, "node_modules");
    if (fs.existsSync(nested)) copies(name, nested, found);
  }
  return found;
}

/** Minimal ^-range-kontroll. RN använder bara caret i sin peer-range. */
function satisfiesCaret(v, range) {
  if (!v || !range) return false;
  const clean = range.replace(/^[\^~]/, "");
  if (!range.startsWith("^")) return v === clean;
  const [a, b, c] = clean.split(".").map(Number);
  const [x, y, z] = v.split(".").map(Number);
  if (x !== a) return false;
  if (y !== b) return y > b;
  return z >= c;
}

console.log("Beroendekontroller");

// 1. Exakt en react-native-css-interop. Två kopior = tyst död styling.
const interop = copies("react-native-css-interop");
if (interop.length === 1) {
  pass(`react-native-css-interop: en kopia (${interop[0].version})`);
} else {
  fail(
    `react-native-css-interop finns i ${interop.length} kopior — NativeWind blir tyst verkningslös:\n` +
      interop.map((c) => `      ${c.version}  ${c.dir}`).join("\n"),
  );
}

// 2. NativeWind måste vara pinnad. Caret-drift är precis det som gick fel.
for (const dep of ["nativewind", "react-native-css-interop"]) {
  const declared = pkg.dependencies[dep];
  if (/^[\^~]/.test(declared)) {
    fail(`${dep} är deklarerad som "${declared}" — måste pinnas exakt (inget ^ eller ~)`);
  } else if (version(dep) !== declared) {
    fail(`${dep}: package.json säger ${declared} men ${version(dep)} är installerad`);
  } else {
    pass(`${dep} pinnad till ${declared}`);
  }
}

// 3. react måste matcha react-natives renderer, annars kraschar appen tyst i
//    produktion — felet syns bara i dev client.
const rnPeer = require(path.join(ROOT, "node_modules", "react-native", "package.json"))
  .peerDependencies.react;
const reactVersion = version("react");
if (satisfiesCaret(reactVersion, rnPeer)) {
  pass(`react ${reactVersion} matchar react-natives krav ${rnPeer}`);
} else {
  fail(`react ${reactVersion} matchar INTE react-natives krav ${rnPeer}`);
}

console.log("");
if (failures > 0) {
  console.error(`${failures} kontroll(er) misslyckades.`);
  process.exit(1);
}
console.log("Beroendena ser riktiga ut.");
