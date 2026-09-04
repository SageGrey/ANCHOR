// Writes the ANCHOR_Ownership property into the site data.
//
// Run:  node scripts/set-ownership.mjs
//
// The dashboard reads ownership from the data. It does not classify
// sites itself. This script is the prototype's stand-in for that
// column. When the ANCHOR intake form collects ownership directly,
// delete this script and the table below.
//
// Why the table is necessary today: the survey has no "who owns this
// site" field. It has AgencyOrPartner_FillingForm and ManagingPartner,
// both free text, and both hold the name of the organisation that
// filled in the form. That organisation is frequently a conservation
// non-profit that helps a private landowner. The Southeastern
// Grasslands Institute is the clearest example: it appears on many of
// the Tennessee records, but it owns none of that land.
//
// Each entry gives a confidence value and the evidence used. Show the
// low-confidence entries to the ANCHOR data owners before launch.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DATA_PATH = path.join(
    import.meta.dirname,
    "..",
    "data",
    "ANCHOR_sites.geojson",
);

// The same classes, keyed by site name, for a source that has no
// ownership column of its own. The ArcGIS intake form is one: it does
// not ask who owns the site, so the dashboard reads this file instead.
// See js/config.js (data.ownershipUrl) and plans/ownership-data.md.
const OWNERSHIP_PATH = path.join(
    import.meta.dirname,
    "..",
    "data",
    "ANCHOR_ownership.json",
);

// Keyed by the trimmed ANCHOR_SiteName.
//   class      — "public" | "private" | "non-profit"
//   confidence — "high" | "medium" | "low"
//   basis      — the evidence for the class
const OWNERSHIP = {
    "MOTSU": {
        class: "public",
        confidence: "high",
        basis: "Military Ocean Terminal Sunny Point, US Army. Brunswick County NC.",
    },
    "Bobwhite Quail Focus Area": {
        class: "public",
        confidence: "high",
        basis:
            "Letterkenny Army Depot, Franklin County PA. The PA Game Commission " +
            "manages about 2,700 acres of quail habitat there. The record says " +
            "2,951 acres, which agrees.",
    },
    "Melvern Lake": {
        class: "public",
        confidence: "high",
        basis: "US Army Corps of Engineers reservoir. Osage County KS.",
    },
    "Tipover and North Coves": {
        class: "public",
        confidence: "high",
        basis: "Harlan County Lake, US Army Corps of Engineers. Harlan County NE.",
    },
    "North Shore": {
        class: "public",
        confidence: "high",
        basis: "Harlan County Lake, US Army Corps of Engineers. Harlan County NE.",
    },
    "Melrose Air Force Range": {
        class: "public",
        confidence: "high",
        basis: "US Air Force range. Roosevelt County NM.",
    },
    "Rathbun Lake": {
        class: "public",
        confidence: "high",
        basis: "US Army Corps of Engineers reservoir. Appanoose County IA.",
    },
    "Stockton Lake (Masters and Hawker Point South)": {
        class: "public",
        confidence: "high",
        basis: "US Army Corps of Engineers reservoir. Cedar County MO.",
    },
    "Wilson Lake Admin Grazing": {
        class: "public",
        confidence: "high",
        basis: "US Army Corps of Engineers reservoir. Lincoln County KS.",
    },
    "Kanopolis Lake": {
        class: "public",
        confidence: "high",
        basis: "US Army Corps of Engineers reservoir. Ellsworth County KS.",
    },
    "Dunbar Cave Prairie": {
        class: "public",
        confidence: "high",
        basis: "Dunbar Cave State Park, Tennessee State Parks. Montgomery County TN.",
    },
    "Barnett Woods and Prairie State Natural Area": {
        class: "public",
        confidence: "high",
        basis:
            "Barnett's Woods State Natural Area, Montgomery County TN. The Nature " +
            "Conservancy bought it in 1981 and transferred it to the State of " +
            "Tennessee in 2005. This entry was 'non-profit' in the prototype, " +
            "which was wrong. NOTE: the natural area is 40 acres but the record " +
            "says 455 acres, so the ANCHOR site probably includes adjacent land " +
            "that the state does not own. Confirm with the data owners.",
    },
    "Cornelia Fort": {
        class: "public",
        confidence: "medium",
        basis:
            "Cornelia Fort Airpark, Davidson County TN. Metro Nashville Parks " +
            "holds the land next to Shelby Bottoms Greenway.",
    },
    "Penn Prairie": {
        class: "non-profit",
        confidence: "medium",
        basis:
            "Mahaska County IA, next to Oskaloosa. Probably land of William Penn " +
            "University, a private non-profit university. Confirm.",
    },
    "Spring Creek Prairie": {
        class: "non-profit",
        confidence: "low",
        basis:
            "Montgomery County TN. No public record of a Tennessee site with " +
            "this name. The name is the same as the Audubon Spring Creek Prairie " +
            "in Nebraska, which is a different place. Confirm the name and the owner.",
    },
    "Guthrie Wet Prairie": {
        class: "non-profit",
        confidence: "low",
        basis:
            "Montgomery County TN, south of Guthrie KY. The site is in Tennessee, " +
            "not Kentucky. Owner not confirmed.",
    },
    "Eagleville Wet Prairie": {
        class: "non-profit",
        confidence: "low",
        basis: "Rutherford County TN. Owner not confirmed.",
    },
    "King Savanna": {
        class: "private",
        confidence: "medium",
        basis: "Dickson County TN. Southeastern Grasslands Institute assists here.",
    },
    "Morgan Farm": {
        class: "private",
        confidence: "medium",
        basis: "Dickson County TN. 'Farm' in the name indicates private land.",
    },
    "Best Hope Farm": {
        class: "private",
        confidence: "medium",
        basis: "Dickson County TN. 'Farm' in the name indicates private land.",
    },
    "Lambrecht": {
        class: "private",
        confidence: "medium",
        basis: "Wilson County TN. The name appears to be a landowner surname.",
    },
    "Eyheralde Savanna": {
        class: "private",
        confidence: "medium",
        basis: "Lucas County IA. The name appears to be a landowner surname.",
    },
    "Kansas Hills": {
        class: "private",
        confidence: "low",
        basis:
            "Robertson County TN, near the Kansas community. Not in Kansas. " +
            "Owner not confirmed.",
    },
    "Van Hook Savanna": {
        class: "private",
        confidence: "low",
        basis: "Robertson County TN. Owner not confirmed.",
    },
    "Lytle Bend Meadow": {
        class: "public",
        confidence: "low",
        basis: "Davidson County TN. Owner not confirmed.",
    },
    "Old Town Meadow": {
        class: "private",
        confidence: "low",
        basis: "Williamson County TN. Owner not confirmed.",
    },
    "Bask": {
        class: "private",
        confidence: "low",
        basis: "Hickman County TN. Owner not confirmed.",
    },
    "Arnold Prairie": {
        class: "private",
        confidence: "low",
        basis: "Mahaska County IA. Owner not confirmed.",
    },
    "Frog Valley": {
        class: "private",
        confidence: "low",
        basis: "Saline County AR. Owner not confirmed.",
    },
};

