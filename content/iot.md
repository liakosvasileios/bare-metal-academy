# The Firmware RE Methodology

Reverse engineering an IoT device, router, camera or NAS follows a repeatable pipeline. Each stage has a "easy path" and progressively more invasive fallbacks. **Only do this on devices you own or are explicitly authorised to test.**

```text
Recon ─► Obtain firmware ─► Extract ─► Analyse (static) ─► Emulate / dynamic ─► Find bugs ─► (Report)
   │          │  (download, UART, SPI dump, OTA capture)        │
   └─ FCC ID, datasheets, CVEs            re-host in QEMU ◄──────┘
```

## Stage 0: Recon and threat surface
- Identify the exact model/hardware revision, SoC, flash and RAM (markings, FCC ID internal photos, `/proc/cpuinfo` if you have a shell).
- Enumerate the **attack surface**: network services (web admin, UPnP, Telnet/SSH, TR-069, custom TCP/UDP), the mobile app and its cloud API, Bluetooth/BLE, Zigbee, physical ports.
- Check for known **CVEs** and existing writeups for the SoC/SDK (Realtek, Broadcom, MediaTek, and the vendor's GPL release).

> [!tip] Many vendors must publish **GPL source** for their Linux-based firmware. The GPL tarball often reveals the kernel version, build config, partition layout and proprietary driver interfaces, a huge shortcut.

# Getting the Firmware

In rough order of preference:

## 1. Download it
Vendor support sites, OTA update URLs (found by watching the device update, see below), GPL releases, and third-party firmware (OpenWrt/DD-WRT) for the same chip. Easiest and non-destructive.

## 2. Capture the OTA update
Put the device behind a proxy or capture its traffic (see the Wireless/forensics tooling). If updates are fetched over HTTP, you get the image directly. Over HTTPS, you may need to defeat cert pinning in the companion app (Frida/objection) or use the device's trust store. Note whether images are **encrypted/signed** (that tells you about secure boot).

## 3. UART → bootloader/OS dump
With a UART shell (see Interfaces):
- From a **root shell**: `cat /proc/mtd` to see partitions, then `dd if=/dev/mtdblock3 of=/tmp/fw.bin` and exfiltrate over TFTP/nc/`cat` to the serial line, or `nanddump`.
- From **U-Boot**: `sf probe; sf read ${loadaddr} 0 0x1000000; md ...` or `nand read`, then dump over the serial/network. You can also often `setenv bootargs ... init=/bin/sh` to get a root shell.

## 4. Chip-off / in-circuit flash dump
When there's no console (or it's locked): read the SPI NOR/NAND/eMMC directly (Interfaces + Tools modules). SPI NOR with a clip + flashrom is the common case; NAND and eMMC are more involved (ECC, FTL). This bypasses software protections entirely but requires hardware skill.

# Extracting the File System

Once you have an image, carve it apart.

## First look
```sh
file fw.bin
binwalk -E fw.bin            # entropy: spot compressed/encrypted regions
binwalk fw.bin               # signature scan: headers, kernels, filesystems
```
The Lab's File analyzer does signature scanning and an entropy graph in the browser. A near-flat entropy of ~8 across the whole image suggests **encryption** (no clear filesystem), which points at secure boot; mixed entropy with recognisable magics means you can extract.

## Common layout
A typical router image contains: a **bootloader** (U-Boot), a **kernel** (often an LZMA/gzip-compressed uImage, magic `27 05 19 56`), and a **root filesystem** (usually **SquashFS**, magic `hsqs`/`sqsh`), sometimes plus an overlay (JFFS2/UBIFS) for config.

## Extract
```sh
binwalk -eM fw.bin           # recursive extract (run in a sandbox)
unblob fw.bin                # robust modern alternative
# filesystem-specific when binwalk's extractor struggles:
sasquatch -d rootfs squashfs.bin      # vendor-mangled SquashFS
jefferson jffs2.bin -d out            # JFFS2
ubireader_extract_files ubi.img       # UBI/UBIFS
```
You now have the root filesystem: `/bin`, `/etc`, `/www`, `/usr`, startup scripts, and the vendor's binaries.

