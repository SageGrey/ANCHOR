# Move the Mapbox style and token to a client account

## The problem

The basemap comes from a personal Mapbox account. Both the style and
the access token belong to that account:

```
style: mapbox://styles/mpkhinda/cmqfdz5sa000c01s73elr0usm
token: pk.eyJ1IjoibXBraGluZGEi...
```

This was the right choice for building the prototype. It is not safe
for production:

- If that account is closed, or its free tile allowance runs out, the
  dashboard loses its basemap.
- Tile requests are billed to a person, not to the project.
- Nobody at Ferguson Lynch or the Landscape Partnership can edit the
  style.

## What is already done

Branch `feature/runtime-config` moved both values into `js/config.js`.
Nothing else in the code holds either one. The swap is an edit to one
file.

```js
// js/config.js
mapbox: {
    accessToken: "pk....",
    style: "mapbox://styles/<account>/<style-id>",
},
```

## Steps

### 1. Decide who owns the account

Ferguson Lynch or the Landscape Partnership. It should be whoever will
still be here in five years and will pay the bill. The Landscape
Partnership is the likelier answer, because the dashboard is theirs.

### 2. Create the account

A free Mapbox account covers 50,000 map loads a month, which is well
above what this dashboard is likely to need. Confirm the number
against the client's own estimate before promising it.

### 3. Move the style

The style's author has offered to package it up. In Mapbox Studio:

1. In the personal account, open the style and choose to share it.
2. In the new account, use "New style" and then the option to start
   from a URL, with the shared style's URL.
3. Compare the two side by side. Check the colours, the labels, and
   the zoom levels the dashboard uses (3 to 14).
4. Publish the style in the new account.
5. Copy its style URL into `js/config.js`.

If the style uses any custom data the personal account holds, that
data has to move as well. Check for a tileset that is not a Mapbox
standard one.

### 4. Create a token, and restrict it

Create a public token (`pk.`) in the new account. A public token is
safe to put in browser code — every Mapbox site does — but only if it
is restricted.

Do both of these:

- **Set URL restrictions.** List only the domains the dashboard runs
  on. Include the staging domain. Without this, anybody can copy the
  token and spend the account's allowance.
- **Give it the smallest scope.** It needs to read styles and tiles.
  It does not need write access to anything.

Never put a secret token (`sk.`) in `js/config.js`. A secret token in
browser code lets anybody change the account.

### 5. Set an alert

Set a usage alert in the Mapbox account, at about 80 percent of the
free allowance. Without one, the first sign of trouble is a broken
map.

### 6. Test

1. Change both values in `js/config.js`.
2. Load the dashboard. The basemap must look the same.
3. Confirm the ANCHOR markers, the state outlines and the NLCD layer
   still draw correctly on it.
4. Open the browser console. There must be no 401 or 403 from
   `api.mapbox.com`.
5. Load the dashboard from a domain that is not in the token's
   restriction list. It must fail. If it works, the restriction is not
   applied.

## Open questions

1. Which organisation owns the account?
2. Who administers it, and who else needs access?
3. Which domains will the dashboard run on? The token restriction
   needs the full list, including staging.
4. Does the style use any custom tileset that also has to move?
5. What map load volume does the client expect? This decides whether
   the free tier is enough.
