const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const multer = require("multer");

const app  = express();
const PORT = 3000;

// ─── Load settings.json ───────────────────────────────────────────────────────
const SETTINGS_FILE = path.join(__dirname, "settings.json");

function loadSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    // Strip _comment keys before parsing isn't needed — JSON.parse handles them fine
    return JSON.parse(raw);
  } catch (e) {
    console.error("⚠  Could not read settings.json:", e.message);
    console.error("   Create a settings.json next to server.js (see README).");
    process.exit(1);
  }
}

const CFG      = loadSettings();
const DIRS     = CFG.directories || {};
const DEFAULTS = CFG.defaults    || {};

const MODELS_DIR = DIRS.checkpoints || "/sdcard/Download/models/checkpoints";
const LORAS_DIR  = DIRS.loras       || "/sdcard/Download/models/loras";
const VAES_DIR   = DIRS.vaes        || "/sdcard/Download/models/vaes";
const OUTPUT_DIR = DIRS.output      || "/sdcard/Download/SD";
const SD_BINARY  = DIRS.binary      || "sd-cli";


// Temp dir for uploaded init images
const UPLOAD_DIR = path.join(os.tmpdir(), "sd-web-uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 50 * 1024 * 1024 } });

// Create dirs if missing
[MODELS_DIR, LORAS_DIR, VAES_DIR, OUTPUT_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MODEL_EXTS = /\.(safetensors|gguf|ckpt|bin|pt)$/i;
const LORA_EXTS  = /\.(safetensors|gguf|bin|pt)$/i;
const VAE_EXTS   = /\.(safetensors|gguf|bin|pt)$/i;

function listDir(dir, re) {
  try {
    return fs.readdirSync(dir)
      .filter(f => re.test(f) && fs.statSync(path.join(dir, f)).isFile())
      .sort();
  } catch { return []; }
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use("/outputs", express.static(OUTPUT_DIR));
app.use("/icons",  express.static(require("path").join(__dirname, "icons")));

// ─── File listing endpoints ───────────────────────────────────────────────────
app.get("/list/models", (_, res) => res.json({ dir: MODELS_DIR, files: listDir(MODELS_DIR, MODEL_EXTS) }));
app.get("/list/loras",  (_, res) => res.json({ dir: LORAS_DIR,  files: listDir(LORAS_DIR,  LORA_EXTS)  }));
app.get("/list/vaes",   (_, res) => res.json({ dir: VAES_DIR,   files: listDir(VAES_DIR,   VAE_EXTS)   }));
app.get("/list/all",    (_, res) => res.json({
  models:   { dir: MODELS_DIR, files: listDir(MODELS_DIR, MODEL_EXTS) },
  loras:    { dir: LORAS_DIR,  files: listDir(LORAS_DIR,  LORA_EXTS)  },
  vaes:     { dir: VAES_DIR,   files: listDir(VAES_DIR,   VAE_EXTS)   },
  defaults:  DEFAULTS,
  language:  CFG.language || "en",
}));

// ─── Language files ───────────────────────────────────────────────────────────
const LANG_DIR = path.join(__dirname, "lang");

app.get("/lang/list", (_, res) => {
  try {
    const files = fs.readdirSync(LANG_DIR).filter(f => f.endsWith(".json"));
    const langs = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(LANG_DIR, f), "utf8"));
        return { code: f.replace(".json",""), label: data._label || f.replace(".json","") };
      } catch { return null; }
    }).filter(Boolean);
    res.json(langs);
  } catch { res.json([]); }
});

app.get("/lang/:code", (req, res) => {
  const file = path.join(LANG_DIR, req.params.code.replace(/[^a-z0-9_-]/gi,"") + ".json");
  if (fs.existsSync(file)) res.sendFile(file);
  else res.status(404).json({ error: "Language not found" });
});

// ─── Upload init image ────────────────────────────────────────────────────────
app.post("/upload-init", upload.single("init_img"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file received" });
  // Rename to preserve extension so sd-cli can detect format
  const ext  = path.extname(req.file.originalname).toLowerCase() || ".png";
  const dest = req.file.path + ext;
  fs.renameSync(req.file.path, dest);
  res.json({ ok: true, path: dest, name: req.file.originalname });
});

