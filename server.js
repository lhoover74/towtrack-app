const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: false }));
app.use((req, res, next) => { res.locals.req = req; next(); });

const db = new sqlite3.Database('./db/towtrack.db');

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    address TEXT,
    internal_code TEXT,
    zones TEXT,
    towing_rules TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS towing_companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    email TEXT,
    dispatch_contact TEXT,
    notes TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_plate TEXT,
    plate_state TEXT,
    vin TEXT,
    make TEXT,
    model TEXT,
    year INTEGER,
    color TEXT,
    body_style TEXT,
    property_id INTEGER,
    lot_zone_space TEXT,
    exact_location TEXT,
    unit_resident TEXT,
    tow_reason TEXT,
    notes TEXT,
    current_status TEXT,
    date_observed DATETIME,
    date_warning DATETIME,
    date_marked DATETIME,
    date_requested DATETIME,
    date_completed DATETIME,
    towing_company_id INTEGER,
    tow_ref TEXT,
    created_by INTEGER,
    last_updated_by INTEGER,
    external_check_performed INTEGER DEFAULT 0,
    external_check_last_at DATETIME,
    external_check_last_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id),
    FOREIGN KEY (towing_company_id) REFERENCES towing_companies(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (last_updated_by) REFERENCES users(id),
    FOREIGN KEY (external_check_last_by) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS vehicle_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER,
    status TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER,
    notes TEXT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER,
    file_path TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    uploader_id INTEGER,
    label TEXT,
    category TEXT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    FOREIGN KEY (uploader_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS activity_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER,
    action_type TEXT,
    description TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER,
    details TEXT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  // seed admin
  db.get("SELECT * FROM users WHERE username = 'admin'", (err, row) => {
    if (!row) {
      bcrypt.hash('admin123', 10, (err, hash) => {
        db.run("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", ['admin', hash, 'Admin']);
      });
    }
  });

  // seed property
  db.get("SELECT * FROM properties WHERE name = 'Sample Property'", (err, row) => {
    if (!row) {
      db.run("INSERT INTO properties (name, address, internal_code) VALUES (?, ?, ?)", ['Sample Property', '123 Main St', 'PROP001']);
    }
  });

  // seed towing company
  db.get("SELECT * FROM towing_companies WHERE name = 'Sample Towing'", (err, row) => {
    if (!row) {
      db.run("INSERT INTO towing_companies (name, phone, email) VALUES (?, ?, ?)", ['Sample Towing', '555-1234', 'dispatch@sampletow.com']);
    }
  });
});

function requireAuth(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.session.role === role || req.session.role === 'Admin') {
      next();
    } else {
      res.status(403).send('Access denied');
    }
  };
}

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (user && bcrypt.compareSync(password, user.password_hash)) {
      req.session.userId = user.id;
      req.session.role = user.role;
      res.redirect('/dashboard');
    } else {
      res.render('login', { error: 'Invalid credentials' });
    }
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/dashboard', requireAuth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  db.get("SELECT COUNT(*) as count FROM vehicles WHERE DATE(created_at) = ?", [today], (err, entered) => {
    db.get("SELECT COUNT(*) as count FROM vehicles WHERE current_status IN ('Marked for Tow', 'Tow Requested', 'Awaiting Tow Truck')", (err, pending) => {
      db.get("SELECT COUNT(*) as count FROM vehicles WHERE current_status = 'Towed'", (err, towed) => {
        db.get("SELECT COUNT(*) as count FROM vehicles WHERE current_status IN ('Released', 'Cancelled', 'Cleared/Resolved')", (err, resolved) => {
          db.all("SELECT v.*, u.username as creator FROM vehicles v JOIN users u ON v.created_by = u.id ORDER BY v.created_at DESC LIMIT 10", (err, recent) => {
            res.render('dashboard', { entered: entered.count, pending: pending.count, towed: towed.count, resolved: resolved.count, recent });
          });
        });
      });
    });
  });
});

