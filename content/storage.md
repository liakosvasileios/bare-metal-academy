# Hard Disk Drives: Mechanics and Addressing

To recover data and reason about forensics, you need to know how storage physically works and how it can fail.

## Mechanics
An HDD stores bits as magnetic domains on spinning **platters**, read/written by **heads** on an **actuator arm**, floating nanometres above the surface on an air (or helium) bearing.
- **Geometry**: tracks (concentric rings), **sectors** (the smallest addressable unit), cylinders (same track across platters), heads (one per surface). Modern drives present **LBA** (Logical Block Addressing: sector 0..N−1); the old CHS scheme is legacy (the Lab converts both).
- **Sector size**: 512 bytes historically; modern drives are **Advanced Format 4Kn** (4096-byte physical) or **512e** (512-byte emulation over 4K physical). Misaligned partitions on 512e hurt performance and complicate carving.
- **Zones**: outer tracks hold more sectors than inner ones (ZBR), so transfer rate varies across the disk.
- **SMR** (Shingled Magnetic Recording) overlaps tracks like roof shingles for density; rewrites require reading and rewriting whole zones, which makes SMR drives behave oddly (latency spikes) and matters for imaging.

## Hidden areas and firmware
- **HPA** (Host Protected Area) and **DCO** (Device Configuration Overlay): regions the drive can hide from the OS's reported capacity. Forensic tools detect and unlock them (ATA commands) because data can be concealed there.
- **Service area / System Area (SA)**: firmware, defect lists (P-list/G-list), SMART logs, and adaptives live on reserved tracks the OS never sees. Data-recovery pros access it via vendor/service modes (PC-3000).
- **Reallocation**: when a sector goes bad, firmware remaps it to a spare (G-list). The original data may still be physically present but unaddressable normally.

## Failure modes (recovery triage)
- **Logical**: file system/partition damage, deletion, formatting, corruption. Recoverable with software.
- **Firmware**: corrupt service area, bad translator; needs service-mode tools.
- **Electronic**: blown PCB/TVS diode (often from wrong PSU); sometimes a PCB swap (with the ROM/adaptives transferred) revives it.
- **Mechanical**: head crash, seized spindle, bad heads. Requires a **cleanroom**, donor parts, and specialist skill. A clicking drive = stop and send to a pro; powering it repeatedly destroys data.

> [!warn] If a drive is clicking, grinding, or was physically damaged, **stop**. Each spin-up risks more loss. Image it once, carefully, or send it to a professional. Don't open a drive outside a cleanroom.

# SSDs, NAND Flash and the FTL

Solid-state storage has no moving parts and completely different failure/recovery characteristics.

## NAND flash basics
- Data is stored as charge in floating-gate (or charge-trap) cells, organised into **pages** (read/write unit, e.g. 4–16 KB) grouped into **blocks** (erase unit, e.g. 128–512 pages).
- **You can't overwrite in place**: you must **erase a whole block** before rewriting a page. Erases set bits to 1; programming sets them to 0.
- **Cell types**: SLC (1 bit/cell, fastest/most durable), MLC (2), TLC (3), QLC (4, densest/cheapest/least endurance). Each cell type trades endurance and speed for density.
- **Limited endurance**: blocks wear out after a number of program/erase (P/E) cycles (thousands for TLC). **ECC** corrects bit errors; blocks are retired when ECC can't keep up.
- **Each page has a spare/OOB area** for ECC and metadata.

## The Flash Translation Layer (FTL)
The SSD/eMMC controller runs an **FTL** that maps logical block addresses to ever-changing physical locations to:
- **Wear-level** (spread writes evenly), **garbage-collect** (consolidate valid pages and erase stale blocks), remap bad blocks, and do **over-provisioning** (spare capacity).
- Consequence: **the host has no control over physical placement.** A "deleted"/overwritten LBA may still exist in a now-unmapped physical page until GC erases it.

## TRIM — why SSD recovery often fails
When a file is deleted on a TRIM-enabled SSD (common on OSes with SSD support), the OS tells the controller those LBAs are free. The controller then returns zeros (or stale data) for them and erases the pages during GC, **often within seconds to minutes**. So:
- On HDDs, deleted data usually persists until overwritten → good recovery odds.
- On TRIM'd SSDs, deleted data is frequently **unrecoverable almost immediately**. This is one of the biggest practical differences in modern recovery and forensics.

> [!note] Chip-off on an SSD yields raw NAND that is **FTL-scrambled, interleaved across dies, ECC-encoded and sometimes encrypted**. Reconstructing a usable image requires reversing the controller's FTL, which is far harder than HDD recovery and often infeasible without controller-specific tooling.

# Encryption, SMART and Health