// ─── Embedded HTML ────────────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>SD.cpp Web UI</title>
<link href="https://fonts.googleapis.com/css2?family=MuseoModerno:wght@400;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet"/>
<style>
  :root{
    --bg:#0a0a0b;--surface:#111114;--surface2:#18181d;--border:#2a2a35;
    --accent:#e8ff47;--text:#e8e8f0;--muted:#6b6b80;
    --success:#4ade80;--error:#f87171;--radius:4px;
    --mono:'Space Mono',monospace;--sans:'MuseoModerno',sans-serif;
  }
  :root.light{
    --bg:#f4f3ef;--surface:#ffffff;--surface2:#eeede8;--border:#d4d2ca;
    --accent:#5c6bc0;--text:#1a1a2e;--muted:#8888a0;
    --success:#2e7d32;--error:#c62828;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--sans)}
  body::before{
    content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
    background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
    background-size:200px;opacity:.4;
  }
  #app{position:relative;z-index:1;display:grid;grid-template-columns:400px 1fr;min-height:100vh}

  /* Sidebar */
  #sidebar{background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow-y:auto;height:100vh;position:sticky;top:0}
  .sidebar-header{padding:24px 20px 16px;border-bottom:1px solid var(--border)}
  .logo{font-weight:800;font-size:22px;letter-spacing:-.5px}
  .logo span{color:var(--accent)}
  .logo-sub{font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:3px;letter-spacing:1px}
  .form-section{padding:16px 20px;border-bottom:1px solid var(--border)}
  .section-label{font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between}
  .section-label button{font-family:var(--mono);font-size:10px;color:var(--muted);background:none;border:1px solid var(--border);padding:2px 8px;border-radius:var(--radius);cursor:pointer;letter-spacing:.5px}
  .section-label button:hover{color:var(--accent);border-color:var(--accent)}
  label{display:block;font-size:12px;color:var(--muted);margin-bottom:4px;margin-top:10px;font-family:var(--mono)}
  label:first-child{margin-top:0}
  input[type=text],input[type=number],select,textarea{
    width:100%;background:var(--surface2);border:1px solid var(--border);
    color:var(--text);font-family:var(--mono);font-size:12px;
    padding:8px 10px;border-radius:var(--radius);outline:none;transition:border-color .15s;
  }
  input:focus,select:focus,textarea:focus{border-color:var(--accent)}
  textarea{resize:none;min-height:38px;line-height:1.6;overflow:hidden;transition:height .1s}
  select option{background:var(--surface2)}
  .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  input[type=range]{
    width:100%;-webkit-appearance:none;height:3px;
    background:var(--border);border-radius:2px;border:none;padding:0;margin-top:6px;
  }
  input[type=range]::-webkit-slider-thumb{
    -webkit-appearance:none;width:14px;height:14px;
    border-radius:50%;background:var(--accent);cursor:pointer;
  }

  /* File picker widget */
  .file-picker{position:relative}
  .file-picker-input{
    width:100%;background:var(--surface2);border:1px solid var(--border);
    color:var(--text);font-family:var(--mono);font-size:12px;
    padding:8px 36px 8px 10px;border-radius:var(--radius);outline:none;
    cursor:pointer;transition:border-color .15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  }
  .file-picker-input:focus,.file-picker-input.open{border-color:var(--accent)}
  .file-picker-arrow{
    position:absolute;right:10px;top:50%;transform:translateY(-50%);
    color:var(--muted);font-size:10px;pointer-events:none;
  }
  .file-picker-dropdown{
    display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:50;
    background:var(--surface2);border:1px solid var(--accent);border-radius:var(--radius);
    max-height:220px;overflow:hidden;flex-direction:column;
    box-shadow:0 8px 24px rgba(0,0,0,.6);
  }
  .file-picker-dropdown.open{display:flex}
  .file-picker-search{
    padding:8px 10px;border-bottom:1px solid var(--border);
    font-family:var(--mono);font-size:11px;background:var(--surface);
    color:var(--text);border-top:none;border-left:none;border-right:none;
    outline:none;width:100%;
  }
  .file-picker-list{overflow-y:auto;flex:1}
  .file-picker-item{
    padding:8px 12px;font-family:var(--mono);font-size:11px;cursor:pointer;
    color:var(--text);transition:background .1s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  }
  .file-picker-item:hover,.file-picker-item.selected{background:rgba(232,255,71,.08);color:var(--accent)}
  .file-picker-empty{padding:12px;font-family:var(--mono);font-size:11px;color:var(--muted);text-align:center}
  .file-picker-dir{
    padding:6px 12px;font-family:var(--mono);font-size:9px;color:var(--muted);
    border-bottom:1px solid var(--border);letter-spacing:.5px;
  }
  .file-picker-none{
    padding:8px 12px;font-family:var(--mono);font-size:11px;cursor:pointer;
    color:var(--muted);transition:background .1s;font-style:italic;
  }
  .file-picker-none:hover{background:rgba(255,255,255,.04)}

  /* Mode tabs */
  .tabs{display:flex;border-bottom:1px solid var(--border);margin-bottom:14px}
  .tab{font-family:var(--mono);font-size:11px;padding:7px 14px;cursor:pointer;color:var(--muted);border-bottom:2px solid transparent;transition:all .15s;letter-spacing:.5px}
  .tab.active{color:var(--accent);border-bottom-color:var(--accent)}
  .tab-panel{display:none}
  .tab-panel.active{display:block}

  /* Generate button */
  .gen-wrap{padding:16px 20px;margin-top:auto}
  #genBtn{
    width:100%;padding:14px;background:var(--accent);color:#0a0a0b;
    font-family:var(--sans);font-weight:800;font-size:15px;letter-spacing:.5px;
    border:none;border-radius:var(--radius);cursor:pointer;transition:opacity .15s,transform .1s;
  }
  #genBtn:hover:not(:disabled){opacity:.9;transform:translateY(-1px)}
  #genBtn:disabled{opacity:.4;cursor:not-allowed}
  #cancelBtn{
    display:none;width:100%;padding:10px;background:transparent;
    border:1px solid var(--error);color:var(--error);font-family:var(--mono);font-size:12px;
    border-radius:var(--radius);cursor:pointer;margin-top:8px;transition:background .15s;
  }
  #cancelBtn:hover{background:rgba(248,113,113,.1)}
  #cancelBtn.visible{display:block}

  /* Main area */
  #main{display:flex;flex-direction:column}
  #mainNav{display:flex;background:var(--surface);border-bottom:1px solid var(--border);padding:0 24px}
  .main-tab{font-family:var(--mono);font-size:11px;padding:12px 16px;cursor:pointer;color:var(--muted);border-bottom:2px solid transparent;transition:all .15s;letter-spacing:1px}
  .main-tab.active{color:var(--accent);border-bottom-color:var(--accent)}
  #viewer{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;min-height:400px}
  #imageBatch{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
  @keyframes fadeIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
  .placeholder{display:flex;flex-direction:column;align-items:center;gap:12px;color:var(--muted)}
  .placeholder-icon{font-size:48px;opacity:.3}
  .placeholder-text{font-family:var(--mono);font-size:12px;letter-spacing:1px}
  #progressWrap{display:none;flex-direction:column;align-items:center;gap:16px}
  #progressWrap.visible{display:flex}
  .spinner{width:48px;height:48px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .progress-label{font-family:var(--mono);font-size:11px;color:var(--muted)}
  #logPanel{background:var(--surface);border-top:1px solid var(--border);height:180px;overflow-y:auto;padding:12px 16px}
  .log-header{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-top:1px solid var(--border);background:var(--surface)}
  .log-title{font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:2px}
  .log-clear{font-family:var(--mono);font-size:10px;color:var(--muted);background:none;border:none;cursor:pointer}
  .log-clear:hover{color:var(--text)}
  .log-line{font-family:var(--mono);font-size:11px;line-height:1.6;color:var(--muted);white-space:pre-wrap;word-break:break-all}
  .log-line.accent{color:var(--accent)}
  .log-line.error{color:var(--error)}
  .log-line.success{color:var(--success)}
  #statusBar{font-family:var(--mono);font-size:10px;color:var(--muted);padding:6px 16px;border-top:1px solid var(--border);background:var(--surface);display:flex;align-items:center;gap:10px}
  .status-dot{width:6px;height:6px;border-radius:50%;background:var(--muted);flex-shrink:0}
  .status-dot.active{background:var(--accent);animation:pulse 1s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

  /* Gallery */
  #galleryPanel{padding:24px;overflow-y:auto}
  .gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
  .gallery-item{position:relative;border-radius:var(--radius);overflow:hidden;background:var(--surface2);border:1px solid var(--border);cursor:pointer;transition:border-color .15s;aspect-ratio:1}
  .gallery-item:hover{border-color:var(--accent)}
  .gallery-item img{width:100%;height:100%;object-fit:cover;display:block}
  .gallery-item .del{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.7);border:1px solid var(--border);color:var(--error);font-size:14px;width:24px;height:24px;border-radius:3px;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity .15s}
  .gallery-item:hover .del{opacity:1}

  /* Lightbox */
  #lightbox{display:none;position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.92);align-items:center;justify-content:center}
  #lightbox.open{display:flex}
  #lightbox img{max-width:95vw;max-height:95vh;border-radius:var(--radius)}
  #lightbox .close{position:absolute;top:16px;right:20px;font-size:28px;color:var(--muted);cursor:pointer}



  /* Auto-resize textarea */
  textarea.auto-resize{min-height:64px;overflow:hidden;resize:none}
  /* Neg prompt toggle row */
  .neg-label-row{display:flex;align-items:center;justify-content:space-between;margin-top:10px;margin-bottom:4px}
  .neg-toggle{
    font-family:var(--mono);font-size:10px;color:var(--muted);background:none;
    border:1px solid var(--border);padding:2px 8px;border-radius:var(--radius);
    cursor:pointer;letter-spacing:.5px;transition:all .15s;
  }
  .neg-toggle:hover{color:var(--accent);border-color:var(--accent)}
  .neg-toggle.hidden{color:var(--accent);border-color:var(--accent)}
  #negWrap{overflow:hidden;transition:max-height .25s ease,opacity .25s ease;max-height:0;opacity:0;pointer-events:none}
  #negWrap.open{max-height:400px;opacity:1;pointer-events:auto}
  /* Auto-resize textarea */
  textarea{resize:none;overflow:hidden;min-height:40px;line-height:1.6;transition:height .1s ease}

  /* Advanced settings toggle */
  .adv-toggle{
    display:flex;align-items:center;justify-content:space-between;
    cursor:pointer;user-select:none;padding:10px 0 6px;
  }
  .adv-toggle-label{font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:2px;text-transform:uppercase}
  .adv-toggle-label:hover{color:var(--accent)}
  .adv-arrow{font-size:10px;color:var(--muted);transition:transform .2s;display:inline-block}
  .adv-arrow.open{transform:rotate(180deg)}
  #advBody{overflow:hidden;transition:max-height .3s ease,opacity .2s ease;max-height:0;opacity:0}
  #advBody.open{max-height:800px;opacity:1}

  /* Ratio picker */
  .ratio-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:6px}
  .ratio-btn{
    background:var(--surface2);border:1px solid var(--border);color:var(--muted);
    font-family:var(--mono);font-size:11px;padding:7px 4px;border-radius:var(--radius);
    cursor:pointer;transition:all .15s;letter-spacing:.5px;
  }
  .ratio-btn:hover{border-color:var(--accent);color:var(--text)}
  .ratio-btn.active{background:rgba(232,255,71,.1);border-color:var(--accent);color:var(--accent)}
  .ratio-preview{font-family:var(--mono);font-size:10px;color:var(--muted);text-align:center;letter-spacing:1px;padding:3px 0 6px}

  /* Init image dropzone */
  .init-dropzone{
    border:2px dashed var(--border);border-radius:var(--radius);padding:16px;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:8px;cursor:pointer;transition:border-color .15s,background .15s;min-height:80px;
    font-family:var(--mono);font-size:11px;color:var(--muted);text-align:center;
  }
  .init-dropzone:hover,.init-dropzone.drag{border-color:var(--accent);background:rgba(232,255,71,.04)}
  .init-placeholder{display:flex;flex-direction:column;align-items:center;gap:6px}
  .init-placeholder img{width:32px;height:32px;opacity:.35;filter:invert(50%);transition:opacity .15s}
  .init-dropzone:hover .init-placeholder img,.init-dropzone.drag .init-placeholder img{opacity:.65}
  #sysBadge{font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:10px;line-height:1.8}

  /* Language selector */
  #langSelect{
    background:var(--surface2);border:1px solid var(--border);color:var(--muted);
    font-family:var(--mono);font-size:10px;padding:3px 6px;border-radius:var(--radius);
    cursor:pointer;outline:none;transition:all .15s;
  }
  #langSelect:hover,#langSelect:focus{border-color:var(--accent);color:var(--accent)}
  .header-controls{display:flex;align-items:center;gap:6px}

  /* Theme toggle */
  #themeBtn{
    background:none;border:1px solid var(--border);color:var(--muted);
    width:28px;height:28px;padding:5px;border-radius:var(--radius);
    cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center;flex-shrink:0;
  }
  #themeBtn:hover{border-color:var(--accent);color:var(--accent)}
  #themeBtn img{width:14px;height:14px;display:block;filter:invert(50%);transition:filter .15s}
  #themeBtn:hover img{filter:invert(85%) sepia(50%) saturate(300%) hue-rotate(20deg)}
  :root.light #themeBtn img{filter:invert(30%)}
  :root.light #themeBtn:hover img{filter:invert(25%) sepia(80%) saturate(400%) hue-rotate(210deg)}

  @media(max-width:700px){
    #app{grid-template-columns:1fr}
    #sidebar{height:auto;position:relative}
    .row2{grid-template-columns:1fr 1fr}
  }
