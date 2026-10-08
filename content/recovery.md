# Data Recovery: Principles and Triage

Data recovery and digital forensics overlap heavily in technique but differ in goal: recovery wants the **data back**; forensics wants the data back **plus provenance and integrity**. Both start the same way: **don't make it worse, and work on a copy.**

## The golden rules
1. **Stop using the media** the moment you realise data is lost (unmount it). Continued writes (or TRIM on SSDs) destroy recoverable data.
2. **Assess the failure type** (Storage module): logical, firmware, electronic, or mechanical. Mechanical/clicking → cleanroom pro, don't DIY.
3. **Image first, then work on the image.** Never run recovery tools against the failing original.
4. For failing media, **image gently and in the right order** (ddrescue, below).
5. Keep notes, hashes, and photos; label everything.

## Triage decision tree
```text
Media recognized by OS?
├─ No  → PCB/electronic or firmware fault, or dead controller → specialist/service tools
└─ Yes → SMART healthy?
         ├─ No (pending/uncorrectable sectors) → image NOW with ddrescue (fast pass first)
         └─ Yes → logical loss (deleted/format/corrupt)
                  → image, then undelete / rebuild FS / carve
Encrypted?  → you need the key/passphrase first; image the ciphertext meanwhile.
```

> [!warn] The most common way people lose recoverable data is by "trying things" on the original: running chkdsk/fsck (which writes), reformatting, reinstalling, or letting the OS keep using an SSD so TRIM wipes the evidence. Image first.

# Imaging: Making a Faithful Copy

## Healthy media
```sh
# Raw image with progress and a hash, through a write blocker:
dd if=/dev/sdX of=disk.img bs=4M conv=noerror,sync status=progress
# Better: a forensic imager that hashes as it reads
ewfacquire /dev/sdX        # → E01 (compressed, with metadata + hashes)
dc3dd if=/dev/sdX hof=disk.img hash=sha256 log=acq.log
```
Verify: the tool records a source hash; re-hash the image and compare.

## Failing media: ddrescue (the essential tool)
`ddrescue` (GNU) images drives with bad sectors **intelligently**: it grabs all the easy data first, keeps a **mapfile** of what's done, then retries the hard spots, so you rescue the maximum before a dying drive gives out.
```sh
# Pass 1: fast, skip errors, save the map (so you can resume)
ddrescue -n /dev/sdX rescue.img rescue.map
# Pass 2: retry bad areas a few times, trimming/scraping
ddrescue -r3 /dev/sdX rescue.img rescue.map
```
- `-n` (no-scrape) first to get the bulk quickly; then retries. The mapfile lets you stop/resume and even swap approaches.
- For drives that drop off or overheat, image in short sessions; consider reading in reverse for certain head issues. Severe cases → professional with a hardware imager (PC-3000, DeepSpar) that controls the drive at the firmware level and handles head maps/timeouts.

> [!note] `ddrescue` ≠ `dd_rescue` (a different, older tool). Use GNU **ddrescue**. Always rescue **to a file on a healthy disk**, never drive-to-drive without a map, and never write back to the failing drive.

# Logical Recovery: Undelete and File-System Repair

Once you have an image, recover without carving when the file system is still partly intact, you get **filenames and structure** that carving loses.

## Approaches
- **Rebuild/repair the partition table or boot sector**: `testdisk` scans for lost partitions and VBRs and rewrites a correct table; it can also copy files off found partitions read-only.
- **Undelete** using residual metadata: tools read the $MFT/FAT directory/inode remnants to restore recently deleted files with their original names and paths. Tools: The Sleuth Kit (`fls -rd` to list deleted, `icat` to extract), `ntfsundelete`, `extundelete`/`ext4magic`, PhotoRec's sibling `TestDisk`, R-Studio, UFS Explorer, Recuva (consumer).
- **Mount read-only and copy**: if the FS mounts, copy data off (read-only!) before deeper work.

## The Sleuth Kit (TSK) workflow
```sh
mmls disk.img                 # partition layout + offsets
fsstat -o 2048 disk.img       # file system details
fls -r -o 2048 disk.img       # list files (deleted marked with *)
icat -o 2048 disk.img 12345 > recovered.bin   # extract by inode/MFT number
```
Autopsy is the GUI front-end for TSK and automates much of this.

# File Carving: Recovery Without a File System

When metadata is gone (reformat, corrupted FS, raw unallocated space, carving a NAND dump), **carving** reconstructs files from their **content signatures** alone.

