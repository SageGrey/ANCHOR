# Tablet widths

## The position

> I designed the site to work well from full desktop (1440px) to small
> mobile (320px) sizes, but worth noting that the in-between tablet
> views were made to be a smooth transition between the two rather than
> a stand alone design. I believe that works well and looks good, but
> if for some reason there is a strong need for tablet-specific design
> we can discuss how to add that later.

**This is the right position. No work is proposed.** This document
records what the layout does today and what would have to change if
the client asks for a tablet design.

## How the layout works now

| Width | Layout |
| --- | --- |
| 1111 px and up | Full desktop. Header holds the brand and three dropdowns. Footer holds the brand, the stats and the export button |
| 1001 to 1110 px | Desktop, with the stat figures made smaller and the gap between them reduced |
| 1000 px and below | The grid layout. Header and footer become `display: contents`, and their children are placed as grid areas: topbar, map, stats, controls, brand |
| 500 px and below | Smaller stat figures and a smaller popup title |
| 400 px and below | Smaller stat figures again, and the stats spread across the width |

A tablet in landscape, at 1024 px, gets the desktop layout. A tablet
in portrait, at 768 px, gets the grid layout. Rotating crosses the
1000 px line, so the layout changes on rotation. That is intended.

## What was checked

The accessibility work tested 1440, 768 and 320 pixels wide. axe
reports nothing at any of the three. The layout holds at all three.

That is a check that nothing is broken. It is not a design review.

## If a tablet design is asked for

The likely complaint at 768 to 1024 px is that space is wasted. The
grid layout was drawn for a phone. On a tablet the map is wide, and
the controls sit in a row under it that could fit beside it.

The most likely change is a middle layout for roughly 700 to 1000 px:

- Keep the three separate dropdowns instead of the single mobile
  accordion. There is room for them.
- Put the stats and the controls in one row, not two.
- Give the map more height.

The code makes this reasonably cheap. The desktop and mobile filter
controls are already two separate parts of the page showing one state,
kept in step by `mirrorFilterCheckbox` in `js/main.js`. A middle
layout would show the desktop set at a width where the mobile set is
shown today. No JavaScript changes.

The cost is a third layout to test and to keep working. That is the
reason not to build one without a clear need.

## Open questions

1. Does the client have tablet numbers in their analytics? If tablets
   are a small share of readers, this is settled.
2. Is there a specific complaint about a tablet width, or is this a
   general worry? A specific complaint can be fixed on its own.
3. Will the dashboard be shown on a tablet at an event or in a
   presentation? That is a different case from casual browsing and
   may justify a design of its own.