</style>
</head>
<body>
<div id="app">
  <!-- ── Sidebar ── -->
  <aside id="sidebar">
    <div class="sidebar-header">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div class="logo">SD<span>.</span>cpp <span style="font-weight:400;font-size:16px;color:var(--muted)">Web UI</span></div>
        <div class="header-controls">
          <select id="langSelect" onchange="changeLang(this.value)"></select>
          <button id="themeBtn" onclick="toggleTheme()" title="Toggle theme"><img id="themeIcon" src="/icons/icon_dark.svg" alt="theme"/></button>
        </div>
      </div>
      <div class="logo-sub" data-i18n="logo_sub">LOCAL · STABLE · DIFFUSION</div>
    </div>

    <!-- Prompt -->
    <div class="form-section">
      <div class="section-label" data-i18n="section_prompt">Prompt</div>
      <textarea id="prompt" class="auto-resize" data-i18n-placeholder="prompt_placeholder" placeholder="1girl, blonde, highly detailed, 4k" oninput="autoResize(this)"></textarea>
      <div class="neg-label-row">
        <label style="margin:0" data-i18n="neg_label">Negative prompt</label>
        <button class="neg-toggle" id="negToggleBtn" onclick="toggleNeg()" data-i18n="neg_show" title="Show negative prompt">show</button>
      </div>
      <div id="negWrap">
        <textarea id="neg_prompt" class="auto-resize" data-i18n-placeholder="neg_placeholder" placeholder="blurry, bad anatomy, ugly" oninput="autoResize(this)"></textarea>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
        <label style="margin:0;flex-shrink:0" data-i18n="batch_label">Batch</label>
        <select id="batch_count" style="width:auto">
          <option value="1" selected>1</option>
          <option value="2">2</option>
          <option value="4">4</option>
          <option value="6">6</option>
          <option value="8">8</option>
        </select>
      </div>
    </div>

    <!-- Init image -->
    <div class="form-section">
      <div class="section-label"><span data-i18n="section_init">Init image</span> <span style="color:var(--muted);font-weight:400;font-size:10px;letter-spacing:0" data-i18n="init_optional">(-i, optional)</span></div>

      <div id="initDropZone" class="init-dropzone" onclick="document.getElementById('initFileInput').click()" ondragover="event.preventDefault();this.classList.add('drag')" ondragleave="this.classList.remove('drag')" ondrop="handleInitDrop(event)">
        <div class="init-placeholder" id="initPlaceholder">
          <img src="/icons/icon_ref.svg" alt="image"/>
          <span data-i18n="init_drop">Tap or drag image here</span>
        </div>
        <img id="initPreview" style="display:none;max-width:100%;max-height:140px;border-radius:3px;object-fit:contain"/>
        <input type="file" id="initFileInput" accept="image/*" style="display:none" onchange="handleInitFile(this.files[0])"/>
      </div>

      <div id="initMeta" style="display:none;margin-top:6px">
        <div style="font-family:var(--mono);font-size:10px;color:var(--muted);display:flex;justify-content:space-between;align-items:center">
          <span id="initFileName" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px"></span>
          <button onclick="clearInitImg()" style="background:none;border:none;color:var(--error);font-size:14px;cursor:pointer;flex-shrink:0;padding:0 4px">✕</button>
        </div>
        <label style="margin-top:8px"><span data-i18n="denoise_label">Denoising strength</span> — <span id="strength_val">0.75</span></label>
        <input type="range" id="strength" min="0.1" max="1" step="0.05" value="0.75"
               oninput="document.getElementById('strength_val').textContent=this.value"/>
      </div>
    </div>

    <!-- Model / VAE / LoRA pickers -->
    <div class="form-section">
      <div class="section-label">
        <span data-i18n="section_models">Models</span>
        <button onclick="refreshAll()" data-i18n="btn_refresh">↺ Refresh</button>
      </div>

      <label data-i18n="label_checkpoint">Checkpoint</label>
      <div class="file-picker" id="picker-model">
        <div class="file-picker-input" tabindex="0" data-i18n="picker_select_model">— select model —</div>
        <span class="file-picker-arrow">▾</span>
        <div class="file-picker-dropdown">
          <input class="file-picker-search" type="text" data-i18n-placeholder="picker_search" placeholder="Search…"/>
          <div class="file-picker-list"></div>
        </div>
      </div>

      <label>VAE <span style="color:var(--muted);font-size:10px" data-i18n="optional">(optional)</span></label>
      <div class="file-picker" id="picker-vae">
        <div class="file-picker-input" tabindex="0" data-i18n="picker_none">— none —</div>
        <span class="file-picker-arrow">▾</span>
        <div class="file-picker-dropdown">
          <input class="file-picker-search" type="text" data-i18n-placeholder="picker_search" placeholder="Search…"/>
          <div class="file-picker-list"></div>
        </div>
      </div>

      <label data-i18n="label_lora">LoRA dir</label>
      <div class="file-picker" id="picker-lora">
        <div class="file-picker-input" tabindex="0" data-i18n="picker_none">— none —</div>
        <span class="file-picker-arrow">▾</span>
        <div class="file-picker-dropdown">
          <input class="file-picker-search" type="text" data-i18n-placeholder="picker_search" placeholder="Search…"/>
          <div class="file-picker-list"></div>
        </div>
      </div>
    </div>

    <!-- Generation params -->
    <div class="form-section">
      <div class="section-label" data-i18n="section_params">Parameters</div>

      <label data-i18n="label_run_mode">Run mode</label>
      <select id="sd_mode">
        <option value="img_gen" selected data-i18n="mode_img_gen">img_gen — Image generation</option>
        <option value="vid_gen" data-i18n="mode_vid_gen">vid_gen — Video generation</option>
      </select>

      <label data-i18n="label_ratio">Aspect ratio</label>
      <div class="ratio-grid" id="ratioGrid">
        <button class="ratio-btn" data-w="1360" data-h="768"  onclick="setRatio(this)">16:9</button>
        <button class="ratio-btn" data-w="768"  data-h="1360" onclick="setRatio(this)">9:16</button>
        <button class="ratio-btn" data-w="832"  data-h="1248" onclick="setRatio(this)">2:3</button>
        <button class="ratio-btn" data-w="1248" data-h="832"  onclick="setRatio(this)">3:2</button>
        <button class="ratio-btn active" data-w="1024" data-h="1024" onclick="setRatio(this)">1:1</button>
        <button class="ratio-btn" data-w="custom" onclick="setRatio(this)" data-i18n="ratio_custom">Custom</button>
      </div>
      <div class="ratio-preview" id="ratioPreview">1024 × 1024</div>
      <div class="row2" id="customWH" style="display:none;margin-top:8px">
        <div>
          <label data-i18n="label_width">Width</label>
          <input type="number" id="width" value="1024" min="64" max="2048" step="64" oninput="onCustomWHChange()"/>
        </div>
        <div>
          <label data-i18n="label_height">Height</label>
          <input type="number" id="height" value="1024" min="64" max="2048" step="64" oninput="onCustomWHChange()"/>
        </div>
      </div>

      <!-- Advanced Settings toggle -->
      <div class="adv-toggle" onclick="toggleAdv()">
        <span class="adv-toggle-label" data-i18n="adv_settings">Advanced Settings</span>
        <span class="adv-arrow" id="advArrow">▼</span>
      </div>
      <div id="advBody">
        <label><span data-i18n="label_steps">Steps</span> — <span id="steps_val">20</span></label>
        <input type="range" id="steps" min="1" max="50" value="20"
               oninput="document.getElementById('steps_val').textContent=this.value"/>

        <label><span data-i18n="label_cfg">CFG Scale</span> — <span id="cfg_val">7</span></label>
        <input type="range" id="cfg_scale" min="1" max="20" step="0.5" value="7"
               oninput="document.getElementById('cfg_val').textContent=this.value"/>

        <div class="row2" style="margin-top:10px">
          <div>
            <label data-i18n="label_sampler">Sampler</label>
            <select id="sampler">
              <option value="euler">euler</option>
              <option value="euler_a" selected>euler_a</option>
              <option value="heun">heun</option>
              <option value="dpm2">dpm2</option>
              <option value="dpm++2s_a">dpm++2s_a</option>
              <option value="dpm++2m">dpm++2m</option>
              <option value="dpm++2mv2">dpm++2mv2</option>
              <option value="ipndm">ipndm</option>
              <option value="ipndm_v">ipndm_v</option>
              <option value="lcm">lcm</option>
              <option value="ddim_trailing">ddim_trailing</option>
              <option value="tcd">tcd</option>
              <option value="res_multistep">res_multistep</option>
              <option value="res_2s">res_2s</option>
            </select>
          </div>
          <div>
            <label data-i18n="label_scheduler">Scheduler</label>
            <select id="scheduler">
              <option value="discrete">discrete</option>
              <option value="karras" selected>karras</option>
              <option value="exponential">exponential</option>
              <option value="ays">ays</option>
              <option value="gits">gits</option>
              <option value="smoothstep">smoothstep</option>
              <option value="sgm_uniform">sgm_uniform</option>
              <option value="simple">simple</option>
              <option value="kl_optimal">kl_optimal</option>
              <option value="lcm">lcm</option>
              <option value="bong_tangent">bong_tangent</option>
            </select>
          </div>
        </div>

        <div class="row2" style="margin-top:10px">
          <div>
            <label data-i18n="label_clip_skip">Clip skip</label>
            <input type="number" id="clip_skip" value="1" min="-1" max="12"/>
          </div>
          <div>
            <label data-i18n="label_seed">Seed</label>
            <input type="number" id="seed" value="-1"/>
          </div>
        </div>
      </div>
    </div>

    <div class="gen-wrap">
      <button id="genBtn" onclick="generate()" data-i18n="btn_generate">▶ GENERATE</button>
      <button id="cancelBtn" onclick="cancelGen()" data-i18n="btn_cancel">✕ CANCEL</button>
      <div id="sysBadge"></div>
    </div>
  </aside>

  <!-- ── Main ── -->
  <main id="main">
    <nav id="mainNav">
      <div class="main-tab active" data-main="output" data-i18n="tab_output">Output</div>
      <div class="main-tab" data-main="gallery" data-i18n="tab_gallery">Gallery</div>
    </nav>

    <div id="outputPanel" style="flex:1;display:flex;flex-direction:column">
      <div id="viewer">
        <div id="placeholder" class="placeholder">
          <div class="placeholder-icon">🎨</div>
          <div class="placeholder-text" data-i18n="placeholder_hint">SELECT MODEL · WRITE PROMPT · GENERATE</div>
        </div>
        <div id="progressWrap">
          <div class="spinner"></div>
          <div class="progress-label" id="progressLabel" data-i18n="generating">Generating…</div>
        </div>
        <div id="imageBatch"></div>
      </div>
      <div class="log-header">
        <div class="log-title" data-i18n="console_title">CONSOLE OUTPUT</div>
        <button class="log-clear" onclick="clearLog()" data-i18n="btn_clear">CLEAR</button>
      </div>
      <div id="logPanel"></div>
      <div id="statusBar">
        <div class="status-dot" id="statusDot"></div>
        <span id="statusText" data-i18n="status_ready">Ready</span>
      </div>
    </div>

    <div id="galleryPanel" style="display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div style="font-family:var(--mono);font-size:12px;color:var(--muted)" data-i18n="gallery_title">RECENT IMAGES</div>
        <button onclick="loadGallery()" data-i18n="btn_gallery_refresh" style="font-family:var(--mono);font-size:11px;background:none;border:1px solid var(--border);color:var(--muted);padding:5px 12px;border-radius:var(--radius);cursor:pointer">↺ REFRESH</button>
      </div>
      <div class="gallery-grid" id="galleryGrid"></div>
    </div>
  </main>
