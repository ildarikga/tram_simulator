# Kazan geographic dataset

`kazan-map.geojson` is a derived geographic database containing features decoded from vector tiles hosted by OpenFreeMap, using the OpenMapTiles schema and OpenStreetMap source data.

- Source: https://tiles.openfreemap.org/planet
- Download date: 2026-11-05 (exact timestamp in GeoJSON `downloaded`).
- Detailed central coverage: longitude 49.075–49.155, latitude 55.765–55.815, plus vector tile buffers.
- City transport coverage: longitude 48.95–49.31, latitude 55.69–55.92, plus vector tile buffers.
- Projection in source: WGS84 longitude, latitude. The viewer uses a local flat metric approximation centred at 49.12 E, 55.79 N. No elevation model.
- Conversion: selected vector layers decoded to GeoJSON; properties retained with added `layer`; duplicated buffered geometry can remain at tile edges.

© OpenStreetMap contributors. The geographic database and this derived database are made available under the Open Database License (ODbL) 1.0: https://opendatacommons.org/licenses/odbl/1-0/ . See https://www.openstreetmap.org/copyright . Individual database contents are available under the Database Contents License: https://opendatacommons.org/licenses/dbcl/1-0/ .

Tile hosting: https://openfreemap.org/ . Vector schema: © OpenMapTiles, https://openmaptiles.org/ ; schema/cartographic attribution information: https://openmaptiles.org/docs/terminology/attribution/ .

Redistribution of this dataset must retain attribution and satisfy the ODbL requirements. This data notice does not apply to independently authored application source code or procedural tram models.
