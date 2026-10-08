# Smartphone Hardware Architecture

Phones are dense, highly integrated systems. Understanding the hardware tells you where data lives and how to reach it (for RE, repair and forensics on devices **you own or are authorised to examine**).

## Major components
- **SoC (Application Processor)**: Qualcomm Snapdragon, Apple A/M, Samsung Exynos, MediaTek Dimensity. Integrates CPU (ARM64 big.LITTLE), GPU, ISP, NPU, modem (sometimes), and security blocks.
- **Baseband/modem**: cellular processor, often a separate security domain running its own RTOS.
- **RAM**: LPDDR, usually **PoP** (Package-on-Package) stacked on the SoC.
- **Storage**: **eMMC** (older/budget) or **UFS** (modern), BGA. Holds everything.
- **Secure element / TEE**: Apple **Secure Enclave (SEP)**, Google **Titan M/M2**, Samsung **Knox/eSE**, Qualcomm **SPU**; plus ARM **TrustZone** TEEs (QSEE, Trusty, OP-TEE).
- **PMIC, audio/charger ICs, RF front-end, sensors**, and the **display/touch** controllers.

## Why it matters for data access
- Everything persistent is in eMMC/UFS; RAM holds live keys. **Hardware-bound encryption** means the storage is encrypted with keys fused into the SoC/SE, so a raw chip dump is usually **ciphertext** without the device cooperating.
- That's the central tension in modern mobile forensics: physical access to the chip no longer equals access to the data.

# Boot Chains and Security State

## Android (generic)
```text
BootROM (PBL, in silicon) → verifies → Primary/Secondary bootloader (SBL/XBL, Qualcomm)
→ ARM Trusted Firmware (TF-A, EL3) + TEE → ABL/LK (aboot) → boots Android boot image (kernel + ramdisk)
```
- **Verified Boot (AVB)**: each stage cryptographically verifies the next; `vbmeta` holds hashes/keys. State is reported as **GREEN** (locked, OEM keys), **YELLOW** (locked, custom key), **ORANGE** (unlocked), **RED** (verification failed).
- **Bootloader lock/unlock**: `fastboot flashing unlock` (if the OEM allows it) wipes userdata and sets ORANGE. Unlocking is the gateway to custom firmware, but it also **factory-resets** the device (a deliberate anti-forensic/anti-theft measure).
- **Partitions** (GPT): `boot`, `vbmeta`, `system`/`super` (dynamic partitions: system/vendor/product), `vendor_boot`, `userdata` (encrypted), `metadata`, `persist`, `modem`, `dtbo`, A/B slots (`_a`/`_b`) for seamless updates.

## iOS
```text
Boot ROM (SecureROM) → iBoot → kernelcache → iOS; SEP boots in parallel
```
- A full **chain of trust** from SecureROM, personalised per device (**APTicket/SHSH**) so images can't be downgraded or swapped. The **Secure Enclave** manages keys and biometrics independently of the Application Processor.
- Much harder to get into than Android; see the Secure Boot module for what research-grade access (e.g. the checkm8 BootROM exploit on A5–A11) does and doesn't give.

# Device Access Modes and Recovery

## Android
- **ADB** (Android Debug Bridge): over USB (or TCP) when USB debugging is enabled and the host is authorised. `adb shell`, `adb pull`, `adb backup` (deprecated), `adb logcat`. Needs the screen unlocked and the key accepted; not available on a cold locked device.
- **Fastboot/bootloader mode**: `fastboot devices`, `getvar all`, `flash`, `boot`. Limited on locked devices.
- **Recovery** (stock or custom like TWRP): flashing, sometimes a shell. A custom recovery usually needs an unlocked bootloader.
- **Download/EDL modes**:
  - **Qualcomm EDL** (Emergency Download, 9008): a low-level mode that loads a signed **firehose** programmer to read/write storage. Powerful, but modern devices require **signed, OEM-specific** loaders, which limits unauthorised use.
  - **MediaTek BROM/Preloader** (SP Flash Tool, mtkclient): similar low-level flashing; historically BROM vulnerabilities (Kamakiri) enabled bypasses on older chips.
  - **Samsung Download Mode (Odin/Heimdall)**, **Unisoc/Spreadtrum**, etc.

## iOS
- **Recovery mode** and **DFU** (Device Firmware Upgrade): restore/update via a trusted host; images must be personalised by Apple's signing server (`tsschecker` concepts). No general file access without the passcode.

> [!note] The practical reality: **modern, updated, locked phones are very hard to extract**. Full-disk/file-based encryption tied to hardware keys and a passcode (with Secure Enclave rate-limiting) means brute force is throttled and chip-off yields ciphertext. This is by design.