</div>

<div id="lightbox" onclick="closeLightbox()">
  <span class="close">✕</span>
  <img id="lightboxImg" src="" alt=""/>
</div>

<script>
// ── File Picker ───────────────────────────────────────────────────────────────
// Each picker stores: { el, value, dir, files }
const pickers = {};

function initPicker(id, { nullable = true } = {}) {
  const root     = document.getElementById('picker-' + id);
  const display  = root.querySelector('.file-picker-input');
  const dropdown = root.querySelector('.file-picker-dropdown');
  const search   = root.querySelector('.file-picker-search');
  const list     = root.querySelector('.file-picker-list');

  pickers[id] = { value: null, dir: '', files: [] };

  function open() {
    dropdown.classList.add('open');
    display.classList.add('open');
    search.value = '';
    renderList('');
    search.focus();
  }
  function close() {
    dropdown.classList.remove('open');
    display.classList.remove('open');
  }
  function toggle() { dropdown.classList.contains('open') ? close() : open(); }

  function renderList(q) {
    const files = pickers[id].files;
    const dir   = pickers[id].dir;
    const fil   = q ? files.filter(f => f.toLowerCase().includes(q.toLowerCase())) : files;
    list.innerHTML = '';

    if (dir) {
      const dirEl = document.createElement('div');
      dirEl.className = 'file-picker-dir';
      dirEl.textContent = '📁 ' + dir;
      list.appendChild(dirEl);
    }

    if (nullable) {
      const none = document.createElement('div');
      none.className = 'file-picker-none';
      none.textContent = t('picker_none') || '— none —';
      none.onclick = () => { select(null); close(); };
      list.appendChild(none);
    }

    if (!fil.length) {
      const emp = document.createElement('div');
      emp.className = 'file-picker-empty';
      emp.textContent = files.length ? t('picker_no_match') : t('picker_no_files');
      list.appendChild(emp);
      return;
    }

    fil.forEach(f => {
      const item = document.createElement('div');
      item.className = 'file-picker-item' + (pickers[id].value === f ? ' selected' : '');
      item.textContent = f;
      item.title = f;
      item.onclick = () => { select(f); close(); };
      list.appendChild(item);
    });
  }

  function select(filename) {
    pickers[id].value = filename;
    display.textContent = filename || '— none —';
  }

  display.addEventListener('click', toggle);
  display.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') toggle(); });
  search.addEventListener('input', () => renderList(search.value));
  search.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!root.contains(e.target)) close();
  }, true);

  return {
    load(dir, files) {
      pickers[id].dir   = dir;
      pickers[id].files = files;
      if (pickers[id].value && !files.includes(pickers[id].value)) {
        select(null); // reset if previously selected file no longer exists
      }
    },
    // Pre-select a filename if it exists in the loaded list
    setDefault(filename) {
      if (filename && pickers[id].files.includes(filename)) {
        select(filename);
      }
    },
    getValue() { return pickers[id].value; }
  };
}

