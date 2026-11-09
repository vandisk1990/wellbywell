// Shared helpers for the Volve well review pages.

const SM3_TO_BBL = 6.2898;
const SM3_TO_SCF = 35.3147;

// The CSV writes volumes with thousands separators ("1,166"). Number("1,166") is NaN,
// so strip the commas first. Blank cells become null so callers can tell "no data" from 0.
function num(v) {
    if (v === undefined || v === null) return null;
    const s = String(v).replace(/,/g, "").trim();
    if (s === "") return null;
    const n = Number(s);
    return isNaN(n) ? null : n;
}

// DATEPRD is "07-Apr-14". new Date() does not parse that format reliably (Safari returns
// Invalid Date), so parse it by hand. Returns a UTC timestamp, or 0 if unparseable.
const MONTHS = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
function toTime(d) {
    if (!d) return 0;
    const s = String(d).trim();
    const m = s.match(/^(\d{1,2})[-\/ ]([A-Za-z]{3})[A-Za-z]*[-\/ ](\d{2,4})/);
    if (m && MONTHS[m[2].toLowerCase()] !== undefined) {
        let y = Number(m[3]);
        if (y < 100) y += (y > 50 ? 1900 : 2000);
        return Date.UTC(y, MONTHS[m[2].toLowerCase()], Number(m[1]));
    }
    const t = new Date(s).getTime();
    return isNaN(t) ? 0 : t;
}

function isoDate(t) {
    return new Date(t).toISOString().slice(0, 10);
}

function fmt(v, digits) {
    return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function asOf(t) {
    return "<br><small>on " + isoDate(t) + "</small>";
}

function showError(msg) {
    const box = document.getElementById("errorBox");
    if (box) {
        box.style.display = "block";
        box.innerText = msg;
    }
    const name = document.getElementById("wellName");
    if (name) name.innerText = "Error";
}

// A day counts as producing when the well reported any oil or water.
function isProducing(r) {
    return r.oil + r.water > 0;
}

// Loads the CSV and calls onReady(rows) with producer rows only (injector rows carry no
// production), parsed to numbers and sorted by well then date.
function loadProduction(onReady) {
    if (typeof Papa === "undefined" || typeof Plotly === "undefined") {
        showError("Libraries failed to load (Papa: " + (typeof Papa) + ", Plotly: " + (typeof Plotly) + ").");
        return;
    }
    Papa.parse("volvedatacsv.csv", {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            const rows = results.data
                .filter(r => r.NPD_WELL_BORE_NAME && String(r.FLOW_KIND).trim().toLowerCase() === "production")
                .map(r => ({
                    well: r.NPD_WELL_BORE_NAME.trim(),
                    t: toTime(r.DATEPRD),
                    oil: num(r.BORE_OIL_VOL) || 0,
                    water: num(r.BORE_WAT_VOL) || 0,
                    gas: num(r.BORE_GAS_VOL) || 0,
                    // A reading of 0 bar means the gauge was not reporting, not zero pressure
                    bhp: num(r.AVG_DOWNHOLE_PRESSURE) > 0 ? num(r.AVG_DOWNHOLE_PRESSURE) : null
                }))
                .filter(r => r.t > 0)
                .sort((a, b) => a.well < b.well ? -1 : a.well > b.well ? 1 : a.t - b.t);

            if (rows.length === 0) {
                const cols = results.meta && results.meta.fields ? results.meta.fields.join(", ") : "none";
                showError("No producer rows found in volvedatacsv.csv. Columns found: " + cols);
                return;
            }
            onReady(rows);
        },
        error: function(err) {
            showError("Could not load volvedatacsv.csv: " + err);
        }
    });
}

// Fills the well dropdown and calls onChange(well) now and whenever the selection changes.
function setupWellSelector(rows, onChange) {
    const wells = [...new Set(rows.map(r => r.well))].sort();
    const selector = document.getElementById("wellSelector");
    selector.innerHTML = "";
    wells.forEach(well => {
        const option = document.createElement("option");
        option.value = well;
        option.text = well;
        selector.appendChild(option);
    });
    selector.addEventListener("change", function() { onChange(this.value); });
    onChange(wells[0]);
}

// Last calendar day on which any producer flowed. The file's final dates are shut-in rows.
function latestProducingTime(rows) {
    let latest = 0;
    rows.forEach(r => { if (isProducing(r) && r.t > latest) latest = r.t; });
    return latest;
}
