"""Which OpenStreetMap features count as places, and what to call them.

Each rule maps an OSM tag (key, value) to a type label the officer sees
("Coffee shop") and a group for browsing ("food"). Values not listed here
under amenity/shop/office/craft/healthcare are still included, named from
the tag value ("shop=bookmaker" -> "Bookmaker"); IGNORE lists the ones that
are clutter rather than places.
"""

# Groups the app can browse by. Keep in step with app/src/search/places.ts.
GROUPS = {
    "food": "Food and drink",
    "shop": "Shops",
    "education": "Schools and education",
    "health": "Health",
    "emergency": "Emergency services",
    "transport": "Transport",
    "leisure": "Parks and leisure",
    "worship": "Places of worship",
    "stay": "Hotels",
    "culture": "Culture and attractions",
    "services": "Services and offices",
    "housing": "Blocks and estates",
    "area": "Areas and neighbourhoods",
    "other": "Other",
}

# (key, value) -> (type label, group). Checked in this order of keys.
TYPES = {
    # Food and drink
    ("amenity", "cafe"): ("Coffee shop", "food"),
    ("amenity", "restaurant"): ("Restaurant", "food"),
    ("amenity", "fast_food"): ("Takeaway", "food"),
    ("amenity", "pub"): ("Pub", "food"),
    ("amenity", "bar"): ("Bar", "food"),
    ("amenity", "nightclub"): ("Nightclub", "food"),
    ("amenity", "food_court"): ("Food court", "food"),
    ("amenity", "ice_cream"): ("Ice cream", "food"),
    ("amenity", "biergarten"): ("Beer garden", "food"),
    # Shops
    ("shop", "convenience"): ("Corner shop", "shop"),
    ("shop", "supermarket"): ("Supermarket", "shop"),
    ("shop", "alcohol"): ("Off-licence", "shop"),
    ("shop", "newsagent"): ("Newsagent", "shop"),
    ("shop", "bakery"): ("Bakery", "shop"),
    ("shop", "butcher"): ("Butcher", "shop"),
    ("shop", "greengrocer"): ("Greengrocer", "shop"),
    ("shop", "chemist"): ("Chemist", "shop"),
    ("shop", "hairdresser"): ("Hairdresser", "shop"),
    ("shop", "beauty"): ("Beauty salon", "shop"),
    ("shop", "clothes"): ("Clothes shop", "shop"),
    ("shop", "shoes"): ("Shoe shop", "shop"),
    ("shop", "mobile_phone"): ("Phone shop", "shop"),
    ("shop", "electronics"): ("Electronics shop", "shop"),
    ("shop", "betting"): ("Bookmaker", "shop"),
    ("shop", "bookmaker"): ("Bookmaker", "shop"),
    ("shop", "pawnbroker"): ("Pawnbroker", "shop"),
    ("shop", "money_lender"): ("Money lender", "shop"),
    ("shop", "laundry"): ("Launderette", "shop"),
    ("shop", "dry_cleaning"): ("Dry cleaner", "shop"),
    ("shop", "car_repair"): ("Garage", "shop"),
    ("shop", "car"): ("Car dealer", "shop"),
    ("shop", "tobacco"): ("Tobacconist", "shop"),
    ("shop", "e-cigarette"): ("Vape shop", "shop"),
    ("shop", "department_store"): ("Department store", "shop"),
    ("shop", "mall"): ("Shopping centre", "shop"),
    ("shop", "charity"): ("Charity shop", "shop"),
    ("shop", "florist"): ("Florist", "shop"),
    ("shop", "jewelry"): ("Jeweller", "shop"),
    ("shop", "optician"): ("Optician", "shop"),
    ("shop", "hardware"): ("Hardware shop", "shop"),
    ("shop", "doityourself"): ("DIY shop", "shop"),
    ("shop", "kiosk"): ("Kiosk", "shop"),
    ("shop", "deli"): ("Deli", "shop"),
    ("amenity", "marketplace"): ("Market", "shop"),
    ("amenity", "fuel"): ("Petrol station", "shop"),
    # Education
    ("amenity", "school"): ("School", "education"),
    ("amenity", "college"): ("College", "education"),
    ("amenity", "university"): ("University", "education"),
    ("amenity", "kindergarten"): ("Nursery", "education"),
    ("amenity", "childcare"): ("Childcare", "education"),
    ("amenity", "library"): ("Library", "education"),
    ("amenity", "language_school"): ("Language school", "education"),
    ("amenity", "driving_school"): ("Driving school", "education"),
    # Health
    ("amenity", "hospital"): ("Hospital", "health"),
    ("amenity", "clinic"): ("Clinic", "health"),
    ("amenity", "doctors"): ("GP surgery", "health"),
    ("amenity", "dentist"): ("Dentist", "health"),
    ("amenity", "pharmacy"): ("Pharmacy", "health"),
    ("amenity", "nursing_home"): ("Care home", "health"),
    ("amenity", "veterinary"): ("Vet", "health"),
    ("healthcare", "hospital"): ("Hospital", "health"),
    ("healthcare", "clinic"): ("Clinic", "health"),
    ("healthcare", "doctor"): ("GP surgery", "health"),
    ("healthcare", "dentist"): ("Dentist", "health"),
    ("healthcare", "pharmacy"): ("Pharmacy", "health"),
    # Emergency services and public safety
    ("amenity", "police"): ("Police station", "emergency"),
    ("amenity", "fire_station"): ("Fire station", "emergency"),
    ("emergency", "ambulance_station"): ("Ambulance station", "emergency"),
    ("amenity", "courthouse"): ("Court", "emergency"),
    ("amenity", "prison"): ("Prison", "emergency"),
    # Transport
    ("railway", "station"): ("Station", "transport"),
    ("public_transport", "station"): ("Station", "transport"),
    ("amenity", "bus_station"): ("Bus station", "transport"),
    ("amenity", "parking"): ("Car park", "transport"),
    ("amenity", "ferry_terminal"): ("Pier", "transport"),
    ("aeroway", "aerodrome"): ("Airport", "transport"),
    # Parks and leisure
    ("leisure", "park"): ("Park", "leisure"),
    ("leisure", "garden"): ("Garden", "leisure"),
    ("leisure", "playground"): ("Playground", "leisure"),
    ("leisure", "nature_reserve"): ("Nature reserve", "leisure"),
    ("leisure", "common"): ("Common", "leisure"),
    ("leisure", "sports_centre"): ("Sports centre", "leisure"),
    ("leisure", "fitness_centre"): ("Gym", "leisure"),
    ("leisure", "swimming_pool"): ("Swimming pool", "leisure"),
    ("leisure", "stadium"): ("Stadium", "leisure"),
    ("leisure", "golf_course"): ("Golf course", "leisure"),
    ("leisure", "recreation_ground"): ("Recreation ground", "leisure"),
    ("leisure", "allotments"): ("Allotments", "leisure"),
    ("landuse", "allotments"): ("Allotments", "leisure"),
    ("landuse", "recreation_ground"): ("Recreation ground", "leisure"),
    ("landuse", "cemetery"): ("Cemetery", "leisure"),
    ("amenity", "grave_yard"): ("Churchyard", "leisure"),
    ("amenity", "community_centre"): ("Community centre", "leisure"),
    ("amenity", "social_facility"): ("Social facility", "leisure"),
    ("amenity", "youth_centre"): ("Youth centre", "leisure"),
    ("amenity", "cinema"): ("Cinema", "culture"),
    ("amenity", "theatre"): ("Theatre", "culture"),
    ("amenity", "arts_centre"): ("Arts centre", "culture"),
    ("amenity", "casino"): ("Casino", "culture"),
    ("leisure", "adult_gaming_centre"): ("Amusement arcade", "culture"),
    ("tourism", "museum"): ("Museum", "culture"),
    ("tourism", "gallery"): ("Gallery", "culture"),
    ("tourism", "attraction"): ("Attraction", "culture"),
    ("tourism", "zoo"): ("Zoo", "culture"),
    # Worship
    ("amenity", "place_of_worship"): ("Place of worship", "worship"),
    # Hotels
    ("tourism", "hotel"): ("Hotel", "stay"),
    ("tourism", "hostel"): ("Hostel", "stay"),
    ("tourism", "guest_house"): ("Guest house", "stay"),
    ("tourism", "apartment"): ("Holiday flats", "stay"),
    # Services and offices
    ("amenity", "bank"): ("Bank", "services"),
    ("amenity", "post_office"): ("Post office", "services"),
    ("amenity", "townhall"): ("Town hall", "services"),
    ("amenity", "car_wash"): ("Car wash", "services"),
    ("amenity", "money_transfer"): ("Money transfer", "services"),
    ("amenity", "bureau_de_change"): ("Bureau de change", "services"),
    ("office", "government"): ("Government office", "services"),
    ("office", "estate_agent"): ("Estate agent", "services"),
    ("office", "lawyer"): ("Solicitor", "services"),
    ("office", "company"): ("Office", "services"),
    # Blocks and estates
    ("landuse", "residential"): ("Housing estate", "housing"),
    ("building", "apartments"): ("Block of flats", "housing"),
    ("building", "residential"): ("Block of flats", "housing"),
    ("building", "flats"): ("Block of flats", "housing"),
    ("building", "dormitory"): ("Student halls", "housing"),
    # Areas
    ("place", "suburb"): ("Area", "area"),
    ("place", "neighbourhood"): ("Neighbourhood", "area"),
    ("place", "quarter"): ("Area", "area"),
    ("place", "locality"): ("Locality", "area"),
    ("place", "square"): ("Square", "area"),
}