## Mine the filesystem
```sh
grep -rniE 'password|passwd|secret|api[_-]?key|private key|BEGIN RSA' rootfs/
find rootfs -perm -4000            # setuid binaries
cat rootfs/etc/passwd rootfs/etc/shadow   # hardcoded/ default creds
ls rootfs/etc/init.d rootfs/etc/rc.d      # what starts at boot
# the web root reveals the admin interface:
ls rootfs/www  rootfs/usr/www
```
Look for: hardcoded credentials and keys, TLS private keys/certs, backdoor accounts, debug/telnet enablers, the web server and CGI binaries (where command-injection bugs live), and update/signature-verification code.

# Analysing and Emulating

## Static analysis of the binaries
- Identify the architecture/endianness (`file`, or the kernel's printed banner) — commonly MIPS (BE `mips` or LE `mipsel`), ARM/AArch64, or sometimes others. Load the binaries into Ghidra with the right processor.
- Prioritise network-facing binaries: the web server (often a BusyBox httpd, lighttpd, uhttpd, or a custom daemon), CGI handlers, UPnP/SSDP, and any custom service. These parse untrusted input.
- Look for dangerous patterns: `system()`/`popen()`/`exec*` built from request parameters (command injection), unbounded `strcpy`/`sprintf`/`memcpy` on network data (overflows), missing auth checks, and weak crypto.

## Emulation / re-hosting
Running the firmware without the hardware lets you fuzz and debug it.
- **User-mode**: copy a single binary + the extracted rootfs and run it with `qemu-mipsel -L rootfs ./usr/bin/httpd` (chroot/`-L` for libraries). Good for one service; often needs NVRAM stubs.
- **Full-system**: boot the kernel + rootfs under `qemu-system-...`. More faithful, more setup.
- Frameworks that automate this: **Firmadyne**, **FirmAE** (improves Firmadyne's success rate), **EMBA** (analysis + emulation), **Qiling** (scriptable), and **Unicorn/`greenhouse`** for partial emulation. NVRAM and hardware-access quirks are the usual obstacles; FirmAE's `nvram` shims and network setup handle many of them.

> [!lab] A classic safe exercise: download an old router firmware you own, `binwalk -eM` it, find the web CGI, emulate it with FirmAE until the admin page loads in your browser against the emulated device, then explore the request handlers in Ghidra. No hardware required.

# Finding and Reporting Vulnerabilities

## Bug classes typical of IoT firmware
- **Command injection** in CGI/web handlers (the #1 router bug): user input flows into `system()`. E.g. a `ping` diagnostic page that runs `ping <host>` with `host` unsanitised.
- **Memory corruption** in network parsers (see the Memory Safety module), especially in custom C daemons compiled with no mitigations (`checksec` often shows no canary, no PIE, exec stack).
- **Authentication bypass / hardcoded credentials / backdoors**: default accounts, magic parameters, `/etc/shadow` crackable offline.
- **Insecure update**: unsigned/unencrypted firmware accepting attacker images; downgrade attacks.
- **Information disclosure**: exposed `.git`, debug endpoints, secrets in the web root.
- **Weak crypto / key reuse**: the same TLS/SSH host key baked into every unit.

## Dynamic testing
Fuzz the emulated or real service (boofuzz, AFL++ under QEMU, or protocol-specific harnesses). Watch for crashes, then triage with GDB (`gdbserver` on the device or via QEMU) as in the Debugging module. Sanitizer builds help when you can recompile (e.g. OpenWrt packages).

## Responsible disclosure
If you find real vulnerabilities in a shipping product:
- Confirm scope and that you're testing **your own** device (never someone else's deployed device or network).
- Contact the vendor's security/PSIRT; give them reasonable time (coordinated disclosure, often 90 days); involve a CERT/CC if needed; request a **CVE**.
- Don't publish working exploits against unpatched, widely-deployed devices irresponsibly. The goal is to get it fixed.

> [!warn] Testing devices, accounts, or networks you don't own or lack written authorisation for is illegal in most places (e.g. the CFAA, the UK Computer Misuse Act). Build a home lab with devices you buy specifically to break. Bug-bounty programs and vendor VDPs give you a legal channel.

## Where to learn more (hands-on, legal)
- **OWASP IoT Top 10** and the **IoT Security Testing Guide**.
- **Damn Vulnerable Router Firmware (DVRF)**, **IoTGoat**, **Damn Vulnerable ARM Router (DVAR)** — intentionally vulnerable targets.
- The OpenWrt project (build and study real router firmware), and the "Practical IoT Hacking" and "Firmware Handbook" resources.
