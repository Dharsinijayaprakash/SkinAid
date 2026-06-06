import os
import uuid
import random
import base64
import hashlib
from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.utils import secure_filename
from PIL import Image
import io

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max
app.config['SECRET_KEY'] = 'skinaid-patient-portal-2026'

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'dcm'}

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Shared case database for Clinical Decision Support
PATIENT_CASES = [
    {
        "case_id": "CASE-9021",
        "date": "2026-06-01",
        "patient_id": "PAT-3849",
        "patient_name": "Jane Miller",
        "patient_age": 42,
        "patient_gender": "Female",
        "wound_type": "Burn Wound",
        "severity": "Severe",
        "confidence_pct": "89.4%",
        "infection_risk": "Moderate (45%)",
        "healing_prediction": "Expected recovery in 28-35 days.",
        "review_status": "Pending Review",
        "healing_percentage": 40,
        "history": [
            {"day": "Day 1", "percentage": 10, "status": "Initial injury, deep partial thickness burn, significant redness", "image_placeholder": "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150"},
            {"day": "Day 5", "percentage": 20, "status": "Early re-epithelialization at margins, dressing active", "image_placeholder": "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=150"},
            {"day": "Day 10", "percentage": 30, "status": "Granulation tissue forming, exudate decreased", "image_placeholder": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=150"},
            {"day": "Day 15", "percentage": 40, "status": "Progressive contraction, wound bed healthy", "image_placeholder": "https://images.unsplash.com/photo-1579684389782-64d84b5e901f?w=150"}
        ],
        "notes": "",
        "follow_up_date": "",
        "follow_up_reminders": "",
        "monitoring_schedule": "",
        "image_url": "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400"
    },
    {
        "case_id": "CASE-4091",
        "date": "2026-06-02",
        "patient_id": "PAT-8812",
        "patient_name": "Robert Taylor",
        "patient_age": 68,
        "patient_gender": "Male",
        "wound_type": "Ulcer",
        "severity": "Critical",
        "confidence_pct": "94.2%",
        "infection_risk": "High (80%)",
        "healing_prediction": "Expected recovery in 60-90 days, clinical compression therapy required.",
        "review_status": "Pending Review",
        "healing_percentage": 15,
        "history": [
            {"day": "Day 1", "percentage": 5, "status": "Deep venous ulceration, extensive slough", "image_placeholder": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=150"},
            {"day": "Day 5", "percentage": 8, "status": "Slough debridement initiated, exudate high", "image_placeholder": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=150"},
            {"day": "Day 10", "percentage": 12, "status": "Border stabilization, inflammation present", "image_placeholder": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=150"},
            {"day": "Day 15", "percentage": 15, "status": "Slow granulation, edge migration minimal", "image_placeholder": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=150"}
        ],
        "notes": "Patient advised to keep limb elevated.",
        "follow_up_date": "2026-06-08",
        "follow_up_reminders": "Dressing change every 48 hours, compression wrap check.",
        "monitoring_schedule": "Weekly clinic visits",
        "image_url": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=400"
    },
    {
        "case_id": "CASE-1082",
        "date": "2026-05-30",
        "patient_id": "PAT-1102",
        "patient_name": "Alice Johnson",
        "patient_age": 25,
        "patient_gender": "Female",
        "wound_type": "Laceration",
        "severity": "Mild",
        "confidence_pct": "97.5%",
        "infection_risk": "Low (10%)",
        "healing_prediction": "Expected recovery in 7-10 days.",
        "review_status": "Reviewed",
        "healing_percentage": 85,
        "history": [
            {"day": "Day 1", "percentage": 10, "status": "Clean laceration margins, simple sutures", "image_placeholder": "https://images.unsplash.com/photo-1579684389782-64d84b5e901f?w=150"},
            {"day": "Day 5", "percentage": 45, "status": "Margins adhered, no signs of erythema", "image_placeholder": "https://images.unsplash.com/photo-1579684389782-64d84b5e901f?w=150"},
            {"day": "Day 10", "percentage": 75, "status": "Sutures removed, healthy scar formation", "image_placeholder": "https://images.unsplash.com/photo-1579684389782-64d84b5e901f?w=150"},
            {"day": "Day 15", "percentage": 85, "status": "Fully epithelialized, minimal scarring", "image_placeholder": "https://images.unsplash.com/photo-1579684389782-64d84b5e901f?w=150"}
        ],
        "notes": "Sutures removed successfully. Keep area moisturized.",
        "follow_up_date": "2026-06-15",
        "follow_up_reminders": "Monitor scar color",
        "monitoring_schedule": "PRN (As needed)",
        "image_url": "https://images.unsplash.com/photo-1579684389782-64d84b5e901f?w=400"
    },
    {
        "case_id": "CASE-3392",
        "date": "2026-05-28",
        "patient_id": "PAT-2993",
        "patient_name": "James Wilson",
        "patient_age": 55,
        "patient_gender": "Male",
        "wound_type": "Abrasion",
        "severity": "Minimal",
        "confidence_pct": "98.1%",
        "infection_risk": "Low (5%)",
        "healing_prediction": "Expected recovery in 3-5 days.",
        "review_status": "Reviewed",
        "healing_percentage": 95,
        "history": [
            {"day": "Day 1", "percentage": 25, "status": "Superficial epidermal scraping, clean", "image_placeholder": "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=150"},
            {"day": "Day 5", "percentage": 60, "status": "Dry scab formation, healthy margins", "image_placeholder": "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=150"},
            {"day": "Day 10", "percentage": 85, "status": "Scab shed, pink new skin", "image_placeholder": "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=150"},
            {"day": "Day 15", "percentage": 95, "status": "Fully resolved", "image_placeholder": "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=150"}
        ],
        "notes": "Standard healing, no clinical concern.",
        "follow_up_date": "",
        "follow_up_reminders": "",
        "monitoring_schedule": "",
        "image_url": "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400"
    },
    {
        "case_id": "CASE-1204",
        "date": "2026-05-29",
        "patient_id": "PAT-5541",
        "patient_name": "Sarah Connor",
        "patient_age": 39,
        "patient_gender": "Female",
        "wound_type": "Contusion",
        "severity": "Moderate",
        "confidence_pct": "92.0%",
        "infection_risk": "Low (2%)",
        "healing_prediction": "Expected recovery in 14-21 days.",
        "review_status": "Pending Review",
        "healing_percentage": 50,
        "history": [
            {"day": "Day 1", "percentage": 10, "status": "Dark hematoma, swelling present", "image_placeholder": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=150"},
            {"day": "Day 5", "percentage": 25, "status": "Bruising changing to yellowish-green, swelling reduced", "image_placeholder": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=150"},
            {"day": "Day 10", "percentage": 40, "status": "Swelling resolved, faint discoloration", "image_placeholder": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=150"},
            {"day": "Day 15", "percentage": 50, "status": "Almost fully resolved tissue elasticity returning", "image_placeholder": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=150"}
        ],
        "notes": "",
        "follow_up_date": "",
        "follow_up_reminders": "",
        "monitoring_schedule": "",
        "image_url": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=400"
    }
]

# ─── Wound Analysis Logic ─────────────────────────────────────────────────────
# In production, replace this with a real ML model (e.g., TensorFlow/PyTorch)
# For demonstration, we use a heuristic approach based on image properties

WOUND_TYPES = [
    {
        "type": "Laceration",
        "description": "A deep cut or tear in the skin, typically with irregular edges.",
        "first_aid": "Apply firm pressure to control bleeding. Clean with sterile saline. Cover with sterile dressing."
    },
    {
        "type": "Abrasion",
        "description": "Superficial wound caused by skin rubbing against a rough surface.",
        "first_aid": "Clean gently with mild soap and water. Apply antiseptic. Cover with non-stick dressing."
    },
    {
        "type": "Contusion",
        "description": "Bruising caused by blunt force trauma without breaking the skin.",
        "first_aid": "Apply ice wrapped in cloth for 20 min. Elevate affected area. Rest and monitor."
    },
    {
        "type": "Puncture Wound",
        "description": "A small but deep hole caused by a sharp pointed object.",
        "first_aid": "Do not remove embedded objects. Allow minor bleeding to clean. Seek medical attention."
    },
    {
        "type": "Burn Wound",
        "description": "Tissue damage caused by heat, chemicals, or radiation.",
        "first_aid": "Cool with cool running water for 10-20 min. Do NOT use ice. Cover loosely with sterile bandage."
    },
    {
        "type": "Ulcer",
        "description": "Open sore on the skin that fails to heal, often chronic in nature.",
        "first_aid": "Keep wound moist with appropriate dressing. Reduce pressure on area. Seek professional wound care."
    },
    {
        "type": "Surgical Incision",
        "description": "A precise cut made by a surgeon during a medical procedure.",
        "first_aid": "Keep incision clean and dry. Follow surgeon's post-op instructions. Monitor for signs of infection."
    },
]

SEVERITY_LEVELS = ["Minimal", "Mild", "Moderate", "Severe", "Critical"]
SEVERITY_COLORS = {
    "Minimal":  "#00e5ff",
    "Mild":     "#00ff87",
    "Moderate": "#ffd600",
    "Severe":   "#ff6d00",
    "Critical": "#ff1744",
}

ROBOT_MESSAGES = {
    "Minimal":  "Wound detected is minimal. Basic first aid is sufficient. Monitor for any changes.",
    "Mild":     "Mild wound identified. Proper cleaning and dressing recommended. Should heal within days.",
    "Moderate": "Moderate severity detected. Professional medical evaluation advised within 24 hours.",
    "Severe":   "Severe wound detected. Immediate medical attention strongly recommended.",
    "Critical": "CRITICAL condition detected! Emergency medical services should be contacted immediately.",
}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def analyze_wound_image(image_path):
    """
    Analyze wound image using image properties as heuristic.
    Replace this function with a real ML model in production.
    """
    try:
        # Compute image MD5 hash for deterministic random seed
        with open(image_path, "rb") as f:
            file_bytes = f.read()
        img_hash = int(hashlib.md5(file_bytes).hexdigest(), 16)
        local_random = random.Random(img_hash)

        with Image.open(image_path) as img:
            img_rgb = img.convert('RGB')
            width, height = img_rgb.size

            # Sample pixels for color analysis
            pixels = []
            step_x = max(1, width // 20)
            step_y = max(1, height // 20)
            for x in range(0, width, step_x):
                for y in range(0, height, step_y):
                    pixels.append(img_rgb.getpixel((x, y)))

            if not pixels:
                raise ValueError("No pixels sampled")

            avg_r = sum(p[0] for p in pixels) / len(pixels)
            avg_g = sum(p[1] for p in pixels) / len(pixels)
            avg_b = sum(p[2] for p in pixels) / len(pixels)

            # Heuristic: redness ratio indicates wound severity
            redness_ratio = avg_r / (avg_g + avg_b + 1)
            brightness = (avg_r + avg_g + avg_b) / 3

            # Determine severity from image characteristics
            if redness_ratio > 1.5:
                severity_idx = min(4, int((redness_ratio - 1.5) * 3) + 2)
            elif brightness < 60:
                severity_idx = 3  # dark image → could be deep wound/bruise
            elif brightness > 200:
                severity_idx = 0  # very bright → minimal
            else:
                severity_idx = local_random.randint(1, 3)

            severity_idx = max(0, min(4, severity_idx))
            severity = SEVERITY_LEVELS[severity_idx]

            # Determine wound type heuristically
            if redness_ratio > 1.4:
                wound_candidates = [WOUND_TYPES[0], WOUND_TYPES[4]]  # Laceration or Burn
            elif brightness < 80:
                wound_candidates = [WOUND_TYPES[2], WOUND_TYPES[5]]  # Contusion or Ulcer
            else:
                wound_candidates = WOUND_TYPES

            wound = local_random.choice(wound_candidates)

            # Confidence score (60–99%)
            base_confidence = 0.75 + (redness_ratio - 1.0) * 0.05
            confidence = round(min(0.99, max(0.60, base_confidence + local_random.uniform(-0.08, 0.08))), 4)

            # Treatment recommendation logic based on severity
            # Minimal/Mild -> Low
            # Moderate -> Medium
            # Severe -> High
            # Critical -> Critical
            if severity in ["Minimal", "Mild"]:
                treatment_recommendations = [
                    "Clean wound area with sterile saline or mild soap water.",
                    "Apply topical antiseptic/antibiotic ointment to prevent bacterial growth.",
                    "Protect the wound bed with a clean, light dressing."
                ]
            elif severity == "Moderate":
                treatment_recommendations = [
                    "Apply a clean, sterile primary dressing to manage exudate.",
                    "Monitor healing progress daily for signs of inflammation.",
                    "Consult a general practitioner if healing stagnates after 48 hours."
                ]
            elif severity == "Severe":
                treatment_recommendations = [
                    "Seek immediate professional medical evaluation.",
                    "Initiate specialized clinical infection management protocols.",
                    "Apply advanced sterile compression dressings as appropriate."
                ]
            else:  # Critical
                treatment_recommendations = [
                    "Initiate emergency clinical intervention protocols immediately.",
                    "Stabilize the patient and manage vital signs.",
                    "Ensure immediate transfer to specialized emergency facilities."
                ]

            # Triage Classification and Priority Score calculation based on severity
            priority_score_ranges = {
                "Minimal": (5, 25),
                "Mild": (26, 50),
                "Moderate": (51, 75),
                "Severe": (76, 90),
                "Critical": (91, 100)
            }
            p_min, p_max = priority_score_ranges[severity]
            priority_score = local_random.randint(p_min, p_max)

            triage_classification = "Green"
            triage_label = "Low Risk"
            triage_color = "#00ff87"
            if severity == "Moderate":
                triage_classification = "Yellow"
                triage_label = "Moderate Risk"
                triage_color = "#ffd600"
            elif severity == "Severe":
                triage_classification = "Orange"
                triage_label = "High Risk"
                triage_color = "#ff6d00"
            elif severity == "Critical":
                triage_classification = "Red"
                triage_label = "Critical"
                triage_color = "#ff1744"

            # Generate random patient metadata
            patient_names = [
                "John Doe", "Jane Smith", "Alex Johnson", "Emily Davis", "Michael Brown",
                "Sarah Miller", "David Wilson", "James Taylor", "Linda Anderson", "Robert Thomas"
            ]
            patient_id = f"PAT-{local_random.randint(1000, 9999)}"
            patient_name = local_random.choice(patient_names)

            # Heuristic calculation for size (sq. cm) and infection level (%) based on redness and brightness
            wound_size_sqcm = round(local_random.uniform(1.5, 12.0) * (redness_ratio if redness_ratio > 1.0 else 1.0), 1)
            infection_level = min(100, int((redness_ratio - 0.5) * 50 + local_random.randint(-10, 10)))
            infection_level = max(0, infection_level)

            # Heuristics for recovery calculations
            # Base healing percentage starts high for low severity and low for critical
            severity_recovery_days = {
                "Minimal": (3, 7),
                "Mild": (7, 14),
                "Moderate": (14, 28),
                "Severe": (28, 60),
                "Critical": (60, 120)
            }
            min_days, max_days = severity_recovery_days[severity]
            estimated_days = int(min_days + (max_days - min_days) * (infection_level / 100.0) + (wound_size_sqcm / 15.0) * 5)
            estimated_days = max(min_days, estimated_days)

            # Generate progressive healing data for 4 weeks (or 4 intervals)
            healing_progress_chart = []
            for week in range(1, 5):
                # Healing percentage progress curve
                progress_ratio = min(1.0, week / 4.0)
                if severity in ["Minimal", "Mild"]:
                    pct = int(100 * (1 - (1 - progress_ratio)**2)) # fast healing curve
                else:
                    pct = int(100 * progress_ratio * 0.8) # slower healing curve for severe
                healing_progress_chart.append({"interval": f"Week {week}", "percentage": min(100, pct)})

            # The current estimated healing percentage at evaluation (day 1)
            current_healing_pct = max(0, min(95, 100 - infection_level - (severity_idx * 15)))

            return {
                "success": True,
                "wound_type": wound["type"],
                "description": wound["description"],
                "first_aid": wound["first_aid"],
                "severity": severity,
                "severity_color": SEVERITY_COLORS[severity],
                "confidence": confidence,
                "confidence_pct": f"{confidence * 100:.1f}%",
                "robot_message": ROBOT_MESSAGES[severity],
                "treatment_plan": treatment_recommendations,
                "patient_id": patient_id,
                "patient_name": patient_name,
                "priority_score": priority_score,
                "triage_classification": triage_classification,
                "triage_label": triage_label,
                "triage_color": triage_color,
                "prediction": {
                    "wound_size": f"{wound_size_sqcm} cm²",
                    "infection_level": f"{infection_level}%",
                    "current_healing_pct": current_healing_pct,
                    "estimated_days": estimated_days,
                    "chart_data": healing_progress_chart
                },
                "image_stats": {
                    "avg_red": round(avg_r, 1),
                    "avg_green": round(avg_g, 1),
                    "avg_blue": round(avg_b, 1),
                    "redness_ratio": round(redness_ratio, 3),
                    "brightness": round(brightness, 1),
                    "resolution": f"{width}×{height}px",
                }
            }

    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── User Database & Authentication ───────────────────────────────────────────
USERS_FILE = 'users.json'

def load_users():
    import json
    if not os.path.exists(USERS_FILE):
        default_data = {
            "patients": {
                "john@roboheal.org": {
                    "name": "John Doe",
                    "password": "password123",
                    "history": [
                        { "id": "CASE-2891", "date": "2026-05-15", "wound": "Laceration", "severity": "Mild", "progress": 85, "days": "5-7 Days", "img": "" },
                        { "id": "CASE-4902", "date": "2026-05-24", "wound": "Abrasion", "severity": "Minimal", "progress": 95, "days": "3-5 Days", "img": "" }
                    ]
                },
                "emily@roboheal.org": {
                    "name": "Emily Davis",
                    "password": "password123",
                    "history": [
                        { "id": "CASE-1084", "date": "2026-06-01", "wound": "Burn Wound", "severity": "Severe", "progress": 40, "days": "28-35 Days", "img": "" }
                    ]
                }
            },
            "doctors": {
                "smith@skinaid.org": {
                    "name": "Dr. Smith",
                    "password": "password123",
                    "major": "Dermatology",
                    "cases": ["CASE-9021", "CASE-4091", "CASE-1082", "CASE-3392", "CASE-1204"]
                }
            }
        }
        with open(USERS_FILE, 'w') as f:
            json.dump(default_data, f, indent=4)
        return default_data
    try:
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return {"patients": {}, "doctors": {}}

def save_users(data):
    import json
    with open(USERS_FILE, 'w') as f:
        json.dump(data, f, indent=4)


@app.route('/api/auth/signup', methods=['POST'])
def api_signup():
    data = request.json or {}
    email = data.get('email', '').strip()
    password = data.get('password', '')
    name = data.get('name', '').strip()
    role = data.get('role', 'patient')
    major = data.get('major', '').strip()

    if not email or not password or not name:
        return jsonify({"success": False, "error": "Missing required fields"}), 400

    users = load_users()
    db_key = "doctors" if role == "doctor" else "patients"

    if email in users[db_key]:
        return jsonify({"success": False, "error": "Account already exists"}), 400

    if role == "doctor":
        users["doctors"][email] = {
            "name": name,
            "password": password,
            "major": major or "General",
            "cases": []
        }
    else:
        users["patients"][email] = {
            "name": name,
            "password": password,
            "history": []
        }

    save_users(users)
    return jsonify({"success": True, "message": "Account created successfully"})


@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.json or {}
    email = data.get('email', '').strip()
    password = data.get('password', '')
    role = data.get('role', 'patient')

    if not email or not password:
        return jsonify({"success": False, "error": "Missing email or password"}), 400

    users = load_users()
    db_key = "doctors" if role == "doctor" else "patients"

    user = users[db_key].get(email)
    if not user or user["password"] != password:
        return jsonify({"success": False, "error": "Invalid email or password"}), 401

    return jsonify({
        "success": True,
        "user": user
    })


@app.route('/api/auth/update_history', methods=['POST'])
def api_update_history():
    data = request.json or {}
    email = data.get('email', '').strip()
    history = data.get('history', [])

    if not email:
        return jsonify({"success": False, "error": "Missing email"}), 400

    users = load_users()
    if email in users["patients"]:
        users["patients"][email]["history"] = history
        save_users(users)
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "User not found"}), 404


@app.route('/api/auth/update_doctor_cases', methods=['POST'])
def api_update_doctor_cases():
    data = request.json or {}
    email = data.get('email', '').strip()
    cases = data.get('cases', [])

    if not email:
        return jsonify({"success": False, "error": "Missing email"}), 400

    users = load_users()
    if email in users["doctors"]:
        users["doctors"][email]["cases"] = cases
        save_users(users)
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "Doctor not found"}), 404


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/analyze', methods=['POST'])
def analyze():
    if 'image' not in request.files:
        return jsonify({"success": False, "error": "No image file provided"}), 400

    file = request.files['image']

    if file.filename == '':
        return jsonify({"success": False, "error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"success": False, "error": "File type not allowed. Use PNG, JPG, JPEG, GIF, BMP, WEBP or DCM"}), 400

    try:
        filename = f"{uuid.uuid4().hex}_{secure_filename(file.filename)}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        # Compute deterministic seed for metadata
        with open(filepath, "rb") as f:
            file_bytes = f.read()
        img_hash = int(hashlib.md5(file_bytes).hexdigest(), 16)
        local_random = random.Random(img_hash)

        is_dcm = file.filename.lower().endswith('.dcm')
        if is_dcm:
            # Generate simulated DICOM parameters and bypass PIL image parsing
            placeholder_url = "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=400"
            result = {
                "success": True,
                "wound_type": "Ulcer",
                "description": "Diabetic neuropathic foot ulceration with high infection indicators parsed from DICOM capture.",
                "first_aid": "Clean wound, apply sterile moisture dressing, offload pressure, consult podiatric specialist.",
                "severity": "Critical",
                "severity_color": "#ff1744",
                "confidence": 0.942,
                "confidence_pct": "94.2%",
                "robot_message": "CRITICAL condition detected! Patient requires immediate wound clinic attention.",
                "treatment_plan": [
                    "Perform sharp debridement of hyperkeratotic wound margins.",
                    "Apply antimicrobial alginate dressing to manage moderate exudate.",
                    "Implement total contact casting or offloading footwear immediately."
                ],
                "patient_id": f"PAT-{local_random.randint(1000, 9999)}",
                "patient_name": local_random.choice(["Marcus Aurelius", "Cornelius Scipio", "Agrippina Major"]),
                "priority_score": 95,
                "triage_classification": "Red",
                "triage_label": "Critical",
                "triage_color": "#ff1744",
                "prediction": {
                    "wound_size": "8.5 cm²",
                    "infection_level": "85%",
                    "current_healing_pct": 15,
                    "estimated_days": 75,
                    "chart_data": [
                        {"interval": "Week 1", "percentage": 15},
                        {"interval": "Week 2", "percentage": 25},
                        {"interval": "Week 3", "percentage": 42},
                        {"interval": "Week 4", "percentage": 68}
                    ]
                },
                "image_stats": {
                    "avg_red": 140.2,
                    "avg_green": 95.4,
                    "avg_blue": 88.1,
                    "redness_ratio": 1.468,
                    "brightness": 107.9,
                    "resolution": "512×512px"
                },
                "dicom_header": {
                    "modality": "OT (Other/Secondary Capture)",
                    "manufacturer": "Siemens Healthineers",
                    "institution": "Metro General Hospital",
                    "study_date": "2026-06-02",
                    "patient_orientation": "L\\F",
                    "slice_thickness": "N/A"
                }
            }
        else:
            result = analyze_wound_image(filepath)
            
        result['filename'] = filename

        # Sync to PATIENT_CASES mock db
        new_case_id = f"CASE-{local_random.randint(1000, 9999)}"
        new_case = {
            "case_id": new_case_id,
            "date": result.get("date", "2026-06-02"),
            "patient_id": result.get("patient_id", "PAT-XXXX"),
            "patient_name": result.get("patient_name", "Anonymous"),
            "patient_age": local_random.randint(18, 75),
            "patient_gender": local_random.choice(["Male", "Female", "Other"]),
            "wound_type": result.get("wound_type", "Unknown"),
            "severity": result.get("severity", "Moderate"),
            "confidence_pct": result.get("confidence_pct", "90.0%"),
            "infection_risk": f"{result.get('prediction', {}).get('infection_level', '0')}%",
            "healing_prediction": f"Expected recovery in {result.get('prediction', {}).get('estimated_days', 14)} days.",
            "review_status": "Pending Review",
            "healing_percentage": result.get("prediction", {}).get("current_healing_pct", 50),
            "history": [
                {"day": "Day 1", "percentage": result.get("prediction", {}).get("current_healing_pct", 50), "status": f"Initial evaluation of {result.get('wound_type', 'wound')}", "image_placeholder": f"/uploads/{filename}" if not is_dcm else "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=150"},
                {"day": "Day 5", "percentage": min(95, result.get("prediction", {}).get("current_healing_pct", 50) + 15), "status": "Margins contracted, recovery underway", "image_placeholder": "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=150"},
                {"day": "Day 10", "percentage": min(98, result.get("prediction", {}).get("current_healing_pct", 50) + 30), "status": "Granulation stable, swelling reduced", "image_placeholder": "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=150"},
                {"day": "Day 15", "percentage": min(100, result.get("prediction", {}).get("current_healing_pct", 50) + 45), "status": "Epithelialization nearly complete", "image_placeholder": "https://images.unsplash.com/photo-1579684389782-64d84b5e901f?w=150"}
            ],
            "notes": "",
            "follow_up_date": "",
            "follow_up_reminders": "",
            "monitoring_schedule": "",
            "image_url": f"/uploads/{filename}" if not is_dcm else "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=400"
        }
        if is_dcm:
            new_case["dicom_header"] = result["dicom_header"]
            
        PATIENT_CASES.insert(0, new_case)
        result['case_id'] = new_case_id

        return jsonify(result)

    except Exception as e:
        return jsonify({"success": False, "error": f"Server error: {str(e)}"}), 500


@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/health')
def health():
    return jsonify({"status": "online", "service": "SkinAid Patient Portal Diagnostics API", "version": "3.0.0"})


@app.route('/doctor')
def doctor_portal():
    return render_template('doctor.html')


@app.route('/api/cases', methods=['GET'])
def get_cases():
    return jsonify(PATIENT_CASES)


@app.route('/api/cases/<case_id>', methods=['GET'])
def get_case_detail(case_id):
    case = next((c for c in PATIENT_CASES if c['case_id'] == case_id), None)
    if not case:
        return jsonify({"success": False, "error": "Case not found"}), 404
    return jsonify(case)


@app.route('/api/cases/<case_id>/notes', methods=['POST'])
def save_case_notes(case_id):
    case = next((c for c in PATIENT_CASES if c['case_id'] == case_id), None)
    if not case:
        return jsonify({"success": False, "error": "Case not found"}), 404
    
    data = request.json or {}
    case['notes'] = data.get('notes', '')
    case['review_status'] = 'Reviewed'
    return jsonify({"success": True, "case": case})


@app.route('/api/cases/<case_id>/followup', methods=['POST'])
def save_case_followup(case_id):
    case = next((c for c in PATIENT_CASES if c['case_id'] == case_id), None)
    if not case:
        return jsonify({"success": False, "error": "Case not found"}), 404
    
    data = request.json or {}
    case['follow_up_date'] = data.get('follow_up_date', '')
    case['follow_up_reminders'] = data.get('follow_up_reminders', '')
    case['monitoring_schedule'] = data.get('monitoring_schedule', '')
    case['review_status'] = 'Reviewed'
    return jsonify({"success": True, "case": case})


@app.route('/api/hospital/stats', methods=['GET'])
def get_hospital_stats():
    stats = {
        "departments": [
            {"id": "dept-1", "name": "Wound Care Clinic", "patients": 48, "critical_alerts": 3, "staff_active": 8, "bed_occupancy_pct": 82},
            {"id": "dept-2", "name": "Dermatology", "patients": 32, "critical_alerts": 0, "staff_active": 5, "bed_occupancy_pct": 65},
            {"id": "dept-3", "name": "General Surgery", "patients": 74, "critical_alerts": 6, "staff_active": 12, "bed_occupancy_pct": 90},
            {"id": "dept-4", "name": "Emergency CDSS Dept", "patients": 115, "critical_alerts": 14, "staff_active": 20, "bed_occupancy_pct": 95},
            {"id": "dept-5", "name": "Outpatient CDSS Unit", "patients": 60, "critical_alerts": 1, "staff_active": 6, "bed_occupancy_pct": 40}
        ],
        "total_active_beds": 350,
        "occupied_beds": 298,
        "active_clinical_alerts": 24
    }
    return jsonify(stats)


@app.route('/api/research/datasets', methods=['GET'])
def get_research_datasets():
    datasets = {
        "cases_analyzed": 1420,
        "ml_model_accuracy": "96.4%",
        "datasets": [
            {"treatment": "Antimicrobial Alginate Dressing", "effectiveness_pct": 88, "cases_count": 340, "avg_healing_days": 21},
            {"treatment": "Hydrocolloid Protective Shield", "effectiveness_pct": 74, "cases_count": 450, "avg_healing_days": 14},
            {"treatment": "Negative Pressure Wound Therapy", "effectiveness_pct": 92, "cases_count": 180, "avg_healing_days": 45},
            {"treatment": "Silver Sulfadiazine Dressing", "effectiveness_pct": 85, "cases_count": 290, "avg_healing_days": 28},
            {"treatment": "Compression Therapy Wraps", "effectiveness_pct": 80, "cases_count": 160, "avg_healing_days": 60}
        ]
    }
    return jsonify(datasets)


@app.route('/api/cases/<case_id>/collaborate', methods=['POST'])
def save_case_collaboration(case_id):
    case = next((c for c in PATIENT_CASES if c['case_id'] == case_id), None)
    if not case:
        return jsonify({"success": False, "error": "Case not found"}), 404
    
    data = request.json or {}
    referral_dept = data.get('referral_dept', '')
    referral_doctor = data.get('referral_doctor', '')
    collaboration_notes = data.get('collaboration_notes', '')
    
    case['collaboration'] = {
        "referral_dept": referral_dept,
        "referral_doctor": referral_doctor,
        "collaboration_notes": collaboration_notes,
        "status": "Awaiting Specialist Review"
    }
    case['review_status'] = 'Reviewed'
    return jsonify({"success": True, "case": case})


if __name__ == '__main__':
    print("SkinAid Patient Portal System Starting...")
    print("Visit: http://127.0.0.1:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)
