# Bundled search data

Used for offline search, so road-level search works with no signal.

- `roads.dat`: one line per named road per borough: `name|borough|outcodes|lat×1e5|lng×1e5`.
  From OS Open Names. Each road is placed in a borough by point-in-polygon against
  London borough boundaries.
- `postcodes.dat`: one line per London postcode: `postcode|borough|lat×1e5|lng×1e5`.
  From the ONS Postcode Directory.

`borough` is an index into `BOROUGHS` in `src/search/boroughs.ts`.

Both files were carried over from the clickable prototype. Rebuild them from the
current releases before v1 ships, and refresh at least yearly.

Contains OS data © Crown copyright and database right. Contains Royal Mail data
© Royal Mail copyright and database right. Contains National Statistics data
© Crown copyright and database right. Open Government Licence v3.0.
