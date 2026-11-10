# design/

Source material, not shipped. GitHub Pages serves the repository root, so
anything in `assets/` goes out to every visitor whether a page references it
or not — this folder is where art lives until something actually links to it.

## social-icons.svg

A sheet of ~40 social marks at 24×24 on a 48px pitch, exported from Figma
(the dashed purple rect is the frame border, not part of the art). All on
`fill-opacity: 0.85098`, matching the menu icons in `assets/icons/`.

The page links exactly one social account today — LinkedIn, whose mark is
already extracted as `assets/icons/linkedin.svg`. The rest stay here until
there is a link to hang them on: naming a brand mark wrongly is worse than
not naming it, and extracting all forty would add weight to every page load
for icons nothing points at.

To use one: find it by its x-offset in the sheet (24, 72, 120, … on a 48px
pitch), lift the `<path>` into a 24×24 viewBox of its own, and save it as
`assets/icons/<name>.svg`.

## ui-icons.svg

The interface set — carets, arrows, search, share, trash, calendar, lock,
image, grid, bell and so on — laid out on a 72px grid, most of them in a pair:
a 1.5px outline and a filled or 3px-stroke sibling next to it. Same
`fill-opacity: 0.85098` as everything else here.

Four are already lifted into `assets/icons/`: `linkedin`, `share`, `call`,
`download`, plus `chat` and `email`. The rest stay here for the same reason as
the social marks — GitHub Pages serves the repository root, so anything in
`assets/` ships to every visitor whether a page references it or not.
