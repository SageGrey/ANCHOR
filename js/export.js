//* EXPORT MAP *//

// Fixed 16:9 PowerPoint-widescreen frame, independent of whatever
// shape the live browser viewport happens to be
const EXPORT_WIDTH = 3840;
const EXPORT_HEIGHT = 2160;
const EXPORT_FOOTER_HEIGHT = 260;

async function exportMapImage() {
    let vis = myMapVis;
    if (!vis) return;

    let mapCanvas = vis.map.getCanvas();
    let mapAreaHeight = EXPORT_HEIGHT - EXPORT_FOOTER_HEIGHT;

    // Composite the live basemap + overlay at their native (current
    // viewport) size first, as one unit, so it can be scaled into the
    // fixed export frame without distorting the map/hexagons relative
    // to each other.
    let liveCanvas = document.createElement("canvas");
    liveCanvas.width = mapCanvas.width;
    liveCanvas.height = mapCanvas.height;
    let liveCtx = liveCanvas.getContext("2d");

    // Requires preserveDrawingBuffer: true on the Map (see map.js),
    // otherwise this can read back blank
    liveCtx.drawImage(mapCanvas, 0, 0);

    // Hexagons + state outlines, always showing the full unfiltered
    // network regardless of what's currently filtered on screen
    let svgMarkup = vis.getUnfilteredSvgSnapshot();
    let svgImage = await loadImage(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`,
    );
    liveCtx.drawImage(svgImage, 0, 0, mapCanvas.width, mapCanvas.height);

    let exportCanvas = document.createElement("canvas");
    exportCanvas.width = EXPORT_WIDTH;
    exportCanvas.height = EXPORT_HEIGHT;
    let ctx = exportCanvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";

    // "Cover" fit: scale uniformly (no stretching) so the live capture
    // fully fills the map area, cropping whatever overflows, centered
    let coverScale = Math.max(
        EXPORT_WIDTH / liveCanvas.width,
        mapAreaHeight / liveCanvas.height,
    );
    let drawWidth = liveCanvas.width * coverScale;
    let drawHeight = liveCanvas.height * coverScale;
    ctx.drawImage(
        liveCanvas,
        (EXPORT_WIDTH - drawWidth) / 2,
        (mapAreaHeight - drawHeight) / 2,
        drawWidth,
        drawHeight,
    );

    await drawExportFooter(ctx, vis, {
        x: 0,
        y: mapAreaHeight,
        width: EXPORT_WIDTH,
        height: EXPORT_FOOTER_HEIGHT,
    });

    downloadCanvas(exportCanvas, "anchor-network-map.png");
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        let image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        image.src = src;
    });
}

function loadLogoImage() {
    return loadImage("assets/images/anchor-logo-large.png");
}

function downloadCanvas(canvas, filename) {
    canvas.toBlob((blob) => {
        let url = URL.createObjectURL(blob);
        let link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    });
}

// Draws the branding band: logo + wordmark on the left, summary stats on
// the right. Stats are recomputed from the full in-memory dataset, not
// read from the (filter-reactive) on-screen footer, so exports always
// show network totals regardless of active filters.
//
// Every measurement below is the actual on-page CSS value (.footer,
// --header-2/--caption tokens, etc.) times one uniform scale factor —
// not independently-guessed pixels — so spacing stays proportionally
// identical to the live footer at any export resolution.
async function drawExportFooter(ctx, vis, { x, y, width, height }) {
    let root = getComputedStyle(document.documentElement);
    let color = (name) => root.getPropertyValue(name).trim();

    await document.fonts.ready;

    ctx.fillStyle = color("--brown-50");
    ctx.fillRect(x, y, width, height);

    // On-page reference values
    const PAGE_PADDING = 30; // .footer padding (horizontal)
    const PAGE_STAT_GAP = 40; // .footer__stats gap
    const PAGE_VALUE_LABEL_GAP = 5; // .footer__stat gap
    const PAGE_VALUE_LINE_HEIGHT = 40; // --header-2 line-height
    const PAGE_VALUE_FONT_SIZE = 36; // --header-2 font-size
    const PAGE_LABEL_LINE_HEIGHT = 16; // --caption line-height
    const PAGE_LABEL_FONT_SIZE = 12; // --caption font-size
    const PAGE_LOGO_WIDTH = 130; // .footer__logo width
    // Stat block's natural height (padding + value + gap + label +
    // padding) — the reference the scale factor is computed against
    const PAGE_FOOTER_HEIGHT = PAGE_PADDING / 2 +
        PAGE_VALUE_LINE_HEIGHT +
        PAGE_VALUE_LABEL_GAP +
        PAGE_LABEL_LINE_HEIGHT +
        PAGE_PADDING / 2;

    let scale = height / PAGE_FOOTER_HEIGHT;
    let padding = PAGE_PADDING * scale;

    // Logo + wordmark, vertically centered as a row (matches .footer's
    // align-items: center)
    let logo = await loadLogoImage();
    let logoWidth = PAGE_LOGO_WIDTH * scale * 0.6;
    let logoHeight = logoWidth * (logo.height / logo.width);
    let logoX = x + padding;
    let logoY = y + (height - logoHeight) / 2;
    ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);

    ctx.font = `700 ${PAGE_VALUE_FONT_SIZE * 0.8 * scale}px Montserrat`;
    ctx.fillStyle = color("--blue-900");
    ctx.textBaseline = "middle";
    ctx.fillText(
        "Anchor Network",
        logoX + logoWidth + PAGE_VALUE_LABEL_GAP * scale * 3,
        logoY + logoHeight / 2,
    );

    // Unfiltered totals, over the sites the map can show. Records with
    // no location are left out, exactly as the on-screen footer leaves
    // them out, so an export and the page always agree.
    let allFeatures = vis.features;
    let totalAcres = Math.round(
        allFeatures.reduce(
            (sum, f) =>
                sum + (f.properties.Calculation_ANCHOR_ACRES_TOTAL || 0),
            0,
        ),
    ).toLocaleString();
    let totalSites = String(allFeatures.length);
    let totalStates = vis.statePolygons
        ? resolveAnchorStates(vis.features, vis.statePolygons).size
        : null;

    // Order matches the on-page footer: Sites, Acres, States
    let stats = [
        { value: totalSites, suffix: "", label: "ANCHOR Sites" },
        { value: totalAcres, suffix: "", label: "Acres of ANCHOR Sites" },
        {
            value: totalStates !== null ? String(totalStates) : "—",
            suffix: " of 50",
            label: "States with ANCHOR Sites",
        },
    ];

    // The suffix ("of 50") uses the exact same font as the value on
    // screen — only its color differs.
    let valueFont = `700 ${PAGE_VALUE_FONT_SIZE * scale}px Montserrat`;
    let labelFont = `400 ${PAGE_LABEL_FONT_SIZE * scale}px Montserrat`;
    let valueLineHeight = PAGE_VALUE_LINE_HEIGHT * scale;
    let valueLabelGap = PAGE_VALUE_LABEL_GAP * scale;
    let labelLineHeight = PAGE_LABEL_LINE_HEIGHT * scale;
    let columnGap = PAGE_STAT_GAP * scale;

    // Each column is as wide as its own content (value+suffix or
    // label, whichever is wider) — matching how .footer__stat sizes
    // itself to content on the page, rather than a fixed grid
    let columnWidths = stats.map((stat) => {
        ctx.font = valueFont;
        let valueWidth = ctx.measureText(stat.value).width +
            (stat.suffix ? ctx.measureText(stat.suffix).width : 0);
        ctx.font = labelFont;
        let labelWidth = ctx.measureText(stat.label).width;
        return Math.max(valueWidth, labelWidth);
    });
    let totalStatsWidth = columnWidths.reduce((sum, w) => sum + w, 0) +
        columnGap * (stats.length - 1);

    let stackTop = y +
        (height - (valueLineHeight + valueLabelGap + labelLineHeight)) / 2;
    let columnX = width - padding - totalStatsWidth;

    ctx.textBaseline = "top";
    stats.forEach((stat, i) => {
        ctx.font = valueFont;
        ctx.fillStyle = color("--blue-900");
        ctx.fillText(stat.value, columnX, stackTop);

        if (stat.suffix) {
            let valueWidth = ctx.measureText(stat.value).width;
            ctx.fillStyle = color("--grey-300");
            ctx.fillText(stat.suffix, columnX + valueWidth, stackTop);
        }

        ctx.font = labelFont;
        ctx.fillStyle = color("--blue-900");
        ctx.fillText(
            stat.label,
            columnX,
            stackTop + valueLineHeight + valueLabelGap,
        );

        columnX += columnWidths[i] + columnGap;
    });
}

document.addEventListener("DOMContentLoaded", () => {
    let btn = document.getElementById("export-map-btn");

    btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
            await exportMapImage();
        } catch (err) {
            console.error("Map export failed:", err);
        } finally {
            btn.disabled = false;
        }
    });
});
