# Partitioning: MBR and GPT

Before a file system, a disk is divided into **partitions**. The partition scheme lives in the first sectors and tells the OS where volumes start and end, prime forensic real estate.

## MBR (Master Boot Record) — legacy
- **Sector 0** (512 bytes): 446 bytes of boot code, a **partition table** of 4 entries (16 bytes each), and the signature **`55 AA`** at offset 0x1FE.
- Each entry: status, CHS start, **type byte** (0x07 NTFS/exFAT, 0x83 Linux, 0x0C FAT32 LBA, 0xEE GPT protective), LBA start, sector count.
- Limits: max 4 primary partitions (or 3 + an **extended** partition holding logical drives in a linked list), and ~2 TiB max due to 32-bit LBA.

## GPT (GUID Partition Table) — modern
- Part of UEFI. Layout: a **protective MBR** (sector 0, one 0xEE entry so legacy tools see a full disk), the **GPT header** (sector 1, signature **`EFI PART`** = `45 46 49 20 50 41 52 54`), then the partition entry array (usually 128 entries).
- Each entry has a **type GUID** (e.g. EFI System Partition, Microsoft Basic Data, Linux filesystem) and a unique **partition GUID**, plus start/end LBA and a name.
- **Backup GPT** at the end of the disk (header + array) allows repair. CRC32s protect the header and array.
- Supports huge disks and many partitions. The **EFI System Partition (ESP)** is FAT32 and holds bootloaders.

