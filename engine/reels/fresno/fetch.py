#!/usr/bin/env python3
"""Fetches and cleans the map layers for the fresno reel into assets/ (run from engine/: python3 reels/fresno/fetch.py).

Sources, the same as COF-RyLopez/ng911-pipeline: County of Fresno ArcGIS (address points, City_County_CAD areas)
and OpenAddresses' processed Fresno centerlines. CAD polygons arrive as invalid geometry from the GeoJSON export;
shapely.make_valid keeps the county islands as holes (buffer(0) would fill them in). Needs shapely.
"""
import gzip, json, math, urllib.parse, urllib.request
from pathlib import Path
import shapely
from shapely.geometry import box, mapping, shape

CENTER = (-119.7316, 36.8452)                 # between 7503/7465 N Paula Ave and 7518 N Willow Ave
BOX = (CENTER[0] - 0.0095, CENTER[1] - 0.0115, CENTER[0] + 0.0095, CENTER[1] + 0.0115)   # about 1.7 x 2.6 km
AGS = "https://services3.arcgis.com/ibgDyuD2DLBge82s/arcgis/rest/services"
OUT = Path(__file__).resolve().parent / "assets"
KX, KY = 111320 * math.cos(math.radians(CENTER[1])), 111320


def get(url, params=None):
    url += "?" + urllib.parse.urlencode(params) if params else ""
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Fresno-NG911/1.0"}), timeout=180)


def arcgis(layer, fields, where="1=1"):
    feats, off = [], 0
    while True:
        with get(f"{AGS}/{layer}/query", {"where": where, "outFields": fields, "outSR": 4326, "f": "geojson", "inSR": 4326,
                                          "geometry": ",".join(map(str, BOX)), "geometryType": "esriGeometryEnvelope",
                                          "spatialRel": "esriSpatialRelIntersects", "resultOffset": off, "resultRecordCount": 2000}) as r:
            d = json.load(r)
        feats += d["features"]
        if not (d.get("exceededTransferLimit") or d.get("properties", {}).get("exceededTransferLimit")):
            return feats
        off += len(d["features"])


def dist_m(x, y):   # metres from the centre, for the ripple order
    return math.hypot((x - CENTER[0]) * KX, (y - CENTER[1]) * KY)


def save(name, feats):
    (OUT / f"{name}.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")))
    print(f"{name}: {len(feats)}")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    clip = box(*BOX).buffer(0.01)
    cad = []
    for f in arcgis("City_County_CAD/FeatureServer/78", "NAME,AGENCY,LE_NGUID"):
        g = shapely.make_valid(shape(f["geometry"])).intersection(clip)
        if not g.is_empty:
            cad.append({"type": "Feature", "properties": {k: f["properties"][k] for k in ("NAME", "AGENCY", "LE_NGUID")}, "geometry": mapping(g)})
    save("cad", cad)
    pts = []
    for f in arcgis("REGIONAL_ADDRESS_VW/FeatureServer/1", "ADDRESS_NUMBER,STREET_DIRECTION,STREET_NAME,STREET_TYPE"):
        x, y = f["geometry"]["coordinates"]
        pts.append({"type": "Feature", "properties": {"d": round(dist_m(x, y))}, "geometry": {"type": "Point", "coordinates": [round(x, 6), round(y, 6)]}})
    save("addresses", pts)
    with get("https://batch.openaddresses.io/api/data", {"source": "us/ca/fresno"}) as r:
        job = next(d for d in json.load(r) if d["layer"] == "centerlines")
    cl = []
    with get(f"https://v2.openaddresses.io/batch-prod/job/{job['job']}/source.geojson.gz") as r, gzip.open(r, "rt") as lines:
        for line in lines:
            if line.strip():
                f = json.loads(line)
                g = shape(f["geometry"]) if f.get("geometry") else None
                if g is not None and g.intersects(box(*BOX)):
                    c = g.centroid
                    cl.append({"type": "Feature", "properties": {"name": f["properties"].get("name"), "d": round(dist_m(c.x, c.y))}, "geometry": mapping(g)})
    save("centerlines", cl)
    (OUT / "sources.json").write_text(json.dumps({"center": CENTER, "box": BOX, "openaddresses_job": job["job"], "openaddresses_updated": job["updated"]}, indent=1))