app.get('/vehicles', requireAuth, (req, res) => {
  const { search, status, property } = req.query;
  let query = "SELECT v.*, p.name as property_name FROM vehicles v LEFT JOIN properties p ON v.property_id = p.id";
  let params = [];
  let conditions = [];
  if (search) {
    conditions.push("(v.license_plate LIKE ? OR v.vin LIKE ? OR v.make LIKE ? OR v.model LIKE ? OR v.color LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) {
    conditions.push("v.current_status = ?");
    params.push(status);
  }
  if (property) {
    conditions.push("v.property_id = ?");
    params.push(property);
  }
  if (conditions.length) {
    query += " WHERE " + conditions.join(" AND ");
  }
  query += " ORDER BY v.created_at DESC";
  db.all(query, params, (err, vehicles) => {
    db.all("SELECT * FROM properties", (err, properties) => {
      res.render('vehicles', { vehicles, properties, search, status, property });
    });
  });
});

app.get('/vehicles/add', requireAuth, (req, res) => {
  db.all("SELECT * FROM properties", (err, properties) => {
    db.all("SELECT * FROM towing_companies WHERE active = 1", (err, towingCompanies) => {
      res.render('add_vehicle', { properties, towingCompanies, error: null });
    });
  });
});

app.post('/vehicles/add', requireAuth, (req, res) => {
  const { license_plate, plate_state, vin, make, model, year, color, body_style, property_id, lot_zone_space, exact_location, unit_resident, tow_reason, notes, current_status } = req.body;
  db.run("INSERT INTO vehicles (license_plate, plate_state, vin, make, model, year, color, body_style, property_id, lot_zone_space, exact_location, unit_resident, tow_reason, notes, current_status, created_by, last_updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [license_plate, plate_state, vin, make, model, year, color, body_style, property_id, lot_zone_space, exact_location, unit_resident, tow_reason, notes, current_status || 'Observed', req.session.userId, req.session.userId], function(err) {
    if (err) {
      db.all("SELECT * FROM properties", (err2, properties) => {
        db.all("SELECT * FROM towing_companies WHERE active = 1", (err2, towingCompanies) => {
          res.render('add_vehicle', { properties, towingCompanies, error: err.message });
        });
      });
    } else {
      const vehicleId = this.lastID;
      db.run("INSERT INTO vehicle_history (vehicle_id, status, user_id) VALUES (?, ?, ?)", [vehicleId, current_status || 'Observed', req.session.userId]);
      db.run("INSERT INTO activity_timeline (vehicle_id, action_type, description, user_id) VALUES (?, ?, ?, ?)", [vehicleId, 'created', 'Vehicle record created', req.session.userId]);
      res.redirect('/vehicles/' + vehicleId);
    }
  });
});

app.get('/vehicles/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  db.get("SELECT v.*, p.name as property_name, tc.name as towing_company_name, cu.username as creator, uu.username as updater, ec.username as checker FROM vehicles v LEFT JOIN properties p ON v.property_id = p.id LEFT JOIN towing_companies tc ON v.towing_company_id = tc.id LEFT JOIN users cu ON v.created_by = cu.id LEFT JOIN users uu ON v.last_updated_by = uu.id LEFT JOIN users ec ON v.external_check_last_by = ec.id WHERE v.id = ?", [id], (err, vehicle) => {
    if (!vehicle) return res.status(404).send('Vehicle not found');
    db.all("SELECT vh.*, u.username FROM vehicle_history vh JOIN users u ON vh.user_id = u.id WHERE vh.vehicle_id = ? ORDER BY vh.timestamp DESC", [id], (err, history) => {
      db.all("SELECT p.*, u.username as uploader FROM photos p JOIN users u ON p.uploader_id = u.id WHERE p.vehicle_id = ? ORDER BY p.timestamp DESC", [id], (err, photos) => {
        db.all("SELECT a.*, u.username FROM activity_timeline a JOIN users u ON a.user_id = u.id WHERE a.vehicle_id = ? ORDER BY a.timestamp DESC", [id], (err, activities) => {
          db.all("SELECT * FROM properties", (err, properties) => {
            db.all("SELECT * FROM towing_companies WHERE active = 1", (err, towingCompanies) => {
              res.render('vehicle_detail', { vehicle, history, photos, activities, properties, towingCompanies });
            });
          });
        });
      });
    });
  });
});

app.post('/vehicles/:id/update', requireAuth, (req, res) => {
  const id = req.params.id;
  const updates = req.body;
  let setParts = [];
  let params = [];
  const allowedFields = ['license_plate', 'plate_state', 'vin', 'make', 'model', 'year', 'color', 'body_style', 'property_id', 'lot_zone_space', 'exact_location', 'unit_resident', 'tow_reason', 'notes', 'current_status', 'date_observed', 'date_warning', 'date_marked', 'date_requested', 'date_completed', 'towing_company_id', 'tow_ref'];
  for (let field of allowedFields) {
    if (updates[field] !== undefined) {
      setParts.push(`${field} = ?`);
      params.push(updates[field]);
    }
  }
  setParts.push('last_updated_by = ?, updated_at = CURRENT_TIMESTAMP');
  params.push(req.session.userId);
  params.push(id);
  db.run(`UPDATE vehicles SET ${setParts.join(', ')} WHERE id = ?`, params, function(err) {
    if (err) {
      res.status(500).send(err.message);
    } else {
      if (updates.current_status) {
        db.run("INSERT INTO vehicle_history (vehicle_id, status, user_id, notes) VALUES (?, ?, ?, ?)", [id, updates.current_status, req.session.userId, updates.notes || '']);
      }
      db.run("INSERT INTO activity_timeline (vehicle_id, action_type, description, user_id) VALUES (?, ?, ?, ?)", [id, 'updated', 'Vehicle updated', req.session.userId]);
      res.redirect('/vehicles/' + id);
    }
  });
});