## How it works
- **Header/footer carving**: scan for known start signatures (JPEG `FF D8 FF`, PNG `89 50 4E 47`, PDF `%PDF`, ZIP/Office `PK\x03\x04`, SQLite `SQLite format 3`) and known ends (JPEG `FF D9`), then extract between them. The Lab's File analyzer shows these signatures across an image.
- **Size/structure-aware carving**: for formats with length fields or internal structure (MP4/`ftyp` boxes, ZIP central directory), parse to find the real end, more accurate than header/footer.
- Tools: **PhotoRec** (huge format support, the go-to free carver), **Scalpel**, **Foremost**, **bulk_extractor** (carves emails, URLs, credit-card numbers, and more via scanners, great for triage).

## Limits
- **Fragmentation** is the enemy: carving assumes files are contiguous. A fragmented file carves as garbage or truncated. SmartCarving/`bifragment gap carving` and tools like PhotoRec handle some cases; heavy fragmentation needs FS metadata.
- **No filenames or timestamps** (unless embedded in the file, e.g. EXIF in JPEGs, which bulk_extractor/exiftool extract).
- Lots of **false positives** and partial files; expect to sift results.

> [!tip] Practical combo: run `testdisk`/TSK first for structured recovery (names + order), then carve the **unallocated space** (extract it with `blkls`/`tsk_recover`) with PhotoRec to catch what's left. Use `bulk_extractor` for a fast content triage (what *kinds* of data are present).

# NAND, Chip-Off and RAID Reconstruction

## NAND / flash reconstruction
Recovering from a **raw NAND dump** (chip-off from a phone, SSD, or dead controller) is advanced:
1. **Read the raw NAND** (programmer + adapter), including the **spare/OOB** area.
2. **ECC-correct** and **remove ECC bytes**; **de-interleave** data spread across planes/dies; strip/relocate the OOB.
3. **Reverse the FTL** to map physical pages back to logical order (controller-specific; the hardest step).
4. Then you have a logical image to run a file system / carving against.
Tools: VNR (Visual NAND Reconstructor), NAND-specific features in commercial suites, and lots of manual work. On modern **encrypted** SSD/eMMC, you also need the key (often impossible), see the Storage/Mobile modules.

## RAID reconstruction
To rebuild a RAID array from member disks you must recover the parameters:
- **Level** (0 stripe, 1 mirror, 5 single-parity, 6 dual-parity, 10 stripe-of-mirrors), **stripe/block size**, **disk order**, **parity rotation**, and **start offset**.
- Image each member first. Then determine parameters (metadata from mdadm/LVM/hardware controllers, or by analysing the data) and virtually reassemble with `mdadm --assemble`, UFS Explorer, R-Studio, or ReclaiMe.
- RAID 5 can survive one missing disk (rebuild from parity); RAID 0 loses everything if one disk dies. Note: a degraded array that kept running may have **stale** data on a previously-failed member.

> [!warn] Never let a hardware RAID controller "auto-rebuild" onto a disk you're trying to recover, it can overwrite the data you want. Image members and reconstruct virtually.

# Choosing Tools and When to Stop

## Software toolkit (most jobs)
- **Imaging**: ddrescue (failing), dd/dc3dd/ewfacquire (healthy, forensic).
- **FS recovery**: TestDisk, The Sleuth Kit/Autopsy, ntfsundelete, extundelete/ext4magic, UFS Explorer, R-Studio, DMDE.
- **Carving/triage**: PhotoRec, Scalpel, Foremost, bulk_extractor.
- **Inspection**: a hex editor (ImHex/010/HxD), `strings`, the Lab's File analyzer.

## Hardware / professional territory
- **PC-3000**, **DeepSpar DDI** (firmware-level drive control, head maps, bad-drive imaging), cleanroom head/platter work, NAND programmers + VNR, and donor-part matching. This is a trade in itself; for irreplaceable data on a mechanically failing drive, the right move is often a reputable recovery lab.

## When to stop and escalate
- Clicking/grinding/burning smell, or the drive isn't detected → **stop**, send to a pro.
- Each additional read on a dying drive lowers your odds; one careful ddrescue pass beats ten panicked retries.
- Encrypted media without the key → recovery of plaintext isn't possible by imaging; focus on obtaining the key.

> [!lab] Build skills on expendable media you own: (1) `dd` an old USB stick, delete files, recover with TestDisk (named) and PhotoRec (carved), compare results. (2) Make a corrupted-partition scenario (`dd` zeros over sector 0 on a scratch image) and rebuild it with TestDisk. (3) Create a small software RAID with loopback files, fail one, and reassemble. Never practise on the only copy of anything that matters.