// Init pickers
const modelPicker = initPicker('model', { nullable: false });
const vaePicker   = initPicker('vae');
const loraPicker  = initPicker('lora');

// ── Load file lists ───────────────────────────────────────────────────────────
let _firstLoad = true;
async function refreshAll() {
  try {
    const data = await (await fetch('/list/all')).json();
    modelPicker.load(data.models.dir, data.models.files);
    vaePicker.load(data.vaes.dir,     data.vaes.files);
    loraPicker.load(data.loras.dir,   data.loras.files);

    // Apply defaults only on first page load, not on manual refresh
    if (_firstLoad && data.defaults) {
      const d = data.defaults;
      if (d.model) modelPicker.setDefault(d.model);
      if (d.vae)   vaePicker.setDefault(d.vae);
      if (d.lora)  loraPicker.setDefault(d.lora);

      // Apply param defaults to form controls
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      set('steps',      d.steps);     document.getElementById('steps_val').textContent  = d.steps;
      set('cfg_scale',  d.cfg_scale); document.getElementById('cfg_val').textContent    = d.cfg_scale;
      set('width',      d.width);
      set('height',     d.height);
      set('seed',       d.seed);
      set('sampler',    d.sampler);
      set('scheduler',  d.scheduler);
      set('clip_skip',  d.clip_skip);
      set('batch_count', d.batch);
      if (d.neg_prompt) { set('neg_prompt', d.neg_prompt); set('neg_prompt_i2i', d.neg_prompt); }
      if (d.sd_mode)   set('sd_mode', d.sd_mode);
      // Sync ratio buttons with default w/h
      if (d.width && d.height) {
        const match = document.querySelector('.ratio-btn[data-w="'+d.width+'"][data-h="'+d.height+'"]');
        if (match) { setRatio(match); }
        else {
          set('width', d.width); set('height', d.height);
          const custom = document.querySelector('.ratio-btn[data-w="custom"]');
          if (custom) setRatio(custom);
        }
      }
      // Load lang list once, before marking firstLoad done
      if (data.language) loadLangList(data.language);
      _firstLoad = false;
    } else {
      setStatus(t('js_files_status', {models:data.models.files.length, vaes:data.vaes.files.length, loras:data.loras.files.length}), false);
    }
  } catch(e) { setStatus(t('js_lists_error') + ': ' + e.message, false); }
}