const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

let written = 0;
const unmatched = [];

for (const feature of data.features) {
    const name = (feature.properties.ANCHOR_SiteName || "").trim();
    const entry = OWNERSHIP[name];

    // Records with no geometry never reach the map. The one such
    // record holds a numeric id in place of a name, so leave it alone.
    if (!entry) {
        if (feature.geometry) unmatched.push(name);
        continue;
    }

    feature.properties.ANCHOR_Ownership = entry.class;
    feature.properties.ANCHOR_OwnershipConfidence = entry.confidence;
    written += 1;
}

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n");

// The side file carries the basis note as well. The dashboard ignores
// it, but it is the reason each class was chosen, and it has to travel
// with the class rather than sit only in this script.
const bySite = {};
for (const [name, entry] of Object.entries(OWNERSHIP)) {
    bySite[name] = {
        ownership: entry.class,
        confidence: entry.confidence,
        basis: entry.basis,
    };
}
fs.writeFileSync(OWNERSHIP_PATH, JSON.stringify(bySite, null, 2) + "\n");

console.log(`Wrote ANCHOR_Ownership for ${written} sites.`);
console.log(
    `Wrote ${Object.keys(bySite).length} entries to ` +
        path.relative(process.cwd(), OWNERSHIP_PATH) + ".",
);

const byConfidence = { high: 0, medium: 0, low: 0 };
for (const entry of Object.values(OWNERSHIP)) byConfidence[entry.confidence] += 1;
console.log(
    `Confidence: ${byConfidence.high} high, ${byConfidence.medium} medium, ` +
        `${byConfidence.low} low.`,
);

if (unmatched.length > 0) {
    console.error(
        `\nNo classification for ${unmatched.length} mapped site(s):\n  ` +
            unmatched.join("\n  "),
    );
    process.exitCode = 1;
}