# Mobile App Reverse Engineering

This is where a lot of accessible, legal learning happens (on apps and devices you own).

## Android: APK analysis
- An **APK** is a ZIP: `AndroidManifest.xml` (binary XML; permissions, components, exported activities/services), `classes*.dex` (Dalvik bytecode), `lib/<abi>/*.so` (native libraries), `resources.arsc`, assets.
- **Static**: `apktool` (decode manifest/resources, smali), **jadx**/jadx-gui (DEX → readable Java), **Ghidra**/IDA for the native `.so` files. Look at exported components, deep links, WebView usage, crypto, and the network layer.
- **AAB/Split APKs**, **DEX in app bundles**, and obfuscation (**R8/ProGuard** rename; **DexGuard**/commercial protectors, string encryption, native packers) complicate things.
- **Dynamic**: **Frida**/objection to hook methods, bypass **SSL pinning** and **root detection**, dump decrypted strings/classes; **Magisk** (root) + a rooted test device or emulator; **mitmproxy/Burp** for the API; **Drozer** for IPC/component testing.

## iOS: IPA analysis
- An **IPA** is a ZIP containing `Payload/App.app` with a Mach-O binary, `Info.plist`, resources, embedded provisioning profile and entitlements. App Store binaries are **FairPlay-encrypted** (decrypt by dumping from a jailbroken device, e.g. frida-ios-dump).
- Tools: **class-dump**/`otool`/Hopper/Ghidra for the binary, **Frida**/objection, **Cycript** (legacy), **Keychain-Dumper** (on a device you own). Objective-C has rich runtime metadata (class/method names); Swift is more stripped but still has mangled symbols.

## Common findings (study on your own apps)
Hardcoded secrets/API keys, weak or custom crypto, insecure data storage (plaintext in SharedPreferences/`NSUserDefaults`/SQLite), broken TLS validation, exported components, insecure deep links, and server-side authorization flaws reached through the app. **OWASP MASVS/MASTG** is the reference methodology.

# Chip-Level Data Retrieval and Mobile Forensics

For completeness and for the Forensics track, here's how data is retrieved from mobile storage, in order of invasiveness. Do this only with proper authority and documentation.

## Acquisition tiers
1. **Logical**: via ADB/backup/iTunes backup or MDM, file-level, limited to what the OS exposes. Easiest, least complete.
2. **File-system**: fuller access (e.g. via agent, jailbreak/root, or vendor service), more artifacts.
3. **Physical/full**: a bit-for-bit image of storage. On modern devices this is encrypted; it requires defeating or leveraging the device's security.
4. **Brute force / exploit-assisted**: commercial forensic tools (Cellebrite UFED, GrayKey, MSAB XRY, Oxygen, Magnet) use undisclosed exploits and the on-device crypto to attempt passcode recovery within hardware rate limits. Capabilities vary by model, OS version and lock state (AFU "After First Unlock" vs BFU "Before First Unlock").

## Hardware methods
- **eMMC/UFS ISP** (In-System Programming): wire to test points (CLK/CMD/DAT0/VCC/VCCQ/GND) and read the chip in place with an eMMC reader (easy-JTAG/Medusa-class). Non-destructive-ish; yields ciphertext on encrypted devices.
- **Chip-off**: desolder the eMMC/UFS BGA, read it in an adapter. Fully removes the chip; data is still encrypted on modern phones. Useful on older/unencrypted devices and feature phones, and when the board is damaged.
- **JTAG** (older phones): read memory via the debug port if available/unlocked.

## The AFU/BFU distinction (crucial)
- **BFU** (Before First Unlock, e.g. just powered on): most file-based-encryption keys are not derived yet; very little is accessible.
- **AFU** (After First Unlock): keys for many files are in RAM, so an exploit or agent can read far more. This is why forensic workflows care enormously about device state on seizure (keep it powered, isolated from the network with a Faraday bag, and charged).

> [!warn] Mobile forensics on a device you don't own requires legal authority (warrant, consent, or an authorised engagement). Preserve chain of custody, document everything, isolate the device from networks (Faraday bag) to prevent remote wipe, and don't alter data. The Forensics module covers process and evidence handling.

## Learning path (legal)
Buy a cheap, old Android to unlock, root, flash and chip-off for practice; use the official Android emulator and jailbreakable old iPhones (A11 and earlier) for app RE; study **OWASP MASTG**, "Android Internals" (Levin), "iOS Internals", and SANS FOR585 (mobile forensics) materials. Set up Frida against apps you own, and practise ISP/chip-off on dead phones before anything that matters.