app.post('/vehicles/:id/upload', requireAuth, upload.single('photo'), (req, res) => {
  const id = req.params.id;
  const { label, category } = req.body;
  if (req.file) {
    db.run("INSERT INTO photos (vehicle_id, file_path, uploader_id, label, category) VALUES (?, ?, ?, ?, ?)", [id, req.file.path, req.session.userId, label, category], function(err) {
      if (err) {
        res.status(500).send(err.message);
      } else {
        db.run("INSERT INTO activity_timeline (vehicle_id, action_type, description, user_id) VALUES (?, ?, ?, ?)", [id, 'photo_uploaded', `Photo uploaded: ${label || req.file.filename}`, req.session.userId]);
        res.redirect('/vehicles/' + id);
      }
    });
  } else {
    res.status(400).send('No file uploaded');
  }
});

app.post('/vehicles/:id/check-stolen', requireAuth, (req, res) => {
  const id = req.params.id;
  db.get("SELECT license_plate, plate_state FROM vehicles WHERE id = ?", [id], (err, vehicle) => {
    if (vehicle && vehicle.license_plate) {
      const url = `https://publicsearch2.chicagopolice.org/FindMyCar/Vehicle/Search?plate=${encodeURIComponent(vehicle.license_plate)}&state=${encodeURIComponent(vehicle.plate_state)}`;
      db.run("INSERT INTO activity_timeline (vehicle_id, action_type, description, user_id, details) VALUES (?, ?, ?, ?, ?)", [id, 'stolen_check', 'Stolen vehicle check performed', req.session.userId, JSON.stringify({ plate: vehicle.license_plate, state: vehicle.plate_state })]);
      db.run("UPDATE vehicles SET external_check_performed = 1, external_check_last_at = CURRENT_TIMESTAMP, external_check_last_by = ? WHERE id = ?", [req.session.userId, id]);
      res.redirect(url);
    } else {
      res.status(400).send('No license plate available');
    }
  });
});

app.get('/properties', requireAuth, requireRole('Admin'), (req, res) => {
  db.all("SELECT * FROM properties", (err, properties) => {
    res.render('properties', { properties });
  });
});

app.get('/properties/add', requireAuth, requireRole('Admin'), (req, res) => {
  res.render('add_property', { error: null });
});

app.post('/properties/add', requireAuth, requireRole('Admin'), (req, res) => {
  const { name, address, internal_code, zones, towing_rules, notes } = req.body;
  db.run("INSERT INTO properties (name, address, internal_code, zones, towing_rules, notes) VALUES (?, ?, ?, ?, ?, ?)", [name, address, internal_code, zones, towing_rules, notes], function(err) {
    if (err) {
      res.render('add_property', { error: err.message });
    } else {
      res.redirect('/properties');
    }
  });
});

app.get('/towing-companies', requireAuth, requireRole('Admin'), (req, res) => {
  db.all("SELECT * FROM towing_companies", (err, companies) => {
    res.render('towing_companies', { companies });
  });
});

app.get('/towing-companies/add', requireAuth, requireRole('Admin'), (req, res) => {
  res.render('add_towing_company', { error: null });
});

app.post('/towing-companies/add', requireAuth, requireRole('Admin'), (req, res) => {
  const { name, phone, email, dispatch_contact, notes, active } = req.body;
  db.run("INSERT INTO towing_companies (name, phone, email, dispatch_contact, notes, active) VALUES (?, ?, ?, ?, ?, ?)", [name, phone, email, dispatch_contact, notes, active ? 1 : 0], function(err) {
    if (err) {
      res.render('add_towing_company', { error: err.message });
    } else {
      res.redirect('/towing-companies');
    }
  });
});

app.get('/reports', requireAuth, (req, res) => {
  db.all("SELECT v.*, p.name as property_name FROM vehicles v LEFT JOIN properties p ON v.property_id = p.id WHERE v.current_status IN ('Marked for Tow', 'Tow Requested', 'Awaiting Tow Truck')", (err, open) => {
    db.all("SELECT v.*, p.name as property_name, tc.name as towing_company_name FROM vehicles v LEFT JOIN properties p ON v.property_id = p.id LEFT JOIN towing_companies tc ON v.towing_company_id = tc.id WHERE v.current_status = 'Towed'", (err, completed) => {
      db.all("SELECT v.*, p.name as property_name FROM vehicles v LEFT JOIN properties p ON v.property_id = p.id WHERE v.current_status IN ('Released', 'Cancelled', 'Cleared/Resolved')", (err, cancelled) => {
        db.all("SELECT p.name, COUNT(v.id) as count FROM properties p LEFT JOIN vehicles v ON p.id = v.property_id GROUP BY p.id", (err, byProperty) => {
          db.all("SELECT tow_reason, COUNT(*) as count FROM vehicles GROUP BY tow_reason", (err, byReason) => {
            db.all("SELECT tc.name, COUNT(v.id) as count FROM towing_companies tc LEFT JOIN vehicles v ON tc.id = v.towing_company_id GROUP BY tc.id", (err, byCompany) => {
              res.render('reports', { open, completed, cancelled, byProperty, byReason, byCompany });
            });
          });
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`TowTrack running on port ${PORT}`);
});