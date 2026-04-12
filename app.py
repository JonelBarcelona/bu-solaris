import os
import time
import math
import requests
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
CO2_FACTOR = 0.7

irradiance_cache = {}
CACHE_TTL = 3600


def cache_key(lat, lon):
    return f"{round(lat, 1)},{round(lon, 1)}"


def classify_payback(years):
    if years <= 5:
        return "Excellent"
    if years <= 10:
        return "Good"
    if years <= 15:
        return "Moderate"
    return "Poor"


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/irradiance")
def irradiance():
    try:
        lat = float(request.args.get("lat", ""))
        lon = float(request.args.get("lon", ""))
    except (TypeError, ValueError):
        return jsonify({"error": "lat and lon must be valid numbers."}), 400

    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return jsonify({"error": "Coordinates out of range."}), 400

    key = cache_key(lat, lon)
    cached = irradiance_cache.get(key)
    if cached and cached["expires"] > time.time():
        return jsonify({"lat": lat, "lon": lon, "monthly_ghi": cached["data"]})

    try:
        url = "https://power.larc.nasa.gov/api/temporal/climatology/point"
        params = {
            "parameters": "ALLSKY_SFC_SW_DWN",
            "community": "RE",
            "longitude": lon,
            "latitude": lat,
            "format": "JSON",
        }
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        nasa = resp.json()
    except Exception as e:
        return jsonify({"error": f"Failed to fetch NASA POWER data: {e}"}), 502

    ghi_raw = (nasa.get("properties", {})
               .get("parameter", {})
               .get("ALLSKY_SFC_SW_DWN", {}))
    if not ghi_raw:
        return jsonify({"error": "Unexpected NASA POWER response structure."}), 502

    keys = [
        ("JAN", "1"), ("FEB", "2"), ("MAR", "3"), ("APR", "4"),
        ("MAY", "5"), ("JUN", "6"), ("JUL", "7"), ("AUG", "8"),
        ("SEP", "9"), ("OCT", "10"), ("NOV", "11"), ("DEC", "12"),
    ]
    monthly_ghi = [ghi_raw.get(k1, ghi_raw.get(k2, 0)) for k1, k2 in keys]

    irradiance_cache[key] = {"data": monthly_ghi, "expires": time.time() + CACHE_TTL}
    return jsonify({"lat": lat, "lon": lon, "monthly_ghi": monthly_ghi})


@app.route("/api/calculate", methods=["POST"])
def calculate():
    body = request.get_json(silent=True) or {}

    try:
        lat = float(body["lat"])
        lon = float(body["lon"])
        monthly_ghi = [float(v) for v in body["monthly_ghi"]]
        n_panels = int(body["n_panels"])
        panel_wattage = float(body["panel_wattage"])
        panel_efficiency = float(body["panel_efficiency"])
        inverter_efficiency = float(body["inverter_efficiency"])
        system_losses = float(body["system_losses"])
        tariff = float(body["tariff"])
        installation_cost = float(body["installation_cost"])
    except (KeyError, TypeError, ValueError) as e:
        return jsonify({"error": f"Invalid request body: {e}"}), 400

    system_capacity_kwp = (n_panels * panel_wattage) / 1000
    panel_area = (n_panels * panel_wattage) / (1000 * panel_efficiency)
    inverter_capacity_kva = (n_panels * panel_wattage * 1.10) / 1000

    monthly_results = []
    for i, month in enumerate(MONTHS):
        ghi = monthly_ghi[i] if i < len(monthly_ghi) else 0
        days = DAYS_IN_MONTH[i]
        dc_kwh = ghi * panel_area * panel_efficiency * days
        ac_kwh = dc_kwh * inverter_efficiency * (1 - system_losses)
        monthly_results.append({
            "month": month,
            "days": days,
            "ghi": round(ghi, 4),
            "dc_kwh": round(dc_kwh, 4),
            "ac_kwh": round(ac_kwh, 4),
        })

    annual_ac_kwh = sum(m["ac_kwh"] for m in monthly_results)
    annual_dc_kwh = sum(m["dc_kwh"] for m in monthly_results)
    annual_savings = annual_ac_kwh * tariff
    payback_years = (installation_cost / annual_savings
                     if installation_cost > 0 and annual_savings > 0 else 0)
    payback_classification = classify_payback(payback_years)
    co2_offset_kg = annual_ac_kwh * CO2_FACTOR

    return jsonify({
        "panel_area": round(panel_area, 4),
        "system_capacity_kwp": round(system_capacity_kwp, 4),
        "inverter_capacity_kva": round(inverter_capacity_kva, 4),
        "monthly_results": monthly_results,
        "annual_ac_kwh": round(annual_ac_kwh, 2),
        "annual_dc_kwh": round(annual_dc_kwh, 2),
        "annual_savings": round(annual_savings, 2),
        "payback_years": round(payback_years, 4),
        "payback_classification": payback_classification,
        "co2_offset_kg": round(co2_offset_kg, 2),
        "installation_cost": installation_cost,
        "lat": lat,
        "lon": lon,
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 18747))
    app.run(host="0.0.0.0", port=port, debug=False)
