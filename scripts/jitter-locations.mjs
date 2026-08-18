// Applies the privacy offset to the site data itself.
//
// Run:  node scripts/jitter-locations.mjs <input.geojson> [output.geojson]
//
// WHY THIS SCRIPT EXISTS
//
// The dashboard offsets private sites when it draws them. That is a
// display behaviour only. The browser still downloads the true
// coordinates, and anyone can read them from the network tab or from
// the repository. The offset in the browser protects nobody.
//
// This script removes the true coordinates from the published file. Run
// it on the export from the ANCHOR database before that file goes to a
// public server, or apply the same offset in the API that serves the
// data. Keep the true coordinates in the private system only.
//
// The script writes ANCHOR_LocationApproximate: true on every site it
// moves. The dashboard reads that flag, leaves the coordinates alone,
// and still draws the circle. So the file is safe to serve and the map
// still tells the reader that the point is not exact.
//
// The script never overwrites the input file. Give an output path, or
// it writes beside the input with a ".public" name.
//
// See plans/location-privacy.md.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

// js/jitter.js is the same file the browser loads. Loading it here
// keeps one algorithm, so the published data and the prototype agree.
const require = createRequire(import.meta.url);
const { jitterCoordinates, JITTER_RADIUS_M } = require(
    path.join(import.meta.dirname, "..", "js", "jitter.js"),
);

const [inputPath, outputArg] = process.argv.slice(2);

if (!inputPath) {
    console.error(
        "Usage: node scripts/jitter-locations.mjs <input.geojson> [output.geojson]",
    );
    process.exit(2);
}

const outputPath = outputArg ||
    inputPath.replace(/(\.geojson)$/i, ".public$1");

if (path.resolve(outputPath) === path.resolve(inputPath)) {
    console.error("Refusing to overwrite the input file. Give an output path.");
    process.exit(2);
}

// State boundaries, so that a site cannot move across a state line.
// The dashboard counts states and outlines them, so a marker on the
// wrong side would contradict the numbers under the map. Several
// ANCHOR sites are within the offset radius of a line.
//
// The check is skipped if the boundaries cannot be read. Say so
// loudly: the output is still safe to publish, but a border site may
// appear in the wrong state.
const STATE_BOUNDARY_URL =
    "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

// TopoJSON is decoded here rather than with the topojson-client
// package. The repository has no package.json and the dashboard takes
// its libraries from a CDN, so this script must run with nothing
// installed.
//
// A TopoJSON arc is a list of steps, not of points. Each step is added
// to the one before it, then scaled and moved into degrees.
function decodeArc(topo, index) {
    const arc = topo.arcs[index];
    if (!topo.transform) return arc.map((point) => point.slice());

    const [scaleX, scaleY] = topo.transform.scale;
    const [translateX, translateY] = topo.transform.translate;
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
        x += dx;
        y += dy;
        return [x * scaleX + translateX, y * scaleY + translateY];
    });
}

// A ring is a list of arc numbers. A negative number ~i means arc i
// read backwards. Joined arcs share an end point, so drop the repeat.
function buildRing(topo, arcIndexes) {
    const points = [];
    for (const index of arcIndexes) {
        let arc = index < 0
            ? decodeArc(topo, ~index).reverse()
            : decodeArc(topo, index);
        if (points.length > 0) arc = arc.slice(1);
        points.push(...arc);
    }
    return points;
}

function topoToFeatures(topo, objectName) {
    return topo.objects[objectName].geometries.map((geometry) => ({
        type: "Feature",
        properties: geometry.properties || {},
        geometry: {
            type: geometry.type,
            coordinates: geometry.type === "Polygon"
                ? geometry.arcs.map((ring) => buildRing(topo, ring))
                : geometry.arcs.map((polygon) =>
                    polygon.map((ring) => buildRing(topo, ring))
                ),
        },
    }));
}

async function loadStatePolygons() {
    if (process.argv.includes("--no-state-check")) return null;
    try {
        const response = await fetch(STATE_BOUNDARY_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return topoToFeatures(await response.json(), "states");
    } catch (err) {
        console.warn(
            `WARNING: no state boundaries (${err.message}). A site near a ` +
                `state line can move across it. Run again with a network ` +
                `connection, or accept the risk.`,
        );
        return null;
    }
}

// Point in polygon by ray casting. Handles a polygon with holes and a
// multi-polygon.
function containsPoint(feature, point) {
    const inRing = ([x, y], ring) => {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
            const [xi, yi] = ring[i];
            const [xj, yj] = ring[j];
            if (
                yi > y !== yj > y &&
                x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
            ) {
                inside = !inside;
            }
        }
        return inside;
    };

    const polygons = feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;

    return polygons.some((rings) =>
        inRing(point, rings[0]) &&
        !rings.slice(1).some((hole) => inRing(point, hole))
    );
}

const statePolygons = await loadStatePolygons();

const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));

let moved = 0;
let exact = 0;
let alreadyDone = 0;
let unconstrained = 0;

for (const feature of data.features) {
    if (!feature.geometry) continue;

    const properties = feature.properties;
    const name = (properties.ANCHOR_SiteName || "").trim();

    if (properties.ANCHOR_LocationApproximate === true) {
        alreadyDone += 1;
        continue;
    }

    // Only "public" keeps its true point. An unknown class counts as
    // private. Getting this test the wrong way round would publish the
    // exact position of every site the classification missed.
    const ownership = String(properties.ANCHOR_Ownership || "")
        .trim()
        .toLowerCase();

    if (ownership === "public") {
        exact += 1;
        continue;
    }

    const trueCoordinates = feature.geometry.coordinates;
    const trueState = statePolygons
        ? statePolygons.find((state) => containsPoint(state, trueCoordinates))
        : null;

    try {
        feature.geometry.coordinates = jitterCoordinates(
            trueCoordinates,
            name,
            {
                isAllowed: trueState
                    ? (candidate) => containsPoint(trueState, candidate)
                    : null,
            },
        );
    } catch (err) {
        // Privacy first. Keep the offset and give up the state test.
        console.warn(`  ${name}: ${err.message} Offsetting without the test.`);
        feature.geometry.coordinates = jitterCoordinates(trueCoordinates, name);
        unconstrained += 1;
    }

    properties.ANCHOR_LocationApproximate = true;
    moved += 1;
}

fs.writeFileSync(outputPath, JSON.stringify(data, null, 2) + "\n");

console.log(`Read  ${inputPath}`);
console.log(`Wrote ${outputPath}`);
console.log(
    `Moved ${moved} site(s) by up to ${JITTER_RADIUS_M} m. ` +
        `Kept ${exact} public site(s) exact. ` +
        `${alreadyDone} site(s) were already offset.`,
);
console.log(
    statePolygons
        ? `State test applied. ${unconstrained} site(s) could not satisfy it.`
        : "State test SKIPPED. A border site can appear in the wrong state.",
);
console.log(
    "\nPublish the output file. Keep the input file in the private system.",
);
