/* Interactive lab tools. Everything runs locally in the browser; files are never uploaded. */
window.LAB = (() => {
  "use strict";
  const TOOLS = [
    ["conv", "Number converter"], ["regs", "Register view"], ["file", "File analyzer"], ["time", "Timestamp decoder"],
    ["disk", "Disk & offset math"], ["elec", "Electronics calc"], ["bits", "Bitwise playground"], ["ascii", "ASCII table"],
  ];
  let H; // helpers from app.js

  const SIGS = [
    ["7F454C46", "ELF executable"], ["4D5A", "PE/DOS executable (MZ)"], ["CAFEBABE", "Mach-O universal / Java class"],
    ["CFFAEDFE", "Mach-O 64-bit (LE)"], ["CEFAEDFE", "Mach-O 32-bit (LE)"], ["504B0304", "ZIP / APK / JAR / DOCX / IPA"],
    ["1F8B08", "gzip"], ["425A68", "bzip2"], ["FD377A585A00", "xz"], ["5D00008000", "LZMA (common router fw)"], ["28B52FFD", "zstd"],
    ["04224D18", "LZ4 frame"], ["377ABCAF271C", "7-Zip"], ["526172211A07", "RAR"], ["68737173", "SquashFS (LE 'hsqs')"],
    ["73717368", "SquashFS (BE 'sqsh')"], ["8519", "JFFS2 node (LE)"], ["1985", "JFFS2 node (BE)"], ["55424923", "UBI erase-counter header"],
    ["31181006", "UBIFS node"], ["453DCD28", "CramFS (LE)"], ["27051956", "U-Boot uImage header"], ["D00DFEED", "Flattened Device Tree (DTB / FIT)"],
    ["414E44524F494421", "Android boot image (ANDROID!)"], ["3AFF26ED", "Android sparse image"], ["89504E470D0A1A0A", "PNG image"],
    ["FFD8FF", "JPEG image"], ["47494638", "GIF image"], ["25504446", "PDF document"], ["D0CF11E0A1B11AE1", "OLE2 (legacy Office, MSI, thumbs.db)"],
    ["4C0000000114020000000000C000000000000046", "Windows LNK shortcut"], ["72656766", "Windows registry hive (regf)"],
    ["4D444D5093A7", "Windows minidump (MDMP)"], ["4D414D04", "Windows 10+ compressed prefetch (MAM)"], ["53434341", "Windows prefetch (SCCA, uncompressed)"],
    ["456C6646696C6500", "Windows EVTX log (ElfFile)"], ["46494C45", "NTFS MFT record (FILE)"], ["4E544653202020", "NTFS boot sector OEM ID"],
    ["4546492050415254", "GPT header (EFI PART)"], ["53514C69746520666F726D6174203300", "SQLite 3 database"], ["4B444D56", "VMDK sparse"],
    ["514649FB", "QEMU QCOW"], ["636F6E6563746978", "VHD footer (conectix)"], ["7668647866696C65", "VHDX"], ["45564609", "EnCase E01 (EVF)"],
    ["41464634", "AFF4 container?"], ["000001BA", "MPEG program stream"], ["1A45DFA3", "Matroska / WebM"], ["52494646", "RIFF (WAV/AVI/WebP)"],
    ["664C6143", "FLAC"], ["494433", "MP3 with ID3"], ["2D2D2D2D2D424547494E", "PEM block (-----BEGIN)"], ["3082", "DER ASN.1 SEQUENCE (cert/key?)"],
    ["EB3C90", "FAT12/16 boot jump"], ["EB5890", "FAT32 boot jump"], ["EB52904E54465320", "NTFS VBR"], ["55AA", "Boot signature 0x55AA (check offset 510)"],
    ["53EF", "ext2/3/4 superblock magic (at 0x438)"], ["4E585342", "APFS container superblock (NXSB)"], ["482B0004", "HFS+ volume header"],
    ["5A4D", "Possible byte-swapped MZ"], ["2321", "Script (#!)"], ["7B5C727466", "RTF"], ["3C3F786D6C", "XML"], ["4C5A4950", "LZIP"],
  ];
  const hex2bytes = (h) => { const c = h.replace(/[^0-9a-f]/gi, ""); const a = new Uint8Array(c.length >> 1); for (let i = 0; i < a.length; i++) a[i] = parseInt(c.substr(i * 2, 2), 16); return a; };

  function render(view, tool, helpers) {
    H = helpers; tool = tool || "conv";
    view.innerHTML = `<section class="hero"><div class="kicker">// hands-on</div><h1>Lab</h1><p>Small tools you actually use while reversing and doing forensics. Nothing leaves your device; files are read locally.</p></section>
      <div class="tool-tabs" style="margin-top:16px">${TOOLS.map(([id, t]) => `<a class="btn sm ${id === tool ? "primary" : "ghost"}" href="#/lab/${id}">${t}</a>`).join("")}</div>
      <div class="qcard" id="tool"></div>`;
    const root = H.$("#tool");
    ({ conv, regs, file, time, disk, elec, bits, ascii }[tool] || conv)(root);
  }

  /* ---------- number converter ---------- */
  function parseNum(s, base) {
    s = s.trim().replace(/_/g, "").replace(/\s+/g, "");
    let neg = false; if (s.startsWith("-")) { neg = true; s = s.slice(1); }
    if (base === "auto") {
      if (/^0x/i.test(s)) { base = 16; s = s.slice(2); } else if (/^0b/i.test(s)) { base = 2; s = s.slice(2); }
      else if (/^0o/i.test(s)) { base = 8; s = s.slice(2); } else if (/h$/i.test(s)) { base = 16; s = s.slice(0, -1); }
      else if (/[a-f]/i.test(s)) base = 16; else base = 10;
    } else base = +base;
    const digits = "0123456789abcdef".slice(0, base);
    if (!s || ![...s.toLowerCase()].every((c) => digits.includes(c))) throw new Error("Invalid digits for base " + base);
    let v = 0n; for (const c of s.toLowerCase()) v = v * BigInt(base) + BigInt(digits.indexOf(c));
    return neg ? -v : v;
  }
  function conv(root) {
    root.innerHTML = `<h2 style="margin-top:0">Number converter</h2><p class="muted small">Accepts 0x / 0b / 0o prefixes, trailing h, underscores, and negative numbers.</p>
      <div class="row"><input class="fill" id="cv" value="0xDEADBEEF" style="flex:3"><select id="cb" class="fill" style="flex:1;min-width:110px"><option value="auto">auto</option><option value="10">dec</option><option value="16">hex</option><option value="2">bin</option><option value="8">oct</option></select></div>
      <div class="field"><label>Width for two's complement</label><select id="cw" class="fill"><option>8</option><option>16</option><option selected>32</option><option>64</option></select></div>
      <div id="co" class="lab-out"></div>`;
    const go = () => {
      const o = H.$("#co");
      try {
        const v = parseNum(H.$("#cv").value, H.$("#cb").value); const w = BigInt(H.$("#cw").value);
        const mask = (1n << w) - 1n; const u = ((v % (1n << w)) + (1n << w)) & mask;
        const s = u >= 1n << (w - 1n) ? u - (1n << w) : u;
        const nbytes = Number(w / 8n); const bytes = [];
        for (let i = 0; i < nbytes; i++) bytes.push(Number((u >> BigInt(8 * i)) & 0xffn));
        const hx = (b) => b.toString(16).padStart(2, "0").toUpperCase();
        const ascii = bytes.slice().reverse().map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
        const bin = u.toString(2).padStart(Number(w), "0").replace(/(.{4})(?=.)/g, "$1 ");
        let f = "";
        if (w === 32n) { const dv = new DataView(new ArrayBuffer(4)); dv.setUint32(0, Number(u)); f = dv.getFloat32(0).toPrecision(9); }
        if (w === 64n) { const dv = new DataView(new ArrayBuffer(8)); dv.setBigUint64(0, u); f = dv.getFloat64(0).toPrecision(17); }
        o.textContent = [
          `input (exact)      ${v.toString(10)}`,
          `hex                0x${u.toString(16).toUpperCase().padStart(nbytes * 2, "0")}`,
          `unsigned ${String(w).padEnd(3)}       ${u.toString(10)}`,
          `signed ${String(w).padEnd(3)}         ${s.toString(10)}`,
          `octal              0o${u.toString(8)}`,
          `binary             ${bin}`,
          `bytes big-endian   ${bytes.slice().reverse().map(hx).join(" ")}`,
          `bytes little-end.  ${bytes.map(hx).join(" ")}`,
          `ASCII (BE order)   "${ascii}"`,
          f ? `as IEEE-754 float  ${f}` : `as IEEE-754        (choose 32 or 64 bits)`,
          v > mask || v < -(1n << (w - 1n)) ? `! value does not fit in ${w} bits — truncated` : `fits in ${w} bits`,
        ].join("\n");
      } catch (e) { o.textContent = e.message; }
    };
    ["cv", "cb", "cw"].forEach((id) => H.$("#" + id).addEventListener("input", go)); go();
  }

  /* ---------- register view ---------- */
  function regs(root) {
    root.innerHTML = `<h2 style="margin-top:0">Register view</h2><p class="muted small">See how sub-registers alias one 64-bit register, and what partial writes do.</p>
      <div class="field"><label>64-bit value (hex)</label><input class="fill" id="rv" value="0x1122334455667788"></div>
      <div class="field"><label>Architecture</label><select class="fill" id="ra"><option value="x86">x86-64 (RAX family)</option><option value="arm">ARM64 (X0/W0)</option></select></div>
      <div id="ro"></div>
      <h3>Simulate a write</h3><div class="row"><select class="fill" id="rw" style="flex:2"></select><input class="fill" id="rn" value="0xAB" style="flex:1"><button class="btn primary" id="rgo">Execute</button></div>
      <p class="small muted" id="rnote"></p>`;
    const val = () => { try { return BigInt.asUintN(64, parseNum(H.$("#rv").value, "auto")); } catch { return 0n; } };
    const hb = (v, n) => v.toString(16).toUpperCase().padStart(n * 2, "0");
    const views = {
      x86: [["RAX", 0, 8], ["EAX", 0, 4], ["AX", 0, 2], ["AH", 1, 1], ["AL", 0, 1]],
      arm: [["X0", 0, 8], ["W0", 0, 4]],
    };
    const writes = {
      x86: [["mov al, imm8", 0, 1, false, "Writes to 8-bit registers leave bits 8–63 unchanged."], ["mov ah, imm8", 1, 1, false, "AH is bits 8–15; everything else is preserved."],
        ["mov ax, imm16", 0, 2, false, "16-bit writes preserve bits 16–63 (a partial-register write)."], ["mov eax, imm32", 0, 4, true, "Any write to a 32-bit register ZERO-EXTENDS into the full 64-bit register. That's why compilers write `xor eax, eax` instead of `xor rax, rax`."],
        ["mov rax, imm64", 0, 8, true, "Full 64-bit write."]],
      arm: [["mov w0, #imm", 0, 4, true, "Writing a W register zeroes the upper 32 bits of the X register."], ["movk x0, #imm, lsl #16", 2, 2, false, "MOVK replaces one 16-bit field and keeps the rest; it's used to build constants piece by piece."], ["mov x0, #imm", 0, 8, true, "Full 64-bit write."]],
    };
    const draw = () => {
      const a = H.$("#ra").value, v = val();
      H.$("#ro").innerHTML = views[a].map(([n, off, sz]) => {
        const sub = (v >> BigInt(off * 8)) & ((1n << BigInt(sz * 8)) - 1n);
        const cells = [...Array(8)].map((_, k) => { const byte = 7 - k; const on = byte >= off && byte < off + sz; return `<span class="${on ? "on" : ""}">${hb((v >> BigInt(byte * 8)) & 0xffn, 1)}</span>`; }).join("");
        return `<div class="reg-row"><b>${n}</b><div><div class="reg-bytes">${cells}</div><div class="small muted">= 0x${hb(sub, sz)}</div></div></div>`;
      }).join("") + `<p class="small muted">Byte 7 (most significant) is on the left.</p>`;
      H.$("#rw").innerHTML = writes[a].map((w, i) => `<option value="${i}">${w[0]}</option>`).join("");
    };
    H.$("#ra").onchange = draw; H.$("#rv").oninput = draw;
    H.$("#rgo").onclick = () => {
      const a = H.$("#ra").value; const [, off, sz, zext, note] = writes[a][+H.$("#rw").value];
      let imm; try { imm = BigInt.asUintN(sz * 8, parseNum(H.$("#rn").value, "auto")); } catch { return H.toast("Bad immediate"); }
      let v = val();
      if (zext) v = imm << BigInt(off * 8);
      else { const m = ((1n << BigInt(sz * 8)) - 1n) << BigInt(off * 8); v = (v & ~m & ((1n << 64n) - 1n)) | (imm << BigInt(off * 8)); }
      H.$("#rv").value = "0x" + hb(v, 8); H.$("#rnote").innerHTML = H.inline(note); draw();
    };
    draw();
  }

  /* ---------- file analyzer ---------- */
  function file(root) {
    root.innerHTML = `<h2 style="margin-top:0">File analyzer</h2><p class="muted small">A tiny binwalk + hexdump + hasher. Pick a firmware image, disk image or any file; it's processed in your browser only (up to 512 MB).</p>
      <input type="file" id="ff" class="fill">
      <div id="fo" style="margin-top:12px"></div>`;
    H.$("#ff").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const o = H.$("#fo");
      if (f.size > 512 * 1024 * 1024) { o.innerHTML = "<p>File too large for in-browser analysis.</p>"; return; }
      o.innerHTML = `<p class="muted">Reading ${H.esc(f.name)}…</p>`;
      const buf = new Uint8Array(await f.arrayBuffer());
      // entropy per block
      const blocks = Math.min(512, Math.max(1, Math.ceil(buf.length / 1024)));
      const bs = Math.ceil(buf.length / blocks); const ent = [];
      const entropy = (a, s, e) => { const c = new Uint32Array(256); for (let i = s; i < e; i++) c[a[i]]++; let h = 0; const n = e - s; for (const x of c) if (x) { const p = x / n; h -= p * Math.log2(p); } return h; };
      for (let b = 0; b < blocks; b++) ent.push(entropy(buf, b * bs, Math.min(buf.length, (b + 1) * bs)));
      const total = entropy(buf, 0, buf.length);
      // signature scan
      const sigs = SIGS.map(([h, n]) => [hex2bytes(h), n]).filter(([b]) => b.length >= 4);
      const hits = []; const limit = 200;
      const scanLen = Math.min(buf.length, 64 * 1024 * 1024);
      outer: for (let i = 0; i < scanLen; i++) {
        for (const [b, n] of sigs) {
          if (buf[i] !== b[0]) continue;
          let ok = true; for (let k = 1; k < b.length; k++) if (buf[i + k] !== b[k]) { ok = false; break; }
          if (ok) { hits.push([i, n]); if (hits.length >= limit) break outer; }
        }
      }
      const head = SIGS.filter(([h]) => { const b = hex2bytes(h); return b.every((x, k) => buf[k] === x); }).map((s) => s[1]);
      let sha256 = "(needs HTTPS)", sha1 = "";
      try {
        sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
        sha1 = [...new Uint8Array(await crypto.subtle.digest("SHA-1", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
      } catch {}
      const strings = []; let cur = "";
      for (let i = 0; i < Math.min(buf.length, 4 * 1024 * 1024) && strings.length < 300; i++) { const c = buf[i]; if (c >= 32 && c < 127) cur += String.fromCharCode(c); else { if (cur.length >= 6) strings.push(cur); cur = ""; } }
      o.innerHTML = `<dl class="kv"><dt>name</dt><dd>${H.esc(f.name)}</dd><dt>size</dt><dd>${buf.length.toLocaleString()} bytes (0x${buf.length.toString(16)})</dd>
        <dt>header</dt><dd>${head.length ? H.esc(head.join(", ")) : "unknown"}</dd><dt>entropy</dt><dd>${total.toFixed(4)} bits/byte ${total > 7.9 ? "— likely compressed or encrypted" : total < 1 ? "— mostly uniform/padding" : ""}</dd>
        <dt>SHA-256</dt><dd>${sha256}</dd>${sha1 ? `<dt>SHA-1</dt><dd>${sha1}</dd>` : ""}</dl>
        <h3>Entropy by offset</h3><canvas class="entropy" id="ec" width="1000" height="200"></canvas>
        <p class="small muted">Flat ≈ 8 = compressed/encrypted; dips = headers, code, padding (0xFF erased flash = 0).</p>
        <h3>Signature scan (${hits.length}${hits.length >= limit ? "+" : ""})${scanLen < buf.length ? " — first 64 MB" : ""}</h3>
        <div class="lab-out">${hits.length ? hits.map(([off, n]) => `0x${off.toString(16).padStart(8, "0")}  ${String(off).padStart(10)}  ${H.esc(n)}`).join("\n") : "No known signatures found."}</div>
        <p class="small muted">Short magics produce false positives; confirm each hit by parsing the header (as binwalk does).</p>
        <h3>Hexdump (first 512 bytes)</h3><div class="lab-out">${H.esc(hexdump(buf.subarray(0, 512)))}</div>
        <h3>Strings (first ${strings.length}, ≥6 chars)</h3><div class="lab-out" style="max-height:300px;overflow:auto">${H.esc(strings.join("\n"))}</div>`;
      const cv = H.$("#ec"), ctx = cv.getContext("2d"); const css = getComputedStyle(document.documentElement);
      ctx.strokeStyle = css.getPropertyValue("--line"); ctx.beginPath(); ctx.moveTo(0, 200 - 175); ctx.lineTo(1000, 200 - 175); ctx.stroke();
      ctx.strokeStyle = css.getPropertyValue("--accent").trim(); ctx.lineWidth = 2; ctx.beginPath();
      ent.forEach((e2, k) => { const x = (k / Math.max(1, ent.length - 1)) * 1000, y = 195 - (e2 / 8) * 175; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
    };
  }
  function hexdump(b, base = 0) {
    const lines = [];
    for (let i = 0; i < b.length; i += 16) {
      const row = b.subarray(i, i + 16);
      const hx = [...row].map((x) => x.toString(16).padStart(2, "0")).join(" ");
      const as = [...row].map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : ".")).join("");
      lines.push(`${(base + i).toString(16).padStart(8, "0")}  ${hx.slice(0, 23).padEnd(23)}  ${hx.slice(24).padEnd(23)}  |${as}|`);
    }
    return lines.join("\n");
  }

  /* ---------- timestamps ---------- */
  function time(root) {
    root.innerHTML = `<h2 style="margin-top:0">Timestamp decoder</h2><p class="muted small">Paste a raw value (decimal or 0x hex). For 8-byte values copied from a hex editor, tick "little-endian bytes".</p>
      <input class="fill" id="tv" value="133700000000000000"><label class="small row" style="margin:8px 0"><input type="checkbox" id="tle"> value is little-endian bytes (e.g. 00 80 3E D5 DE B1 9D 01)</label>
      <div class="lab-out" id="to"></div>
      <p class="small muted">FILETIME: 100-ns ticks since 1601-01-01 (NTFS, registry, LNK). WebKit/Chrome: µs since 1601. Unix: s/ms since 1970. Cocoa/Mac Absolute: s since 2001 (iOS/macOS). HFS+: s since 1904. FAT/DOS: packed date+time, 2-second resolution, local time.</p>`;
    const iso = (ms) => { if (!isFinite(ms)) return "—"; const d = new Date(ms); return isNaN(d) || Math.abs(ms) > 8.64e15 ? "out of range" : d.toISOString().replace("T", " ").replace("Z", " UTC"); };
    const go = () => {
      let raw = H.$("#tv").value.trim(); let v;
      try {
        if (H.$("#tle").checked) { const b = hex2bytes(raw); v = 0n; for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]); }
        else v = parseNum(raw, /^0x/i.test(raw) ? "auto" : "10");
      } catch (e) { H.$("#to").textContent = e.message; return; }
      const n = Number(v);
      const EPOCH1601 = -11644473600000;
      const dos = (x) => { const t = x & 0xffff, d = (x >>> 16) & 0xffff; const y = 1980 + (d >> 9), mo = (d >> 5) & 15, dd = d & 31, h = t >> 11, mi = (t >> 5) & 63, s = (t & 31) * 2; return `${y}-${String(mo).padStart(2, 0)}-${String(dd).padStart(2, 0)} ${String(h).padStart(2, 0)}:${String(mi).padStart(2, 0)}:${String(s).padStart(2, 0)} (local)`; };
      H.$("#to").textContent = [
        `value              ${v} (0x${v.toString(16)})`,
        `Unix seconds       ${iso(n * 1000)}`,
        `Unix milliseconds  ${iso(n)}`,
        `Unix microseconds  ${iso(n / 1000)}`,
        `Windows FILETIME   ${iso(EPOCH1601 + Number(v / 10000n))}`,
        `WebKit/Chrome µs   ${iso(EPOCH1601 + n / 1000)}`,
        `Cocoa / Mac abs.   ${iso(978307200000 + n * 1000)}`,
        `HFS+ (1904)        ${iso(-2082844800000 + n * 1000)}`,
        `FAT/DOS date-time  ${n >= 0 && n <= 0xffffffff ? dos(n) : "—"}`,
      ].join("\n");
    };
    H.$("#tv").oninput = go; H.$("#tle").onchange = go; go();
  }

  /* ---------- disk math ---------- */
  function disk(root) {
    root.innerHTML = `<h2 style="margin-top:0">Disk & offset math</h2>
      <h3>LBA → byte offset</h3><div class="row"><input class="fill" id="dl" value="2048" style="flex:2"><select id="ds" class="fill" style="flex:1"><option>512</option><option>4096</option></select></div><div class="lab-out" id="do1"></div>
      <h3>Byte offset → LBA</h3><input class="fill" id="db" value="0x100000"><div class="lab-out" id="do2"></div>
      <h3>CHS → LBA</h3><p class="small muted">LBA = (C × HPC + H) × SPT + (S − 1). Legacy geometry is usually 255 heads, 63 sectors/track.</p>
      <div class="row"><input class="fill" id="cc" value="0" placeholder="C" style="flex:1"><input class="fill" id="ch" value="32" placeholder="H" style="flex:1"><input class="fill" id="cs" value="33" placeholder="S" style="flex:1"><input class="fill" id="hpc" value="255" title="heads/cyl" style="flex:1"><input class="fill" id="spt" value="63" title="sectors/track" style="flex:1"></div><div class="lab-out" id="do3"></div>
      <h3>Cluster → offset (FAT/NTFS)</h3><p class="small muted">NTFS: offset = partition start + LCN × cluster size. FAT: offset = data region start + (cluster − 2) × cluster size.</p>
      <div class="row"><input class="fill" id="pst" value="2048" title="partition start LBA" style="flex:1"><input class="fill" id="lcn" value="786432" title="LCN / cluster" style="flex:1"><input class="fill" id="csz" value="4096" title="cluster bytes" style="flex:1"></div><div class="lab-out" id="do4"></div>`;
    const N = (id) => { try { return parseNum(H.$("#" + id).value, "auto"); } catch { return 0n; } };
    const sz = (b) => { const u = ["B", "KiB", "MiB", "GiB", "TiB"]; let x = Number(b), i = 0; while (x >= 1024 && i < 4) { x /= 1024; i++; } return x.toFixed(2) + " " + u[i]; };
    const go = () => {
      const s = BigInt(H.$("#ds").value);
      const o1 = N("dl") * s; H.$("#do1").textContent = `offset = ${o1} = 0x${o1.toString(16)}  (${sz(o1)})\ndd: dd if=disk.img bs=${s} skip=${N("dl")} count=1 | xxd`;
      const b = N("db"); H.$("#do2").textContent = `LBA ${b / s} + ${b % s} bytes   (sector size ${s})`;
      const lba = (N("cc") * N("hpc") + N("ch")) * N("spt") + (N("cs") - 1n); H.$("#do3").textContent = `LBA = ${lba}  → offset 0x${(lba * 512n).toString(16)}`;
      const o4 = N("pst") * 512n + N("lcn") * N("csz"); H.$("#do4").textContent = `NTFS-style offset = ${o4} = 0x${o4.toString(16)} (sector ${o4 / 512n})`;
    };
    ["dl", "ds", "db", "cc", "ch", "cs", "hpc", "spt", "pst", "lcn", "csz"].forEach((id) => H.$("#" + id).addEventListener("input", go)); go();
  }

  /* ---------- electronics ---------- */
  function elec(root) {
    const BAUDS = [300, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 38400, 57600, 74880, 115200, 230400, 250000, 460800, 500000, 921600, 1000000, 1500000, 2000000, 3000000];
    root.innerHTML = `<h2 style="margin-top:0">Electronics calculators</h2>
      <h3>UART baud from pulse width</h3><p class="small muted">Measure the narrowest pulse on TX with a logic analyzer or scope (that's one bit time).</p>
      <div class="row"><input class="fill" id="pw" value="8.68" style="flex:2"><select id="pu" class="fill" style="flex:1"><option value="1e-6">µs</option><option value="1e-9">ns</option><option value="1e-3">ms</option></select></div><div class="lab-out" id="eo1"></div>
      <h3>Voltage divider</h3><p class="small muted">Vout = Vin × R2 / (R1 + R2). Fine for slow, input-only signals (e.g. shifting a 5 V TX into a 3.3 V RX), not for fast or bidirectional lines.</p>
      <div class="row"><input class="fill" id="vin" value="5" title="Vin" style="flex:1"><input class="fill" id="r1" value="1000" title="R1 Ω" style="flex:1"><input class="fill" id="r2" value="2000" title="R2 Ω" style="flex:1"></div><div class="lab-out" id="eo2"></div>
      <h3>Ohm's law & power</h3><div class="row"><input class="fill" id="ov" value="3.3" title="V" style="flex:1"><input class="fill" id="or" value="10000" title="R Ω" style="flex:1"></div><div class="lab-out" id="eo3"></div>
      <h3>Resistor colour code (4-band)</h3><div class="row">${[1, 2, 3, 4].map((k) => `<select class="fill" id="b${k}" style="flex:1"></select>`).join("")}</div><div class="lab-out" id="eo4"></div>`;
    const C = ["black", "brown", "red", "orange", "yellow", "green", "blue", "violet", "grey", "white"];
    const TOL = { brown: "±1%", red: "±2%", gold: "±5%", silver: "±10%" };
    [1, 2].forEach((k) => H.$("#b" + k).innerHTML = C.map((c, i) => `<option value="${i}">${c}</option>`).join(""));
    H.$("#b3").innerHTML = [...C.map((c, i) => [c, 10 ** i]), ["gold", 0.1], ["silver", 0.01]].map(([c, m]) => `<option value="${m}">${c} ×${m}</option>`).join("");
    H.$("#b4").innerHTML = Object.entries(TOL).map(([c, t]) => `<option value="${t}">${c} ${t}</option>`).join("");
    H.$("#b1").value = "1"; H.$("#b2").value = "0"; H.$("#b3").value = "100"; H.$("#b4").value = "±5%";
    const R = (x) => x >= 1e6 ? (x / 1e6).toPrecision(3) + " MΩ" : x >= 1e3 ? (x / 1e3).toPrecision(3) + " kΩ" : x.toPrecision(3) + " Ω";
    const go = () => {
      const t = parseFloat(H.$("#pw").value) * parseFloat(H.$("#pu").value);
      const b = 1 / t; const best = BAUDS.reduce((a, x) => (Math.abs(x - b) < Math.abs(a - b) ? x : a));
      H.$("#eo1").textContent = `bit time ${(t * 1e6).toFixed(3)} µs → ${Math.round(b)} baud\nnearest standard: ${best} (${((b / best - 1) * 100).toFixed(2)}% off; UART tolerates roughly ±2–3%)\n8N1 frame = 10 bits → ${(best / 10).toFixed(0)} bytes/s`;
      const vin = +H.$("#vin").value, r1 = +H.$("#r1").value, r2 = +H.$("#r2").value;
      H.$("#eo2").textContent = `Vout = ${(vin * r2 / (r1 + r2)).toFixed(3)} V   (current ${(vin / (r1 + r2) * 1000).toFixed(3)} mA)`;
      const v = +H.$("#ov").value, r = +H.$("#or").value;
      H.$("#eo3").textContent = `I = V/R = ${(v / r * 1000).toFixed(4)} mA\nP = V²/R = ${(v * v / r * 1000).toFixed(4)} mW`;
      const val = (+H.$("#b1").value * 10 + +H.$("#b2").value) * +H.$("#b3").value;
      H.$("#eo4").textContent = `${R(val)} ${H.$("#b4").value}`;
    };
    root.querySelectorAll("input,select").forEach((el) => el.addEventListener("input", go)); go();
  }

  /* ---------- bitwise ---------- */
  function bits(root) {
    root.innerHTML = `<h2 style="margin-top:0">Bitwise playground</h2><p class="muted small">32-bit operations, as the CPU does them. Useful for decoding flags, masks and obfuscation (XOR keys, rotates).</p>
      <div class="row"><input class="fill" id="ba" value="0xF0F0A5A5" style="flex:1"><select class="fill" id="bo" style="flex:1"><option>AND</option><option>OR</option><option>XOR</option><option>SHL</option><option>SHR (logical)</option><option>SAR (arithmetic)</option><option>ROL</option><option>ROR</option><option>NOT a</option><option>ADD</option><option>SUB</option></select><input class="fill" id="bb" value="0x0FF0" style="flex:1"></div>
      <div class="lab-out" id="bout"></div>`;
    const go = () => {
      let a, b; try { a = Number(BigInt.asUintN(32, parseNum(H.$("#ba").value, "auto"))) >>> 0; b = Number(BigInt.asUintN(32, parseNum(H.$("#bb").value, "auto"))) >>> 0; } catch (e) { H.$("#bout").textContent = e.message; return; }
      const op = H.$("#bo").value, s = b & 31; let r, cf = "", of = "";
      switch (op) {
        case "AND": r = a & b; break; case "OR": r = a | b; break; case "XOR": r = a ^ b; break;
        case "SHL": r = a << s; break; case "SHR (logical)": r = a >>> s; break; case "SAR (arithmetic)": r = a >> s; break;
        case "ROL": r = (a << s) | (a >>> ((32 - s) & 31)); break; case "ROR": r = (a >>> s) | (a << ((32 - s) & 31)); break;
        case "NOT a": r = ~a; break;
        case "ADD": { const full = a + b; r = full; cf = full > 0xffffffff ? 1 : 0; const sa = a | 0, sb = b | 0, sr = (full | 0); of = (sa >= 0) === (sb >= 0) && (sr >= 0) !== (sa >= 0) ? 1 : 0; break; }
        case "SUB": { r = a - b; cf = a < b ? 1 : 0; const sa = a | 0, sb = b | 0, sr = (r | 0); of = (sa >= 0) !== (sb >= 0) && (sr >= 0) !== (sa >= 0) ? 1 : 0; break; }
      }
      r = r >>> 0;
      const B = (x) => (x >>> 0).toString(2).padStart(32, "0").replace(/(.{8})(?=.)/g, "$1 ");
      const X = (x) => "0x" + (x >>> 0).toString(16).toUpperCase().padStart(8, "0");
      H.$("#bout").textContent = `a      ${X(a)}  ${B(a)}\nb      ${X(b)}  ${B(b)}\nresult ${X(r)}  ${B(r)}\n\nunsigned ${r}   signed ${r | 0}\nZF=${r === 0 ? 1 : 0}  SF=${r >>> 31}${cf !== "" ? `  CF=${cf}  OF=${of}` : ""}`;
    };
    root.querySelectorAll("input,select").forEach((el) => el.addEventListener("input", go)); go();
  }

  /* ---------- ascii ---------- */
  function ascii(root) {
    const ctrl = ["NUL", "SOH", "STX", "ETX", "EOT", "ENQ", "ACK", "BEL", "BS", "HT", "LF", "VT", "FF", "CR", "SO", "SI", "DLE", "DC1", "DC2", "DC3", "DC4", "NAK", "SYN", "ETB", "CAN", "EM", "SUB", "ESC", "FS", "GS", "RS", "US"];
    root.innerHTML = `<h2 style="margin-top:0">ASCII table</h2><p class="small muted">Tip: 'A' = 0x41, 'a' = 0x61; flipping bit 5 (0x20) toggles case. '0' = 0x30.</p>
      <h3>Text ↔ hex</h3><input class="fill" id="at" value="Hello, firmware!"><div class="lab-out" id="ao"></div>
      <input class="fill" id="ah" placeholder="hex → text, e.g. 48 65 6c 6c 6f" style="margin-top:8px"><div class="lab-out" id="ao2"></div>
      <h3>Table</h3><div class="ascii">${[...Array(128)].map((_, i) => `<div><span>${i.toString(16).padStart(2, "0").toUpperCase()} · ${i}</span><b>${i < 32 ? ctrl[i] : i === 127 ? "DEL" : i === 32 ? "SP" : H.esc(String.fromCharCode(i))}</b></div>`).join("")}</div>`;
    const go = () => {
      const bytes = new TextEncoder().encode(H.$("#at").value);
      H.$("#ao").textContent = hexdump(bytes);
      const b = hex2bytes(H.$("#ah").value); H.$("#ao2").textContent = b.length ? new TextDecoder("utf-8", { fatal: false }).decode(b) : "";
    };
    H.$("#at").oninput = go; H.$("#ah").oninput = go; go();
  }

  return { render };
})();
