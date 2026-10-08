# Bare Metal Academy

An installable, offline-capable **PWA** for learning the low-level computing stack end to end:

- **Hardware reverse engineering** — IoT, routers, smart-home devices and smartphones; electronics, buses (UART/SPI/I²C/JTAG/SWD), tooling, firmware extraction, secure boot and physical attacks.
- **Assembly & software RE** — x86-64 and ARM64 assembly, operating-system internals, executable formats, debugging/dynamic analysis, and memory safety & mitigations.
- **Storage, recovery & digital forensics** — HDD/SSD/flash internals, partitions & file systems, data recovery, the forensic process, OS/app artifacts, and memory forensics.
- **Foundations** — data representation and computer architecture.

Every module has readable **lessons** plus an **interactive quiz**; there's a **practice hub** with a timed exam simulator, flashcards, a mistake-review mode, a **glossary**, full-text **search**, and a **Lab** of hands-on tools (number/base converter, register-aliasing visualizer, in-browser file analyzer with entropy + signature scanning, timestamp decoder, disk/offset math, electronics and bitwise calculators, ASCII table).

- **21 modules · 117 lessons · 440+ questions · 90 glossary terms.**
- Progress is stored **locally on the device**; there is no backend and nothing is uploaded (the file analyzer reads files entirely in the browser).

## Ethics & scope

The security content is for **education, authorized testing, CTFs and defensive/forensic work**. Only test devices, systems and networks you own or are explicitly authorized to examine. The material explains concepts and defenses rather than providing ready-made attacks.

## Run locally

No build step; any static server works:

```sh
npx serve .
# or
python -m http.server
```

Then open the printed URL.

## Project layout

- `index.html`, `styles.css`, `app.js` — the SPA shell, router, markdown renderer and quiz engine.
- `lab.js` — the interactive Lab tools.
- `content/<module>.md` — lessons (one `# ` heading per lesson).
- `data/modules.js` — curriculum structure; `data/questions/<module>.js` — question banks; `data/glossary.js` — glossary.
- `sw.js` + `manifest.webmanifest` + `icons/` — PWA offline support and install metadata.
- `scripts/make-icons.mjs` — regenerates the icons; `scripts/build-sw.mjs` — regenerates the service-worker precache list and version.

## Deploy

Static site on Vercel (no framework, no build command). `sw.js` is served `no-cache` so updates roll out. After changing content, run `node scripts/build-sw.mjs` to refresh the precache list and bump the version.
