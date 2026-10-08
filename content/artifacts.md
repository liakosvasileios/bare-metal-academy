# Windows Registry Forensics

The registry is a hierarchical database of configuration and, for the forensic examiner, a record of user and system activity. It's stored in **hive** files.

## Hive files and where they live
| Hive | On disk | Holds |
|---|---|---|
| SYSTEM | `%SystemRoot%\System32\config\SYSTEM` | services, drivers, **current control set**, timezone, USB devices, computer name |
| SOFTWARE | `...\config\SOFTWARE` | installed software, OS version, network, autoruns |
| SAM | `...\config\SAM` | local user accounts, login counts, last login |
| SECURITY | `...\config\SECURITY` | policy, LSA secrets |
| NTUSER.DAT | `C:\Users\<u>\NTUSER.DAT` | per-user settings and activity |
| UsrClass.dat | `...\AppData\Local\Microsoft\Windows\UsrClass.dat` | per-user class data (shellbags!) |
| Amcache.hve | `...\AppCompat\Programs\Amcache.hve` | executed/installed programs, SHA-1 of binaries |

Live roots: HKLM (SYSTEM/SOFTWARE/SAM/SECURITY), HKU/HKCU (NTUSER). Tools: **Registry Explorer/RECmd** (Zimmerman), RegRipper, Autopsy.

## High-value keys (activity evidence)
- **Run/RunOnce** (`...\CurrentVersion\Run`) and many other **autorun/persistence** locations → malware persistence.
- **USBSTOR** / **USB** (SYSTEM) and **MountedDevices**, **Windows Portable Devices** → history of connected USB storage (vendor/product/serial, first/last connect via related keys). Central to data-exfiltration cases.
- **UserAssist** (NTUSER) → GUI programs the user ran, with run counts and last-run time (ROT13-encoded names).
- **ShellBags** (UsrClass) → folders the user browsed (including now-deleted/removed volumes), proving knowledge of a folder's existence.
- **RecentDocs**, **TypedPaths**, **RunMRU**, **OpenSavePidlMRU** → recently opened files, typed Explorer paths, Run-dialog history.
- **AppCompatCache (ShimCache)** (SYSTEM) and **Amcache** → evidence of program execution/presence (paths, sometimes timestamps/hashes).
- **TimeZoneInformation** (SYSTEM) → essential to interpret all other timestamps.

> [!tip] Registry timestamps are **key last-write times** (FILETIME). Combine them with the key's values carefully, the last-write time tells you when the key changed, which for many activity keys approximates when the action happened.

# Program Execution and File-Access Artifacts

Proving **what ran** and **what was opened** is a recurring task. No single artifact is definitive; you corroborate several.

## Evidence of execution (Windows)
- **Prefetch** (`C:\Windows\Prefetch\*.pf`, magic `SCCA`/`MAM` compressed): per-executable files recording **run count**, **last 8 run times**, and files/directories the program loaded. Strong "this ran, this often, at these times." (Disabled on some servers/SSD-era configs.)
- **Amcache.hve** / **ShimCache**: presence and execution of binaries (paths, SHA-1 in Amcache).
- **UserAssist**: GUI execution per user.
- **SRUM** (`...\sru\SRUDB.dat`): System Resource Usage Monitor, app + network data usage per process/user over ~30–60 days — great for bytes-sent (exfil) and app-run timelines.
- **BAM/DAM** (Background/Desktop Activity Moderator, SYSTEM): last run time of executables per user.
- **Windows Event Logs** (below): 4688 process creation, Sysmon Event ID 1.
- **Jump Lists** and **LNK** files (below) also imply execution/opening.

## File knowledge / opening
- **LNK (shortcut) files** (`Recent`, Desktop): auto-created when a file is opened; embed the **target path, size, volume serial, and timestamps** of the target, surviving even if the target is deleted/removed media.
- **Jump Lists** (`AutomaticDestinations`/`CustomDestinations`): per-application recent items (an OLE/compound file of embedded LNKs).
- **ShellBags**, **RecentDocs**, **Office MRU**, browser downloads.
- **Thumbnail/Icon caches** (`thumbcache_*.db`): thumbnails persist after the original image is deleted.