// ── SSE ───────────────────────────────────────────────────────────────────────
let evtSource;

function connect() {
  evtSource = new EventSource('/events');
  evtSource.onmessage = e => handleEvent(JSON.parse(e.data));
  evtSource.onerror   = () => { setStatus(t('status_reconnect'), false); setTimeout(connect, 3000); };
}

function handleEvent(d) {
  switch(d.type) {
    case 'init':  if(d.isGenerating) setGenerating(true); if(d.log) d.log.forEach(l=>appendLog(l)); if(d.lastImage) showImages(d.lastImage); break;
    case 'start': setGenerating(true); appendLog('▶ ' + d.args, 'accent'); break;
    case 'log':   appendLog(d.line); parseProgress(d.line); break;
    case 'done':  setGenerating(false); showImages(d.images); appendLog('✓ ' + t('status_done'), 'success'); setStatus(t('status_done'), false); break;
    case 'error': setGenerating(false); appendLog('✗ ' + d.message, 'error'); setStatus('Error: ' + d.message, false); break;
  }
}

// ── Negative prompt toggle ────────────────────────────────────────────────────
let negVisible = false;
function toggleNeg() {
  negVisible = !negVisible;
  document.getElementById('negWrap').classList.toggle('open', negVisible);
  const btn = document.getElementById('negToggleBtn');
  btn.textContent = negVisible ? t('neg_hide') : t('neg_show');
  btn.classList.toggle('hidden', !negVisible);
}

// ── Auto-resize textareas ─────────────────────────────────────────────────────
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
// Run on all auto-resize textareas at init
function initAutoResize() {
  document.querySelectorAll('textarea.auto-resize').forEach(autoResize);
}

// ── Advanced Settings toggle ───────────────────────────────────────────────────
function toggleAdv() {
  const body  = document.getElementById('advBody');
  const arrow = document.getElementById('advArrow');
  const open  = body.classList.toggle('open');
  arrow.classList.toggle('open', open);
}

// ── Ratio picker ─────────────────────────────────────────────────────────────
function setRatio(btn) {
  document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const w = btn.dataset.w, h = btn.dataset.h;
  const customWH = document.getElementById('customWH');
  if (w === 'custom') {
    customWH.style.display = '';
    const cw = +document.getElementById('width').value || 512;
    const ch = +document.getElementById('height').value || 512;
    document.getElementById('ratioPreview').textContent = cw + ' × ' + ch;
  } else {
    customWH.style.display = 'none';
    document.getElementById('width').value  = w;
    document.getElementById('height').value = h;
    document.getElementById('ratioPreview').textContent = w + ' × ' + h;
  }
}

// Update preview when custom inputs change
function onCustomWHChange() {
  const w = document.getElementById('width').value;
  const h = document.getElementById('height').value;
  document.getElementById('ratioPreview').textContent = w + ' × ' + h;
}

// ── Init image state ──────────────────────────────────────────────────────────
let initImgServerPath = null;  // path on server after upload

async function handleInitFile(file) {
  if (!file) return;
  // Show local preview immediately
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('initPreview').src = e.target.result;
    document.getElementById('initPreview').style.display = 'block';
    document.getElementById('initPlaceholder').style.display = 'none';
    document.getElementById('initFileName').textContent = file.name;
    document.getElementById('initMeta').style.display = 'block';
  };
  reader.readAsDataURL(file);
  // Upload to server
  const fd = new FormData();
  fd.append('init_img', file);
  setStatus('Uploading init image…', true);
  try {
    const r = await fetch('/upload-init', { method: 'POST', body: fd });
    const j = await r.json();
    if (j.ok) { initImgServerPath = j.path; setStatus('Init image ready: ' + j.name, false); }
    else { setStatus('Upload failed: ' + j.error, false); clearInitImg(); }
  } catch(e) { setStatus('Upload error: ' + e.message, false); clearInitImg(); }
}

function handleInitDrop(e) {
  e.preventDefault();
  document.getElementById('initDropZone').classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleInitFile(file);
}

function clearInitImg() {
  initImgServerPath = null;
  document.getElementById('initPreview').style.display = 'none';
  document.getElementById('initPreview').src = '';
  document.getElementById('initPlaceholder').style.display = 'flex';
  document.getElementById('initMeta').style.display = 'none';
  document.getElementById('initFileName').textContent = '';
  document.getElementById('initFileInput').value = '';
}