# Keys whose unlisted values are still worth including, and their group.
OPEN_KEYS = {
    "amenity": "other",
    "shop": "shop",
    "office": "services",
    "craft": "services",
    "healthcare": "health",
    "club": "leisure",
}

# Named, but clutter rather than places someone gets sent to.
IGNORE = {
    ("amenity", v)
    for v in (
        "bench", "waste_basket", "bicycle_parking", "bicycle_rental", "parking_space",
        "parking_entrance", "vending_machine", "telephone", "atm", "post_box",
        "recycling", "drinking_water", "charging_station", "shelter", "clock",
        "grit_bin", "waste_disposal", "motorcycle_parking", "taxi", "toilets",
        "bbq", "loading_dock", "hunting_stand", "letter_box", "fountain",
        "public_bookcase", "bicycle_repair_station", "compressed_air", "water_point",
        "give_box", "photo_booth", "ticket_validator", "smoking_area", "dog_toilet",
    )
} | {("shop", "vacant"), ("office", "vacant"), ("building", "yes")}

# Order in which keys decide a feature's type (amenity=cafe beats building=yes).
KEY_ORDER = [
    "amenity", "shop", "healthcare", "emergency", "railway", "public_transport", "aeroway",
    "leisure", "tourism", "office", "craft", "club", "landuse", "place", "building",
]


def classify(tags) -> tuple[str, str] | None:
    """(type label, group) for a feature's tags, or None to leave it out."""
    for key in KEY_ORDER:
        value = tags.get(key)
        if not value:
            continue
        if (key, value) in IGNORE:
            continue
        if (key, value) in TYPES:
            return TYPES[(key, value)]
        if key in OPEN_KEYS:
            return value.replace("_", " ").replace(";", ", ").capitalize(), OPEN_KEYS[key]
    return None