## Recycle Bin
`$Recycle.Bin\<SID>\` holds `$I` files (original name, path, deletion time, size) and `$R` files (the recovered content). Deleted-but-not-purged files are fully recoverable here with their original metadata.

# Timelines, Logs and the $MFT/USN

## Windows Event Logs (EVTX)
`C:\Windows\System32\winevt\Logs\*.evtx` (magic `ElfFile`). Key logs/IDs for DFIR:
- **Security**: 4624 logon (type 2 interactive, 3 network, 10 RDP), 4625 failed logon, 4634/4647 logoff, 4688 process creation, 4672 special privileges, 4720 account created, 4698 scheduled task created.
- **System**: 7045 service installed (common for malware/BYOVD), 7035/7036 service control, 6005/6006 event-log start/stop (boot/shutdown).
- **Sysmon** (if installed): 1 process create (with command line + hashes), 3 network connect, 7 image load, 8 CreateRemoteThread, 11 file create, 13 registry, 22 DNS, invaluable.
- **RDP/Terminal Services**, **PowerShell** (4104 script block logging), **WMI**, **Windows Defender** logs.
Parse with **EvtxECmd**, `python-evtx`, or a SIEM. Watch for **cleared logs** (1102 security log cleared / 104 system).

## Filesystem timeline sources
- **$MFT** (SI + FN MACB timestamps), **$UsnJrnl:$J** (recent file changes even for deleted files), **$LogFile**.
- **MACB**: Modified, Accessed, (MFT-)Changed, Born/created. Interpretation varies by action (copy vs move vs create). Beware **$STANDARD_INFORMATION timestomping** (compare with $FILE_NAME).

## Super timelines
**plaso** (`log2timeline.py` → `psort.py`) ingests the filesystem, registry, EVTX, browser, LNK, prefetch and more into one normalised, time-sorted CSV/DB. The **timeline is usually the backbone of an investigation** — but you must normalise **time zones** and watch for clock skew.

> [!warn] Timestamps lie more than anything else: time zone (from the SYSTEM hive), DST, UTC vs local, clock skew, timestomping, and tool misinterpretation. Always establish the system's timezone and prefer UTC internally. Corroborate a key time across multiple artifacts.

# Linux, macOS and Browser Artifacts

## Linux artifacts
- **Logs**: `/var/log/` — `auth.log`/`secure` (logins, sudo), `syslog`/`messages`, the **systemd journal** (`journalctl --file <journal>`), `wtmp`/`btmp`/`lastlog` (binary; `last`, `lastb`), `dmesg`.
- **Shell history**: `~/.bash_history`, `~/.zsh_history` (often no timestamps unless `HISTTIMEFORMAT` set).
- **Persistence/exec**: cron (`/etc/crontab`, `/var/spool/cron`, `/etc/cron.*`), systemd units (`/etc/systemd/system`, `~/.config/systemd`), `~/.bashrc`/profile, `/etc/rc.local`, `ld.so.preload`, SSH (`~/.ssh/authorized_keys`, `known_hosts`).
- **Timestamps**: ext4 atime/mtime/ctime/crtime via `stat`/`debugfs`/TSK `istat`.
- **Recent/desktop**: `~/.local/share/RecentDocuments`, GVFS metadata, trash in `~/.local/share/Trash` (with `info/` metadata).

## macOS artifacts
- **Unified Logs** (`/var/db/diagnostics`, read with `log show`), **FSEvents** (`.fseventsd` — file system change history), **spotlight** metadata (`.Spotlight-V100`, `mdls`), **quarantine** (`com.apple.quarantine` xattr → downloaded-file provenance, LaunchServices `QuarantineEventsV2`), **KnowledgeC**/`knowledgeC.db` and **biome** (app usage), **plist** files (preferences; `plutil`), **TCC.db** (privacy permissions).
- Persistence: **LaunchAgents/LaunchDaemons** (`~/Library/LaunchAgents`, `/Library/LaunchDaemons`), login items, cron, config profiles.

## Browser artifacts (cross-platform)
- **Chromium/Chrome/Edge**: SQLite DBs — `History` (urls, visits, downloads), `Cookies`, `Login Data` (encrypted), `Web Data` (autofill), `Top Sites`, `Sessions`, plus the Cache. Timestamps are **WebKit** (µs since 1601, the Lab decodes them).
- **Firefox**: `places.sqlite` (history/bookmarks), `cookies.sqlite`, `formhistory.sqlite`, `logins.json`. Unix-µs timestamps.
- **Safari**: `History.db`, `Downloads.plist`; Cocoa/Mac-absolute timestamps (seconds since 2001).
- Tools: **Hindsight** (Chromium), browser modules in Autopsy/AXIOM, DB Browser for SQLite. Carve deleted SQLite rows from WAL/freelist (`sqlite` recovery, `undark`).

# Putting It Together and Mobile Artifacts

## An artifact-driven investigation
Questions map to artifacts (corroborate, don't rely on one):
- **Did a user log in, when, how?** → Security 4624/4625 (logon type), RDP logs, `wtmp`/`last`.
- **What program ran, when, how often?** → Prefetch + Amcache/ShimCache + UserAssist + SRUM + 4688/Sysmon 1.
- **What files did they open/know about?** → LNK, Jump Lists, ShellBags, RecentDocs, Office MRU.
- **Was data exfiltrated?** → USBSTOR + LNK to removable volumes + SRUM network bytes + browser/upload history + $UsnJrnl.
- **Persistence/malware?** → Run keys, Services (7045), scheduled tasks (4698), startup folders, WMI, Sysmon.
- **When did events happen?** → super timeline (plaso), normalised to UTC with the right timezone.

## Mobile artifacts (overlap with the Mobile module)
Phones are the richest personal-activity record. On an acquired image (lawful access):
- **SQLite everywhere**: SMS/iMessage (`sms.db`), call history (`CallHistory.storedata`), contacts (`AddressBook.sqlitedb`), WhatsApp/Signal/Telegram DBs (often encrypted), browser, notes, maps.
- **iOS**: the backup/`Manifest.db` structure, `knowledgeC.db`/biome (device usage), location (`cache_encryptedB`/significant locations), `KnowledgeC`, health, Spotlight. Timestamps often Cocoa/Mac-absolute.
- **Android**: app `/data/data/<pkg>` databases and shared prefs, `usagestats`, `contacts2.db`, logcat, accounts, Wi-Fi configs.
- Tools parse these automatically (Cellebrite PA, AXIOM, Oxygen), but understanding the underlying SQLite/plist lets you verify and recover deleted rows.

> [!lab] Capstone on a practice image (Digital Corpora/CFReDS): answer "who used this computer, what did they run, what did they plug in, what did they open, and when" — and build a one-page timeline where every row cites an artifact (prefetch path, registry key + last-write, LNK target, EVTX record ID), all normalised to UTC. Cross-check one program-execution claim across Prefetch and Amcache. That exercise exercises nearly every artifact above.
