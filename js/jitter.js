//* JITTER.JS *//
//
// Moves the shown position of a site away from its true position, so
// that the map does not give the exact location of private land.
//
// The browser loads this file as a plain script. scripts/ loads the
// same file with require(), so the dashboard and the data preparation
// step always use one algorithm. Do not copy this code.
//
// IMPORTANT — what this file does and does not do:
//
//   The dashboard applies the offset when it draws. That changes what
//   a person sees. It does not remove the true coordinates from the
//   data the browser downloaded. Anyone can read them.
//
//   Only the data can give real protection. Run
//   scripts/jitter-locations.mjs before you publish, or apply the same
//   offset in the API. Both write ANCHOR_LocationApproximate: true,
//   which tells the dashboard the work is already done.
//
// See plans/location-privacy.md.

(function (root) {
    "use strict";

    // The largest distance a site can move, in metres.
    //
    // 750 m hides which parcel a site is on. It is also small enough
    // that a site stays in its own county in almost all cases, which
    // keeps the map honest at state level.
    //
    // Do not lower this value without a privacy review. A radius near
    // the size of a field lets a reader find the parcel again.
    const JITTER_RADIUS_M = 750;

    // Metres per degree of latitude. Longitude is this value times the
    // cosine of the latitude.
    const METRES_PER_DEGREE = 111320;

    // 53-bit string hash (cyrb53). It gives the same result on every
    // run and in every browser, so a site does not move between page
    // loads or between users.
    function hashString(text, seed) {
        let h1 = 0xdeadbeef ^ seed;
        let h2 = 0x41c6ce57 ^ seed;
        for (let i = 0; i < text.length; i += 1) {
            const ch = text.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
            Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
            Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1 >>> 0);
    }

    // A number from 0 up to but not including 1.
    function unitValue(text, seed) {
        return hashString(text, seed) / 9007199254740992;
    }

    // Moves one point once. The offset is even across the full circle.
    // The square root on the radius prevents a cluster of points at
    // the centre.
    function offsetPoint(coordinates, key, radiusM) {
        const [lon, lat] = coordinates;

        const distance = radiusM * Math.sqrt(unitValue(key, 0x9e3779b9));
        const angle = 2 * Math.PI * unitValue(key, 0x85ebca6b);

        const northM = distance * Math.sin(angle);
        const eastM = distance * Math.cos(angle);

        const latOffset = northM / METRES_PER_DEGREE;
        const cosLat = Math.cos((lat * Math.PI) / 180);
        // Guard against a division by zero at the poles. No ANCHOR
        // site is near a pole, but the function must stay safe.
        const lonOffset = eastM /
            (METRES_PER_DEGREE * Math.max(Math.abs(cosLat), 1e-6));

        return [lon + lonOffset, lat + latOffset];
    }

    // How many positions to try at one radius before the radius is
    // halved, and how many times the radius can be halved.
    const TRIES_PER_RADIUS = 8;
    const RADIUS_STEPS = 6;

    /**
     * Moves one point by a fixed pseudo-random offset.
     *
     * With no isAllowed test, the result is even across a circle of
     * radiusM around the true point.
     *
     * With an isAllowed test, the result is even across the part of
     * that circle the test accepts. This keeps a site inside its own
     * state: a site 400 m from a state line must not appear on the
     * far side of it, because the dashboard counts and outlines states.
     *
     * If no accepted position is found, the radius is halved and the
     * search runs again. A smaller circle around an inside point is
     * more likely to fit, so the search ends. A site very close to a
     * line therefore moves less than one further inside. That is a
     * deliberate trade: a smaller offset is a smaller privacy margin,
     * but a site drawn in the wrong state is simply wrong.
     *
     * @param {array} coordinates - [longitude, latitude]
     * @param {string} key - identifies the site; the same key always
     *     gives the same offset
     * @param {object} [options]
     * @param {number} [options.radiusM] - largest distance, in metres
     * @param {function} [options.isAllowed] - given [lon, lat], returns
     *     true if that position may be used
     * @returns {array} the new [longitude, latitude]
     */
    function jitterCoordinates(coordinates, key, options) {
        const settings = options || {};
        const isAllowed = settings.isAllowed;
        let radius = settings.radiusM == null
            ? JITTER_RADIUS_M
            : settings.radiusM;

        for (let step = 0; step < RADIUS_STEPS; step += 1) {
            for (let attempt = 0; attempt < TRIES_PER_RADIUS; attempt += 1) {
                const candidate = offsetPoint(
                    coordinates,
                    `${key}#${step}.${attempt}`,
                    radius,
                );
                if (!isAllowed || isAllowed(candidate)) return candidate;
            }
            radius /= 2;
        }

        // Nothing was accepted. Returning the true point would publish
        // the exact location, so report the problem instead of hiding
        // it and let the caller decide.
        throw new Error(
            `Could not place "${key}" within ${RADIUS_STEPS} radius steps. ` +
                `Check the isAllowed test.`,
        );
    }

    const api = { JITTER_RADIUS_M, jitterCoordinates, hashString };

    // Browser: attach to the global object. Node: export.
    Object.assign(root, api);
    if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
