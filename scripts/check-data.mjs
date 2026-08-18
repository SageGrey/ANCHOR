// Checks the site data against the dashboard's own dropdown options.
//
// Run:  node scripts/check-data.mjs [path/to/sites.geojson]
//
// Two questions this answers, both of which QA must ask before launch:
//
//   Is every dropdown option real? An option that matches no site
//   gives the reader an empty map and no reason for it.
//
//   Is every site reachable? A site that matches no option in a
//   category disappears as soon as the reader touches that category,
//   whatever the site actually holds.
//
// The script needs no packages. It exits with a status of 1 if it
// finds a problem, so a build step can use it.
//
// It reads the option values out of index.html rather than repeating
// them. If somebody adds an option to the page and not to the data,
// this script reports it. A copy of the list here would not.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.join(import.meta.dirname, "..");
const dataPath = process.argv[2] ||
    path.join(ROOT, "data", "ANCHOR_sites.geojson");

const LANDCOVER_PREFIXES = [
    "NatGrass",
    "PollHabMilkweed",
    "PollHabNectPlants",
    "NatLongSav",
    "MixedPineSav",
    "GrazLandswCP",
    "CroplandwCP",
];

const OWNERSHIP_CLASSES = ["public", "private", "non-profit"];

// ---- read the options the page offers ----

// Each option is <input ... value="X"> followed by its visible text
// before the closing </label>.
function readDropdownOptions() {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const pattern =
        /<input[^>]*class="filter-checkbox"[^>]*value="([^"]+)"[^>]*>\s*([^<]*)/g;

    const options = new Map();
    let match;
    while ((match = pattern.exec(html)) !== null) {
        options.set(match[1], match[2].trim());
    }
    return options;
}

// ---- the dashboard's own matching rules, repeated here ----
//
// These must stay the same as siteHasLandCover and siteHasPractice in
// js/map.js. If you change one, change the other.

function siteHasLandCover(properties, prefix) {
    const value = properties[`${prefix}_EstAcres`];
    return typeof value === "number" && value > 0;
}

function siteHasPractice(properties, code) {
    return LANDCOVER_PREFIXES.some((prefix) =>
        Object.keys(properties).some((key) =>
            key.startsWith(prefix) &&
            key.endsWith(`_${code}`) &&
            typeof properties[key] === "number" &&
            properties[key] > 0
        )
    );
}

// ---- run ----

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const mapped = data.features.filter((feature) => feature.geometry);
const options = readDropdownOptions();

// Sort each option into its category by what it looks like.
const ownerValues = [...options.keys()].filter((v) =>
    OWNERSHIP_CLASSES.includes(v)
);
const landcoverValues = [...options.keys()].filter((v) =>
    LANDCOVER_PREFIXES.includes(v)
);
const practiceValues = [...options.keys()].filter((v) =>
    !ownerValues.includes(v) && !landcoverValues.includes(v)
);

const problems = [];
const warnings = [];

console.log(`Data:  ${dataPath}`);
console.log(
    `Sites: ${data.features.length} records, ${mapped.length} with a location\n`,
);

function report(title, values, countFor) {
    console.log(title);
    for (const value of values) {
        const count = mapped.filter((f) => countFor(f.properties, value)).length;
        const label = options.get(value) || value;
        const flag = count === 0 ? "   <-- MATCHES NO SITE" : "";
        console.log(`  ${label.padEnd(32)} ${String(count).padStart(3)}${flag}`);
        if (count === 0) {
            problems.push(
                `Option "${label}" (${value}) matches no site. Either the ` +
                    `option must go, or the data for it is missing.`,
            );
        }
    }
    console.log();
}

report(
    "ANCHOR Ownership",
    ownerValues,
    (properties, value) => properties.ANCHOR_Ownership === value,
);
report("Primary Land Cover", landcoverValues, siteHasLandCover);
report("Conservation Practices", practiceValues, siteHasPractice);

// ---- sites no option can reach ----

function reportUnreachable(category, values, test) {
    const missed = mapped.filter(
        (f) => !values.some((value) => test(f.properties, value)),
    );
    if (missed.length === 0) return;

    console.log(
        `Sites that match no ${category} option (${missed.length}):`,
    );
    for (const feature of missed) {
        console.log(`  ${feature.properties.ANCHOR_SiteName}`);
    }
    console.log();
    warnings.push(
        `${missed.length} site(s) vanish as soon as any ${category} option ` +
            `is selected, because they match none of them.`,
    );
}

reportUnreachable(
    "ownership",
    ownerValues,
    (properties, value) => properties.ANCHOR_Ownership === value,
);
reportUnreachable("land cover", landcoverValues, siteHasLandCover);
reportUnreachable("conservation practice", practiceValues, siteHasPractice);

// ---- values in the data that the page does not offer ----

const unknownOwnership = new Set();
for (const feature of mapped) {
    const value = feature.properties.ANCHOR_Ownership;
    if (value != null && !ownerValues.includes(value)) unknownOwnership.add(value);
}
if (unknownOwnership.size > 0) {
    problems.push(
        `The data holds ownership values the page does not offer: ` +
            `${[...unknownOwnership].join(", ")}.`,
    );
}

// ---- result ----

if (problems.length === 0 && warnings.length === 0) {
    console.log("No problems found.");
    process.exit(0);
}

for (const problem of problems) console.log(`PROBLEM: ${problem}`);
for (const warning of warnings) console.log(`WARNING: ${warning}`);

console.log(
    `\n${problems.length} problem(s), ${warnings.length} warning(s).`,
);
process.exit(problems.length > 0 ? 1 : 0);
