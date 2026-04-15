import os
import time
import json
import sqlite3
import csv
import io
import threading
import datetime
import functools
import secrets

import bcrypt
import requests
from flask import (
    Flask, render_template, request, jsonify,
    session, redirect, url_for, Response
)

# ── Paths ──────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, 'config.json')
DB_PATH = os.path.join(BASE_DIR, 'logs.db')

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

DEFAULT_CONFIG = {
    "co2_factor": 0.7,
    "default_n_panels": 20,
    "default_panel_wattage": 400,
    "default_tariff": 9.50,
    "payback_excellent_max": 5,
    "payback_good_max": 10,
    "payback_moderate_max": 15,
    "admin_password_hash": None,
}

SECRET_KEY_FILE = os.path.join(BASE_DIR, '.secret_key')


def get_secret_key():
    """Return Flask secret key: env var > persistent .secret_key file."""
    env_key = os.environ.get('FLASK_SECRET_KEY') or os.environ.get('SECRET_KEY')
    if env_key:
        return env_key
    if os.path.exists(SECRET_KEY_FILE):
        try:
            with open(SECRET_KEY_FILE) as f:
                key = f.read().strip()
            if key:
                return key
        except Exception:
            pass
    key = secrets.token_hex(32)
    try:
        with open(SECRET_KEY_FILE, 'w') as f:
            f.write(key)
    except Exception:
        pass
    return key

# ── Config helpers ─────────────────────────────────────────
def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r') as f:
                cfg = json.load(f)
            for k, v in DEFAULT_CONFIG.items():
                if k not in cfg:
                    cfg[k] = v
            return cfg
        except Exception:
            pass
    return dict(DEFAULT_CONFIG)


def save_config(cfg):
    tmp = CONFIG_PATH + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(cfg, f, indent=2)
    os.replace(tmp, CONFIG_PATH)


# Bootstrap: ensure admin password hash exists in config
_cfg = load_config()
if not _cfg.get('admin_password_hash'):
    _cfg['admin_password_hash'] = bcrypt.hashpw(
        b'busolaris2025', bcrypt.gensalt()
    ).decode()
    save_config(_cfg)

app = Flask(__name__)
app.secret_key = get_secret_key()