// ── Generate ──────────────────────────────────────────────────────────────────
async function generate() {
  const model = modelPicker.getValue();
  if (!model) { setStatus(t('js_no_model'), false); appendLog('✗ ' + t('js_no_model_err'), 'error'); return; }

  const body = {
    model,
    vae:  vaePicker.getValue()  || undefined,
    lora: loraPicker.getValue() || undefined,
    prompt:          v('prompt'),
    negative_prompt: v('neg_prompt'),
    steps:      +v('steps'),
    cfg_scale:  +v('cfg_scale'),
    width:      +v('width'),
    height:     +v('height'),
    seed:       +v('seed'),
    sampler:    v('sampler'),
    scheduler:  v('scheduler'),
    batch_count: +v('batch_count'),
    clip_skip:  +v('clip_skip'),
    sd_mode:    v('sd_mode'),
    init_img:   initImgServerPath || undefined,
    strength:   +v('strength'),
  };

  try {
    const r = await fetch('/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const j = await r.json();
    if (j.error) { appendLog('✗ ' + j.error, 'error'); setStatus(j.error, false); }
  } catch(e) { appendLog('✗ ' + e.message, 'error'); }
}

async function cancelGen() { await fetch('/cancel', { method: 'POST' }); }

function v(id) { return document.getElementById(id)?.value || ''; }

function setGenerating(on) {
  document.getElementById('genBtn').disabled = on;
  document.getElementById('cancelBtn').classList.toggle('visible', on);
  document.getElementById('progressWrap').classList.toggle('visible', on);
  document.getElementById('placeholder').style.display = on ? 'none' : '';
  document.getElementById('statusDot').classList.toggle('active', on);
  if (on) { document.getElementById('imageBatch').innerHTML = ''; setStatus(t('status_generating'), true); }
}

function showImages(urls) {
  const batch = document.getElementById('imageBatch');
  batch.innerHTML = '';
  document.getElementById('placeholder').style.display = 'none';
  document.getElementById('progressWrap').classList.remove('visible');
  urls.forEach(url => {
    const img = document.createElement('img');
    img.src = url + '?t=' + Date.now();
    img.style.cssText = 'max-width:100%;max-height:65vh;border-radius:4px;cursor:zoom-in;box-shadow:0 8px 40px rgba(0,0,0,.6);animation:fadeIn .3s ease';
    img.onclick = () => openLightbox(img.src);
    batch.appendChild(img);
  });
}

function appendLog(line, cls='') {
  const panel = document.getElementById('logPanel');
  const div = document.createElement('div');
  div.className = 'log-line' + (cls ? ' '+cls : '');
  div.textContent = line.trimEnd();
  panel.appendChild(div);
  panel.scrollTop = panel.scrollHeight;
}

function clearLog() { document.getElementById('logPanel').innerHTML = ''; }

function setStatus(msg, active) {
  document.getElementById('statusText').textContent = msg;
  document.getElementById('statusDot').classList.toggle('active', active);
}

function parseProgress(line) {
  const m = line.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
  if (m) {
    setStatus(t('js_step_progress',{cur:m[1],total:m[2],pct:Math.round(m[1]/m[2]*100)}), true);
    document.getElementById('progressLabel').textContent = t('js_step_progress',{cur:m[1],total:m[2],pct:Math.round(m[1]/m[2]*100)});
  }
}

function openLightbox(src)  { document.getElementById('lightboxImg').src=src; document.getElementById('lightbox').classList.add('open'); }
function closeLightbox()    { document.getElementById('lightbox').classList.remove('open'); }
document.addEventListener('keydown', e => { if(e.key==='Escape') closeLightbox(); });

// Main tabs
document.querySelectorAll('.main-tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.main-tab').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  const target = t.dataset.main;
  document.getElementById('outputPanel').style.display = target==='output' ? 'flex' : 'none';
  document.getElementById('galleryPanel').style.display = target==='gallery' ? 'block' : 'none';
  if (target==='gallery') loadGallery();
}));

// Gallery
async function loadGallery() {
  const grid = document.getElementById('galleryGrid');
  grid.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--muted)">' + t('gallery_loading') + '</div>';
  const imgs = await (await fetch('/images')).json();
  if (!imgs.length) { grid.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--muted)">' + t('gallery_empty') + '</div>'; return; }
  grid.innerHTML = '';
  imgs.forEach(img => {
    const div = document.createElement('div');
    div.className = 'gallery-item';
    div.innerHTML = '<img src="'+img.url+'" loading="lazy"/><div class="del" onclick="event.stopPropagation();deleteImg(\\''+img.name+'\\',this.parentElement)">✕</div>';
    div.querySelector('img').onclick = () => openLightbox(img.url);
    grid.appendChild(div);
  });
}

async function deleteImg(name, el) {
  if (!confirm(t('js_delete_confirm', {name}))) return;
  await fetch('/images/'+encodeURIComponent(name), { method:'DELETE' });
  el.remove();
}

// Sysinfo
async function loadSysInfo() {
  try {
    const d = await (await fetch('/sysinfo')).json();
    const mb = n => (n/1024/1024).toFixed(0)+'MB';
    document.getElementById('sysBadge').textContent = d.platform+'/'+d.arch+' · '+d.cpus+' CPU · '+mb(d.freemem)+'/'+mb(d.totalmem)+' free';
  } catch(e) {}
}

// Init
// ── Internationalisation ──────────────────────────────────────────────────────
let S = {}; // current strings

function t(key, vars) {
  let str = S[key] || key;
  if (vars) Object.keys(vars).forEach(k => { str = str.replace('{'+k+'}', vars[k]); });
  return str;
}

function applyLang(strings) {
  S = strings;
  // Text content
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (strings[key] !== undefined) el.textContent = strings[key];
  });
  // Placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (strings[key] !== undefined) el.placeholder = strings[key];
  });
  // Picker "— none —" labels that are already selected (display text)
  document.querySelectorAll('.file-picker-input[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    // Only update if still showing the default placeholder text (not a selected file)
    if (el.textContent.startsWith('—')) el.textContent = strings[key] || el.textContent;
  });
  // Theme icon stays in sync (no text needed)
  // Neg toggle
  const negBtn = document.getElementById('negToggleBtn');
  if (negBtn) negBtn.textContent = negVisible ? t('neg_hide') : t('neg_show');
}

async function changeLang(code) {
  try {
    const strings = await (await fetch('/lang/' + code)).json();
    applyLang(strings);
    try { localStorage.setItem('sd_lang', code); } catch(e) {}
  } catch(e) { console.error('Could not load language:', code, e); }
}