## Self-encrypting and encrypted drives
- **SED / OPAL / eDrive**: the drive encrypts everything with an internal key (DEK) protected by an authentication key. A secure erase just discards the DEK (instant "crypto-erase"). Data is unreadable without the key.
- **Host encryption**: BitLocker, FileVault, LUKS/dm-crypt, VeraCrypt sit above the drive. For these, the drive image is ciphertext; you need the passphrase/key (from the user, a TPM, a recovery key, or RAM, see cold boot).
- Implication: encryption flips recovery from "read the platter" to "obtain the key". Document encryption status early in any examination.

## SMART (health monitoring)
Drives track **SMART** attributes you can read with `smartctl` (smartmontools) or CrystalDiskInfo. Forensically and for recovery triage, watch:
- **Reallocated Sector Count**, **Current Pending Sector**, **Offline Uncorrectable**: bad-sector indicators; nonzero/growing = failing.
- **Power-On Hours**, **Power Cycle Count**, **Total LBAs Written** (SSD wear), **Wear Leveling Count / Percentage Used** (SSD life), **Temperature**, **Reallocated Event Count**.
- For an investigation, power-on hours and write counts can corroborate a timeline; for recovery, pending/uncorrectable sectors say "image gently, now".

> [!tip] First actions on an unknown drive for recovery: read SMART (without stressing it), note model/firmware/capacity (check for HPA/DCO), determine encryption status, then make a **forensic image** before any analysis (next module + Recovery module). Never work on the original.

# Removable and Embedded Flash: USB, SD, eMMC, UFS

## USB flash drives
A USB stick = a **USB mass-storage controller + raw NAND** with its own (often cheap, buggy) FTL. Implications:
- Wear-leveling and remapping mean deleted/overwritten data placement is controller-dependent; cheap drives sometimes lack TRIM, so more may persist than on an SSD.
- **Counterfeit/"fake capacity"** drives report a large size but wrap around and corrupt data past the real capacity. Test with **F3** (Linux/Mac) or **h2testw** (Windows) before trusting a drive.
- **BadUSB**: the controller firmware can be reflashed to make the device act as a keyboard/network adapter, a supply-chain/physical-access risk. Treat unknown USB devices with suspicion.

## SD / microSD cards
- SD cards also contain a controller + NAND + FTL (plus their own command protocol over the SD/SDIO bus or SPI mode).
- Classes/speed grades (Class 10, UHS-I/II, U1/U3, V30/V60/V90, A1/A2) describe performance, not data layout.
- **Card lock (CMD42 password)**, write-protect switch (just a host hint, not enforced by the card), and the CID/CSD registers (manufacturer, serial) matter for identification.
- Recovery: image the whole card (`dd`/ddrescue) and carve; for controller-level issues, specialist tools exist but cheap cards are often not worth deep recovery.

## eMMC and UFS (embedded, in phones/tablets/IoT)
- **eMMC**: NAND + controller in one BGA package, exposing a simple MMC interface. Partitions include user data, two **boot partitions**, and **RPMB** (Replay Protected Memory Block, authenticated storage for anti-rollback counters/keys). Read via ISP test points or chip-off (Mobile module). The controller's FTL applies, same scrambling caveats.
- **UFS**: faster, full-duplex (serial, SCSI-like command set) successor in modern phones. Harder to access; also FTL-managed.
- On devices with hardware encryption, raw eMMC/UFS images are ciphertext (see Mobile and Secure Boot modules).

# Interfaces, Imaging Hardware and Write Blocking

## Storage interfaces
| Interface | Where | Notes |
|---|---|---|
| **SATA** | HDD/SSD | AHCI; 6 Gbps |
| **PATA/IDE** | legacy | 40/80-pin ribbon; master/slave jumpers |
| **SAS/SCSI** | enterprise | servers, can read SATA |
| **NVMe** (over PCIe) | modern SSD | M.2 (keying B/M), U.2, AIC |
| **USB bridges** | external | a SATA/NVMe-to-USB chip; UAS vs BOT protocol |
| **eMMC/SD/UFS** | embedded | see above |

M.2 note: a slot/card can be SATA or NVMe; the key (B/M) and the SSD type must match.

## Imaging hardware and write blocking (forensics-critical)
- A **write blocker** (hardware bridge like Tableau/WiebeTech, or OS/software blocking) lets you read a drive while **physically preventing any write**, so you don't alter the evidence. Always acquire through one (or a read-only mount).
- **Forensic duplicators** (Tableau TX1, Falcon, Ditto) image drives at speed with hashing and logging.
- **Adapters** for odd media: USB bridges, mSATA/M.2 adapters, PC-3000 for service-area work, eMMC/UFS readers.
- The **acquisition workflow** (image to E01/AFF4/raw, hash, verify, work on a copy) is covered in the Forensics module; the Recovery module covers imaging *failing* media with ddrescue.

> [!lab] Safe practice: take an old USB stick you own, copy files on, delete some, then image it with `dd`/`ddrescue` and carve the image (Recovery module) to recover the deleted files, observing how much survives on flash vs what TRIM removes on an SSD. Compare SMART on an old HDD vs an SSD with `smartctl -a`.
