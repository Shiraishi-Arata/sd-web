# SD.cpp Web UI

A lightweight, single-file local web interface for [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) (`sd-cli`) — runs entirely on-device with no cloud dependency.

![Platform](https://img.shields.io/badge/platform-Android%20%7C%20Linux%20%7C%20Windows-informational?style=flat-square)
![Dark mode](https://img.shields.io/badge/theme-dark%20%2F%20light-black?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-≥18-339933?style=flat-square&logo=node.js)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

---

## Screenshots

![Dark mode](screenshots/dark.png)
![Light mode](screenshots/light.png)

---

## Features

- **txt2img & image reference** — supports drag-and-drop or tap-to-upload image reference with adjustable denoising strength
- **Real-time console** — streams `sd-cli` stdout/stderr via SSE; step progress parsed live
- **Gallery** — browse, view (lightbox), and delete generated images
- **Aspect ratio picker** — one-tap presets: 16:9, 9:16, 2:3, 3:2, 1:1, or Custom W×H
- **Searchable file pickers** — for checkpoint, VAE, and LoRA directory; live refresh without page reload
- **Dark / Light theme** — SVG icon toggle, preference saved to `localStorage`
- **Multi-language UI** — drop a JSON file in `lang/` to add a language; no code changes needed
- **Settings file** — all paths and defaults live in `settings.json`, never touch `server.js`
- **System info badge** — shows platform, arch, CPU, and RAM

---

## Project Structure

```
sd-web/
├── server.js          # Express server + embedded single-file UI
├── settings.json      # Directory paths, generation defaults, language
├── package.json
├── icons/
│   ├── icon_dark.svg      # Dark mode toggle icon
│   ├── icon_light.svg     # Light mode toggle icon
│   └── icon_ref.svg       # image reference dropzone icon
├── lang/
│   ├── en.json        # English
│   ├── id.json        # Indonesia
│   └── ja.json        # 日本語
└── screenshots/
    ├──dark_mode.png     # Dark mode screenshot 
    └──white_mode.png    # White mode screenshot 
```

---

## Requirements

| | Android (Termux) | Linux | Windows |
|---|---|---|---|
| Runtime | Node.js ≥ 18 via `pkg` | Node.js ≥ 18 | Node.js ≥ 18 |
| SD binary | `sd-cli` on `$PATH` | `sd-cli` on `$PATH` | `sd-cli.exe` on `%PATH%` |
| Package manager | npm (included with Node) | npm (included with Node) | npm (included with Node) |

---

## Installation

### 🤖 Android — Termux

> Recommended: install Termux from [F-Droid](https://f-droid.org/packages/com.termux/) or [GitHub](https://github.com/termux/termux-app/releases), not the Play Store.

```bash
# 1. Update packages and install Node.js
pkg update && pkg upgrade
pkg install nodejs git

# 2. Clone the project
git clone https://github.com/Shiraishi-Arata/sd-web.git ~/sd-web
cd ~/sd-web

# 3. Install dependencies
npm install

# 4. Edit settings.json
nano settings.json
# → set your model paths under /sdcard/Download/...

# 5. Run the server
node server.js

# 6. Open in your mobile browser
# → http://localhost:3000
```

> **Tip:** To keep it running after closing Termux, use `nohup node server.js &` or run inside a `tmux` session.

---

### 🐧 Linux

#### Ubuntu / Debian

```bash
# 1. Install Node.js (via NodeSource for latest LTS)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs git

# 2. Clone the project
git clone https://github.com/Shiraishi-Arata/sd-web.git ~/sd-web
cd ~/sd-web

# 3. Install dependencies
npm install

# 4. Edit settings.json
nano settings.json

# 5. Run the server
node server.js
# → http://localhost:3000
```

#### Arch Linux / Manjaro

```bash
# 1. Install Node.js and git
sudo pacman -S nodejs npm git

# 2. Clone and install
git clone https://github.com/Shiraishi-Arata/sd-web.git ~/sd-web
cd ~/sd-web
npm install

# 3. Edit settings.json
nano settings.json

# 4. Run
node server.js
# → http://localhost:3000
```

#### Fedora / RHEL / CentOS

```bash
# 1. Install Node.js
sudo dnf install nodejs git

# 2. Clone and install
git clone https://github.com/Shiraishi-Arata/sd-web.git ~/sd-web
cd ~/sd-web
npm install

# 3. Edit settings.json
nano settings.json

# 4. Run
node server.js
# → http://localhost:3000
```

> **Run as a service (optional):** Create a systemd unit at `/etc/systemd/system/sd-web.service`:
> ```ini
> [Unit]
> Description=SD.cpp Web UI
> After=network.target
>
> [Service]
> ExecStart=/usr/bin/node /home/yourname/sd-web/server.js
> WorkingDirectory=/home/yourname/sd-web
> Restart=on-failure
> User=yourname
>
> [Install]
> WantedBy=multi-user.target
> ```
> Then enable it: `sudo systemctl enable --now sd-web`

---

### 🪟 Windows

#### Option A — winget (Windows 10 / 11)

```powershell
# 1. Install Node.js
winget install OpenJS.NodeJS.LTS

# Restart your terminal after install, then:

# 2. Clone the project
git clone https://github.com/Shiraishi-Arata/sd-web.git %USERPROFILE%\sd-web
cd %USERPROFILE%\sd-web

# 3. Install dependencies
npm install

# 4. Edit settings.json
notepad settings.json

# 5. Run the server
node server.js
# → http://localhost:3000
```

#### Option B — manual installer

1. Download Node.js LTS from [nodejs.org](https://nodejs.org) and run the installer
   - Make sure **"Add to PATH"** is checked during setup
2. Open **Command Prompt** or **PowerShell** and continue:

```powershell
git clone https://github.com/Shiraishi-Arata/sd-web.git %USERPROFILE%\sd-web
cd %USERPROFILE%\sd-web
npm install
notepad settings.json
node server.js
```

> **Run at startup (optional):** Create a `start.bat` file and add a shortcut to your Startup folder (`Win + R` → `shell:startup`):
> ```bat
> @echo off
> cd /d %USERPROFILE%\sd-web
> node server.js
> ```

---

## Configuration

Edit **`settings.json`** — restart the server after saving.

```json
{
  "language": "en",

  "directories": {
    "checkpoints": "/path/to/models/checkpoints",
    "loras":       "/path/to/models/loras",
    "vaes":        "/path/to/models/vaes",
    "output":      "/path/to/output",
    "binary":      "sd-cli"
  },

  "defaults": {
    "model":      "waiIllustriousSDXL_v160.safetensors",
    "vae":        "fixFP16ErrorsSDXLLowerMemoryUse_v10.safetensors",
    "lora":       "",
    "prompt":     "",
    "neg_prompt": "worst quality, bad quality, low quality, lowres, anatomical nonsense, artistic error, bad anatomy, interlocked fingers, extra fingers, text, artist name, signature, bad feet, extra toes, ugly, poorly drawn, censor, blurry, watermark, simple background, transparent background, old, oldest, glitch, deformed, mutated, disfigured, long body, bad hands, missing fingers, extra digit, fewer digits, cropped, very displeasing, sketch, jpeg artifacts, username, censored, bar_censor, mosaic_censor, conjoined, bad ai-generated, long neck, skin blemishes, skin spots, acne, the wrong limb, error, black line, excess hands",
    "sd_mode":    "img_gen",
    "steps":      20,
    "cfg_scale":  7,
    "width":      1024,
    "height":     1024,
    "seed":       -1,
    "sampler":    "euler_a",
    "scheduler":  "karras",
    "clip_skip":  -1,
    "batch":      1
  }
}
```

### Platform path examples

| Platform | Example `checkpoints` path |
|---|---|
| Android (Termux) | `/sdcard/Download/models/checkpoints` |
| Linux | `/home/yourname/models/checkpoints` |
| Windows | `C:\\Users\\yourname\\models\\checkpoints` |

### Field reference

| Field | Description |
|---|---|
| `language` | Default UI language. Must match a filename in `lang/` (e.g. `"en"`, `"ja"`) |
| `directories.binary` | Path or name of the `sd-cli` / `sd-cli.exe` binary |
| `directories.checkpoints` | Folder containing `.safetensors` / `.gguf` models |
| `directories.loras` | Folder for LoRA files |
| `directories.vaes` | Folder for VAE files |
| `directories.output` | Where generated images are saved |
| `defaults.*` | Pre-selected values on every fresh page load |

---

## Supported Parameters

### Samplers
`euler` · `euler_a` · `heun` · `dpm2` · `dpm++2s_a` · `dpm++2m` · `dpm++2mv2` · `ipndm` · `ipndm_v` · `lcm` · `ddim_trailing` · `tcd` · `res_multistep` · `res_2s`

### Schedulers
`discrete` · `karras` · `exponential` · `ays` · `gits` · `smoothstep` · `sgm_uniform` · `simple` · `kl_optimal` · `lcm` · `bong_tangent`

### Run Modes

| Value | Description |
|---|---|
| `img_gen` | Standard image generation |
| `vid_gen` | Video generation (if supported by your build) |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Serves the web UI |
| `GET` | `/list/all` | Returns model/VAE/LoRA file lists + defaults + language |
| `POST` | `/generate` | Starts a generation job |
| `POST` | `/cancel` | Cancels the running job (SIGTERM) |
| `GET` | `/events` | SSE stream of generation progress |
| `GET` | `/images` | Lists output images (last 60) |
| `DELETE` | `/images/:name` | Deletes an image |
| `POST` | `/upload-init` | Uploads an init image for img2img |
| `GET` | `/lang/list` | Lists available language files |
| `GET` | `/lang/:code` | Returns a language JSON file |
| `GET` | `/sysinfo` | Returns OS/CPU/RAM info |

---

## Adding a Language

1. Copy any existing file in `lang/` as a template — e.g. `cp lang/en.json lang/fr.json`
2. Translate all values (keep the keys unchanged)
3. Set `"_label"` to the display name shown in the dropdown — e.g. `"Français"`
4. Reload the page — the new language appears in the selector automatically

No server restart required.

---

## Adding Icons

SVG files placed in `icons/` are served statically at `/icons/<filename>`.

| File | Used for |
|---|---|
| `moon.svg` | Dark mode button |
| `sun.svg` | Light mode button |
| `image.svg` | Init image dropzone placeholder |

Replace any file with your own SVG and reload — no server restart needed.

---

## Dependencies

```json
{
  "express": "^4.18.2",
  "multer":  "^1.4.5-lts.1"
}
```

---

## Notes

- Generated images are named `SD_img_<timestamp>.png` (batch: `SD_img_<timestamp>_0.png`, `_1.png`, …)
- Init images are uploaded to the system temp directory and cleaned up automatically
- Language and theme preferences are each saved to `localStorage`
- The server creates missing model/output directories on startup if they don't exist
- If `settings.json` is missing or invalid JSON, the server exits immediately with a clear error message

---

## License

MIT