# ── SQLite ─────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS calculations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            lat REAL,
            lon REAL,
            n_panels INTEGER,
            panel_wattage REAL,
            system_capacity_kwp REAL,
            annual_ac_kwh REAL,
            payback_years REAL,
            payback_classification TEXT,
            tariff REAL,
            installation_cost REAL
        )
    """)
    conn.commit()
    conn.close()


init_db()


def log_calculation(row):
    """Write a log row non-blocking so it can never break a calculation."""
    def _write():
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.execute(
                "INSERT INTO calculations "
                "(timestamp, lat, lon, n_panels, panel_wattage, "
                "system_capacity_kwp, annual_ac_kwh, payback_years, "
                "payback_classification, tariff, installation_cost) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                row
            )
            conn.commit()
            conn.close()
        except Exception:
            pass
    threading.Thread(target=_write, daemon=True).start()


# ── Irradiance cache ───────────────────────────────────────
irradiance_cache = {}
CACHE_TTL = 3600


def cache_key(lat, lon):
    return f"{round(lat, 1)},{round(lon, 1)}"


# ── Payback classification (reads config) ──────────────────
def classify_payback(years):
    cfg = load_config()
    if years <= cfg.get('payback_excellent_max', 5):
        return "Excellent"
    if years <= cfg.get('payback_good_max', 10):
        return "Good"
    if years <= cfg.get('payback_moderate_max', 15):
        return "Moderate"
    return "Poor"


# ── Admin auth decorator ───────────────────────────────────
def require_admin(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('admin'):
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated


# ════════════════════════════════════════════════════════════
# Public Routes
# ════════════════════════════════════════════════════════════

@app.route("/")
def index():
    cfg = load_config()
    return render_template("index.html", cfg=cfg)


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

    cfg = load_config()
    co2_factor = cfg.get("co2_factor", 0.7)

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
    co2_offset_kg = annual_ac_kwh * co2_factor

    # Non-blocking log write
    log_calculation((
        datetime.datetime.utcnow().isoformat(),
        lat, lon, n_panels, panel_wattage,
        round(system_capacity_kwp, 4),
        round(annual_ac_kwh, 2),
        round(payback_years, 4),
        payback_classification,
        tariff, installation_cost,
    ))

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


# ════════════════════════════════════════════════════════════
# Admin Routes
# ════════════════════════════════════════════════════════════

@app.route("/admin")
@app.route("/admin/")
def admin_index():
    if session.get('admin'):
        return redirect(url_for('admin_dashboard'))
    return redirect(url_for('admin_login'))


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    error = None
    if request.method == "POST":
        password = request.form.get("password", "")
        cfg = load_config()
        stored = cfg.get("admin_password_hash", "")
        try:
            match = stored and bcrypt.checkpw(password.encode(), stored.encode())
        except Exception:
            match = False
        if match:
            session['admin'] = True
            session.permanent = True
            return redirect(url_for('admin_dashboard'))
        error = "Incorrect password. Please try again."
    return render_template("admin_login.html", error=error)


@app.route("/admin/logout")
def admin_logout():
    session.pop('admin', None)
    return redirect(url_for('admin_login'))


@app.route("/admin/dashboard")
@require_admin
def admin_dashboard():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    total = conn.execute("SELECT COUNT(*) AS c FROM calculations").fetchone()["c"]
    unique_locs = conn.execute(
        "SELECT COUNT(DISTINCT ROUND(lat,1)||','||ROUND(lon,1)) AS c FROM calculations"
    ).fetchone()["c"]
    latest = conn.execute(
        "SELECT timestamp FROM calculations ORDER BY id DESC LIMIT 1"
    ).fetchone()
    latest_ts = latest["timestamp"] if latest else "—"
    recent = conn.execute(
        "SELECT * FROM calculations ORDER BY id DESC LIMIT 20"
    ).fetchall()
    conn.close()
    return render_template("admin.html",
                           total=total, unique_locs=unique_locs,
                           latest_ts=latest_ts, recent=recent)


@app.route("/admin/config", methods=["GET", "POST"])
@require_admin
def admin_config():
    cfg = load_config()
    success = False
    errors = []
    if request.method == "POST":
        try:
            co2 = float(request.form["co2_factor"])
            n_panels = int(request.form["default_n_panels"])
            wattage = float(request.form["default_panel_wattage"])
            tariff = float(request.form["default_tariff"])
            exc_max = float(request.form["payback_excellent_max"])
            good_max = float(request.form["payback_good_max"])
            mod_max = float(request.form["payback_moderate_max"])

            # Semantic validation
            if co2 < 0:
                errors.append("CO₂ factor must be non-negative.")
            if n_panels < 1:
                errors.append("Default panels must be at least 1.")
            if wattage <= 0:
                errors.append("Panel wattage must be positive.")
            if tariff < 0:
                errors.append("Tariff must be non-negative.")
            if not (0 < exc_max < good_max < mod_max):
                errors.append(
                    "Threshold ordering must be: Excellent < Good < Moderate (all positive)."
                )

            if not errors:
                cfg["co2_factor"] = co2
                cfg["default_n_panels"] = n_panels
                cfg["default_panel_wattage"] = wattage
                cfg["default_tariff"] = tariff
                cfg["payback_excellent_max"] = exc_max
                cfg["payback_good_max"] = good_max
                cfg["payback_moderate_max"] = mod_max
                save_config(cfg)
                success = True
        except (KeyError, ValueError) as e:
            errors.append(f"Invalid input: {e}")
    return render_template("admin_config.html", cfg=cfg, success=success, errors=errors)


@app.route("/admin/export.csv")
@require_admin
def admin_export():
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("SELECT * FROM calculations ORDER BY id DESC").fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Timestamp (UTC)", "Latitude", "Longitude",
        "N Panels", "Panel Wattage (Wp)",
        "System Capacity (kWp)", "Annual AC Yield (kWh)",
        "Payback (years)", "Payback Classification",
        "Tariff (PHP/kWh)", "Installation Cost (PHP)"
    ])
    writer.writerows(rows)

    date_str = datetime.date.today().isoformat()
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=busolaris-log-{date_str}.csv"
        }
    )


@app.route("/admin/password", methods=["GET", "POST"])
@require_admin
def admin_password():
    error = None
    success = False
    if request.method == "POST":
        current = request.form.get("current_password", "")
        new_pw = request.form.get("new_password", "")
        confirm = request.form.get("confirm_password", "")
        cfg = load_config()
        stored = cfg.get("admin_password_hash", "")
        try:
            current_ok = stored and bcrypt.checkpw(current.encode(), stored.encode())
        except Exception:
            current_ok = False

        if not current_ok:
            error = "Incorrect current password."
        elif len(new_pw) < 8:
            error = "New password must be at least 8 characters."
        elif new_pw != confirm:
            error = "New passwords do not match."
        else:
            cfg["admin_password_hash"] = bcrypt.hashpw(
                new_pw.encode(), bcrypt.gensalt()
            ).decode()
            save_config(cfg)
            success = True

    return render_template("admin_password.html", error=error, success=success)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 18747))
    app.run(host="0.0.0.0", port=port, debug=False)