> [!tip] When a disk "won't mount," check sector 0/1 by hand (the Lab's File analyzer flags `55 AA` and `EFI PART`). A wiped or corrupt partition table doesn't erase the file systems, tools like `testdisk`, `gpart`, and partition carving find and rebuild them from the volume boot records.

# FAT and exFAT

## FAT12/16/32
Simple, universal (SD cards, USB sticks, ESP, cameras). Structure:
```text
[Reserved: Boot Sector (VBR) + FSInfo] [FAT 1] [FAT 2 (copy)] [Root dir (FAT12/16)] [Data region: clusters]
```
- The **boot sector** (BPB, BIOS Parameter Block) defines sector size, **cluster** size (sectors per cluster), FAT count and locations. Jump code starts `EB xx 90`.
- The **FAT** is an array mapping each cluster to the next in a file's chain (or EOC / free / bad). Follow the chain to read a file.
- **Directory entries** (32 bytes): 8.3 name, attributes (RO/Hidden/System/Volume/Dir/Archive), create/access/write timestamps, **starting cluster**, size. **LFN** (Long File Name) entries precede the short entry for long names.

### Deletion in FAT
Deleting marks the directory entry's first byte **`0xE5`** and frees the FAT chain, but **leaves the data clusters intact** and the starting cluster + size in the entry. Recovery: reset the first byte and follow the (possibly now-ambiguous) chain. Fragmented files are harder because the freed FAT chain no longer links the pieces.

## exFAT
For large SD cards/flash (>32 GB, >4 GB files). No more tiny-cluster/size limits, a single FAT, a cluster **bitmap** for allocation, an **up-case table**, and no second FAT by default. Deleted entries clear an "in use" flag; recovery is similar in spirit to FAT.

> [!note] FAT's **4 GiB per-file limit** (32-bit size field) is why big video files fail to copy to a FAT32 stick, use exFAT or NTFS. This limit shows up constantly in the field.

# NTFS

Windows' primary file system. Everything is a file, including the metadata, described in the **Master File Table ($MFT)**.

## Key structures
- **$Boot** (VBR): OEM ID `NTFS    `, BPB, and the cluster location of the $MFT.
- **$MFT**: an array of **1024-byte records**, one per file/dir (magic **`FILE`**). Each record is a set of **attributes**:
  - `$STANDARD_INFORMATION` (**SI**): timestamps, flags.
  - `$FILE_NAME` (**FN**): name + a second set of timestamps + parent reference.
  - `$DATA`: the file content. Small files are **resident** (stored inside the MFT record!); larger files are **non-resident**, described by **data runs** (extent lists: cluster offset + length).
  - `$INDEX_ROOT`/`$INDEX_ALLOCATION`: directory B-tree entries.
- **ADS** (Alternate Data Streams): extra named `$DATA` streams (`file.txt:hidden`). Used legitimately (Zone.Identifier "mark of the web") and by malware to hide data.

## Timestamps and $MFT forensics
NTFS keeps **8 timestamps** per file: SI and FN each have Created/Modified/MFT-changed/Accessed (the "MACB" set ×2). **Timestomping** (anti-forensics) usually alters the SI timestamps (which Explorer shows) but not the FN ones, so SI earlier than FN, or sub-second zeros, is a red flag. Tools: `MFTECmd`, `analyzeMFT`, Autopsy.

## The journals
- **$LogFile**: a transaction journal for crash consistency, holds recent metadata operations.
- **$UsnJrnl:$J** (Update Sequence Number journal): a log of changes to files (create/delete/rename/write) with timestamps, an excellent record of recent activity even for now-deleted files.
- **$Bitmap** tracks cluster allocation.

### Deletion in NTFS
The MFT record is marked not-in-use and the clusters freed in $Bitmap, but the record and data often persist until reused, so recently deleted files are frequently recoverable from the MFT alone. The USN journal may still name files that are entirely gone.

# ext4, APFS, HFS+ and Others

## ext2/3/4 (Linux)
- **Superblock** (at offset 1024, magic **`0x53 0xEF`** at +0x38) describes the volume; backup superblocks exist.
- Space is split into **block groups**, each with inode and block bitmaps and an inode table.
- **Inodes** hold metadata (mode, uid/gid, size, timestamps, block pointers). ext4 uses **extents** (contiguous ranges) instead of indirect block pointers, and adds **journaling** (`jbd2`), larger timestamps with nanoseconds, and `htree` directory indexing.
- **Timestamps**: atime, mtime, ctime (inode change), and ext4's **crtime** (creation). Use `stat`, `debugfs`, `istat` (TSK).
- Deletion: ext3/4 typically **zeroes the block pointers/extents** in the inode on unlink, which makes classic inode-based recovery hard, file **carving** and the journal become the main hope. `extundelete`/`ext4magic` try to use the journal.

## APFS (modern macOS/iOS)
- Copy-on-write, container/volume model (one container, multiple volumes sharing space), **snapshots**, clones, native encryption, nanosecond timestamps. Container magic **`NXSB`**; volume **`APSB`**.
- CoW and snapshots change recovery: old versions may persist in snapshots; metadata lives in checkpointed object maps. Tooling is newer (apfs-fuse, commercial forensic suites).

## HFS+ (older macOS)
- **Big-endian** on-disk. Catalog B-tree, extents overflow file, HFS+ volume header. Timestamps are seconds since **1904** (the Lab decodes this).

## Others you'll meet
- **Btrfs/ZFS**: CoW, checksums, snapshots, pooling (NAS, servers).
- **Embedded/flash FS**: **SquashFS** (read-only, compressed, routers), **JFFS2/UBIFS/YAFFS** (raw NAND), **cramfs**. Covered in the IoT module (extraction with sasquatch/jefferson/ubi_reader).
- **ReFS** (Windows Server), **XFS** (Linux servers), **FAT/exFAT/NTFS** (above).

# What "Deletion" Really Means (and Slack Space)

Understanding deletion and leftover space is the heart of both recovery and forensics.

## Levels of "gone"
1. **Unlink (normal delete / recycle bin empty)**: metadata marked free, data clusters/blocks left on disk. Usually **recoverable** (on HDD/non-TRIM media).
2. **Overwrite**: the clusters get reused by new data → the old content is gone (for that region).
3. **Format**: "quick format" just writes a fresh file-system structure; most data survives. "Full format" may zero the media.
4. **TRIM (SSD)**: the controller discards the LBAs → usually unrecoverable fast (Storage module).
5. **Secure erase / crypto-erase / overwrite passes / degauss / physical destruction**: intentionally unrecoverable.

> [!note] A single overwrite pass is sufficient to prevent recovery on modern drives; the old "35-pass Gutmann" advice is obsolete for today's magnetic recording. For SSDs, use the drive's **secure erase**/crypto-erase, not overwrite passes (wear-leveling means overwrites miss remapped blocks).

## Residual data locations (where deleted/hidden data hides)
- **Unallocated space**: clusters not currently assigned to a file → carve it.
- **File slack**: the gap between a file's real end and the end of its last cluster. **RAM slack** (to the sector end) is zeroed by modern OSes; **drive slack** (remaining sectors) may hold old data.
- **$MFT / inode remnants**, **journals** ($LogFile, $UsnJrnl, ext4 journal), **volume shadow copies** (VSS) and **snapshots** (APFS/Btrfs), **pagefile/hiberfil/swap**, **thumbnail caches**, **registry hives**, **HPA/DCO** and **service area**.
- **Metadata itself** often outlives the file (filenames in the USN journal, prefetch, LNK, recent-docs, see the Artifacts module).

> [!lab] Observe it yourself: on an HDD/USB you own, create a text file with a unique string, delete it, then search the raw device image (`strings image | grep MARKER`, or carve with photorec). It's usually still there. Repeat on a TRIM'd SSD and compare. Then look at file slack by examining the tail cluster of a small file in a hex editor.
