# A&E audit: which hospitals BlueRoute treats as A&E

BlueRoute's "Nearest A&E" and the map's A&E badges come from OpenStreetMap: a
hospital tagged `emergency=yes` (and not a mental health unit, hospice,
rehabilitation or maternity unit) counts as A&E, and so does one with a mapped
A&E entrance within 400 m. When OpenStreetMap is wrong, so is BlueRoute, until
the next weekly data build after it's corrected.

Audit of the 17 November 2026 data (data-20261117-1417), run with the **Map
check** workflow (Actions tab, Run workflow; the `types` box lists every place
of a kind). 41 hospitals were marked A&E.

## Missing: real emergency departments not marked as A&E

Fix in OpenStreetMap: select the hospital's grounds (the outline, not one
building), add the tag `emergency` = `yes`, save with a note such as "24/7
Emergency Department".

| Hospital | Area | Notes |
|---|---|---|
| The Whittington Hospital, Magdala Avenue N19 5NF | Islington | Found 17 Nov from the map. |
| West Middlesex University Hospital, Twickenham Road, Isleworth | Hounslow | |
| Newham University Hospital, Glen Road E13 | Newham | An "A&E Department" point is mapped there, so Nearest A&E finds that, but the hospital itself isn't marked. |
| Queen Elizabeth The Queen Mother Hospital, Margate | Thanet | East Kent's emergency department for Thanet. |

## Wrongly marked as A&E

Fix in OpenStreetMap: on the item, delete the `emergency=yes` tag (or, for a
specialist department, keep it and add `healthcare:speciality`, see below).

| Place | Area | Why it's wrong |
|---|---|---|
| Tunbridge Wells Nuffield Hospital | Tunbridge Wells | Private hospital, no emergency department. |
| Estuary View Medical Centre, Whitstable | Canterbury | A medical centre with a minor injuries unit, not an A&E. |
| Central Middlesex Hospital, Park Royal | Brent | Its A&E closed in 2014; it has an urgent treatment centre. |

## Specialist emergency departments

Real, but not where to take most casualties. BlueRoute shows them as A&E.

| Place | Area | What it is |
|---|---|---|
| Moorfields Eye Hospital (City Road) | Islington | Eye A&E only. Tagging `healthcare:speciality=ophthalmology` on it would let BlueRoute tell it apart. |
| Evelina London Children's Hospital | Lambeth | Children's A&E, beside St Thomas' (which has the adult A&E). |

## Checked and right

Barnet, Northwick Park, Princess Royal University (Farnborough), Royal Free,
University College, Croydon University, Ealing, North Middlesex, Queen
Elizabeth (Woolwich), Homerton, Charing Cross, Queen's (Romford), Hillingdon,
Chelsea and Westminster, Kingston, King's College, St Thomas', University
Hospital Lewisham, King George (Ilford), St Helier, Royal London, Whipps Cross,
St George's, St Mary's; William Harvey (Ashford), Darent Valley, Maidstone,
Tunbridge Wells (Pembury), Medway Maritime; Basildon, Broomfield, Colchester,
Princess Alexandra (Harlow), Southend.

Kent and Canterbury Hospital is not marked A&E, which is right: it has an
urgent treatment centre, and Canterbury's emergency patients go to the William
Harvey or the QEQM.

## Checking again

Run **Map check** after the next Sunday build: the `Hospital with A&E` list in
its log should then include the four above and not the three wrongly marked.
This list is from public knowledge of London's and the south-east's emergency
departments, not an NHS feed: an officer or paramedic who knows the area should
look over it.