async function loadLangList(defaultLang) {
  try {
    const langs = await (await fetch('/lang/list')).json();
    const sel = document.getElementById('langSelect');
    sel.innerHTML = '';
    langs.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = l.label;
      if (l.code === defaultLang) opt.selected = true;
      sel.appendChild(opt);
    });
    // Load saved or default lang
    let activeLang = defaultLang;
    try { const saved = localStorage.getItem('sd_lang'); if (saved) { activeLang = saved; sel.value = saved; } } catch(e) {}
    await changeLang(activeLang);
  } catch(e) { console.error('Could not load language list', e); }
}

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(mode) {
  const isLight = mode === 'light';
  document.documentElement.classList.toggle('light', isLight);
  const icon = document.getElementById('themeIcon');
  if (icon) icon.src = isLight ? '/icons/icon_light.svg' : '/icons/icon_dark.svg';
  try { localStorage.setItem('sd_theme', mode); } catch(e) {}
}
function toggleTheme() {
  const isLight = document.documentElement.classList.contains('light');
  applyTheme(isLight ? 'dark' : 'light');
}
// Restore saved theme on load
(function() {
  try {
    const saved = localStorage.getItem('sd_theme');
    if (saved) applyTheme(saved);
  } catch(e) {}
})();

connect();
refreshAll();
loadSysInfo();
initAutoResize();
</script>
</body>
</html>`;

app.get("/", (req, res) => res.send(HTML));

// ─── State ────────────────────────────────────────────────────────────────────
let currentProcess = null;
let generationLog  = [];
let isGenerating   = false;
let lastImage      = null;
const clients      = [];

function broadcast(data) {
  clients.forEach(r => r.write("data: " + JSON.stringify(data) + "\n\n"));
}

// ─── SSE ─────────────────────────────────────────────────────────────────────
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  clients.push(res);
  res.write("data: " + JSON.stringify({ type:"init", isGenerating, log:generationLog, lastImage }) + "\n\n");
  req.on("close", () => { const i = clients.indexOf(res); if (i !== -1) clients.splice(i, 1); });
});

// ─── Generate ─────────────────────────────────────────────────────────────────
app.post("/generate", (req, res) => {
  if (isGenerating) return res.status(409).json({ error: "Already generating" });

  const {
    model, prompt, negative_prompt = "",
    steps = 20, cfg_scale = 7, width = 512, height = 512,
    seed = -1, sampler = "euler_a", scheduler = "karras",
    batch_count = 1, clip_skip = 1, vae, lora,
    init_img = "", strength = 0.75,
    sd_mode = "img_gen",
  } = req.body;

  if (!model)  return res.status(400).json({ error: "No model selected" });
  if (!prompt) return res.status(400).json({ error: "Prompt is empty" });

  // Resolve full paths from just the filename
  const modelPath = path.join(MODELS_DIR, model);
  const vaePath   = vae  ? path.join(VAES_DIR,  vae)  : null;
  const loraPath  = lora ? path.join(LORAS_DIR, lora) : null;

  if (!fs.existsSync(modelPath))
    return res.status(400).json({ error: "Model file not found: " + modelPath });

  const ts      = Math.floor(Date.now() / 1000);
  const outFile = path.join(OUTPUT_DIR, "SD_img_" + ts + ".png");

  const args = [
    "-m", modelPath,
    "-p", prompt,
    "--steps",           String(steps),
    "--cfg-scale",       String(cfg_scale),
    "-W",                String(width),
    "-H",                String(height),
    "--seed",            String(seed),
    "--sampling-method", sampler,
    "--scheduler",       scheduler,
    "--clip-skip",       String(clip_skip),
    "-b",                String(batch_count),
    "-o",                outFile,
    "--mode",            sd_mode,
  ];

  if (negative_prompt.trim()) args.push("-n", negative_prompt);
  if (vaePath && fs.existsSync(vaePath))   args.push("--vae", vaePath);
  if (loraPath && fs.existsSync(loraPath)) args.push("--lora-model-dir", loraPath);
  if (init_img && fs.existsSync(init_img)) args.push("-i", init_img, "--strength", String(strength));

  generationLog = [];
  isGenerating  = true;
  lastImage     = null;
  broadcast({ type: "start", args: [SD_BINARY, ...args].join(" ") });

  console.log("▶", SD_BINARY, args.join(" "));
  currentProcess = spawn(SD_BINARY, args);

  const onData = chunk => {
    const line = chunk.toString();
    generationLog.push(line);
    broadcast({ type: "log", line });
  };
  currentProcess.stdout.on("data", onData);
  currentProcess.stderr.on("data", onData);

  currentProcess.on("close", code => {
    isGenerating = false; currentProcess = null;
    if (code === 0) {
      const images = [];
      for (let i = 0; i < batch_count; i++) {
        const f = outFile.replace(".png", "_" + i + ".png");
        if (fs.existsSync(f)) images.push("/outputs/" + path.basename(f));
      }
      if (!images.length && fs.existsSync(outFile)) images.push("/outputs/" + path.basename(outFile));
      if (images.length) { lastImage = images; broadcast({ type:"done", images, code }); }
      else broadcast({ type:"error", message:"Image not found after generation." });
    } else {
      broadcast({ type:"error", message:"sd-cli exited with code " + code, code });
    }
  });

  currentProcess.on("error", err => {
    isGenerating = false; currentProcess = null;
    broadcast({ type:"error", message:"Failed to start sd-cli: " + err.message });
  });

  res.json({ ok: true, output: outFile });
});

// ─── Cancel ───────────────────────────────────────────────────────────────────
app.post("/cancel", (req, res) => {
  if (currentProcess) { currentProcess.kill("SIGTERM"); res.json({ ok: true }); }
  else res.status(400).json({ error: "Nothing running" });
});

// ─── Output images ────────────────────────────────────────────────────────────
app.get("/images", (req, res) => {
  try {
    const files = fs.readdirSync(OUTPUT_DIR)
      .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .sort().reverse().slice(0, 60)
      .map(f => ({ name: f, url: "/outputs/" + f }));
    res.json(files);
  } catch { res.json([]); }
});

app.delete("/images/:name", (req, res) => {
  const file = path.join(OUTPUT_DIR, req.params.name);
  if (fs.existsSync(file)) { fs.unlinkSync(file); res.json({ ok: true }); }
  else res.status(404).json({ error: "Not found" });
});

// ─── Sysinfo ──────────────────────────────────────────────────────────────────
app.get("/sysinfo", (_, res) => res.json({
  platform: os.platform(), arch: os.arch(),
  freemem: os.freemem(), totalmem: os.totalmem(), cpus: os.cpus().length,
}));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log("\n🎨  SD.cpp Web UI  →  http://localhost:" + PORT + "\n");
  console.log("Directories:");
  console.log("  Checkpoints : " + MODELS_DIR);
  console.log("  VAEs        : " + VAES_DIR);
  console.log("  LoRAs       : " + LORAS_DIR);
  console.log("  Output      : " + OUTPUT_DIR);
  console.log("\nOverride with env vars: CKPT_DIR, VAES_DIR, LORAS_DIR, OUTPUT_DIR, SD_BINARY\n");
});
