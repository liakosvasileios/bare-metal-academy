# Why Memory Forensics

RAM holds what the disk never sees: running processes, network connections, injected/fileless malware, decryption keys, clipboard contents, command history, unpacked code, and chat fragments. As attackers move to **fileless** and **in-memory** techniques, and as full-disk encryption hides the disk, **memory is often the most valuable evidence** on a live system.

## What you can find in RAM
- Running and **hidden** processes, their command lines and parents.
- **Network connections** (active and recently closed) and listening ports.
- **Injected code / hollowed processes / shellcode** not present on disk.
- Loaded modules/DLLs and drivers (including unlinked/rootkit ones).
- **Encryption keys** (BitLocker/LUKS/TrueCrypt), passwords, tokens, and session cookies.
- Open handles/files, registry keys cached in memory, console/command history.
- Unpacked or decrypted malware code (defeating on-disk packing).

> [!note] Memory is **volatile and changing**: acquisition is a smear across a short time window, and it alters state slightly. Capture it **early** in live response (order of volatility), before shutting down or doing disk work.

# Acquiring Memory

The goal is a faithful dump of physical RAM with minimal footprint, then analysis offline.

## Windows
- **WinPmem** (open, from the Rekall/Velociraptor lineage), **Magnet RAM Capture**, **FTK Imager** (Capture Memory), **DumpIt** (Comae), **Belkasoft RAM Capturer**.
- Output a raw image (and ideally capture the **pagefile**/`hiberfil.sys` too, for paged-out data).
- Run from trusted, read-only media; record tool/version/hashes.

## Linux
- **AVML** (Microsoft, statically linked, portable), **LiME** (Loadable Kernel Module producing `lime` format). `/dev/mem`/`/proc/kcore` are restricted on modern kernels, so a module/tool is needed.
- You generally need a **matching kernel profile** (symbols) to analyse, build it with `dwarf2json` from the target kernel's debug info / `System.map`.

## macOS
- Harder due to SIP/kernel protections; options include **osxpmem** (older) and vendor tools. Often constrained by OS version.

## Virtual machines and hibernation
- **VM snapshots/saved states** (`.vmem`, `.vmsn`, VMware; `.vmrs`/`.bin`, Hyper-V; `.sav`) are effectively memory images, acquire RAM by snapshotting a VM.
- **Crash dumps** (`MEMORY.DMP`, minidumps) and **hiberfil.sys** (compressed RAM at hibernation) are also analysable memory sources.

> [!warn] Acquire memory only with authority, and prefer the least-intrusive method. Document that acquisition changes some state (the tool's own footprint). On an encrypted machine, RAM may hold the only copy of the key, don't power off before capturing if lawful and feasible.

# Volatility: The Standard Framework

**Volatility 3** (and the older Volatility 2) is the open-source standard for memory analysis. It parses OS structures out of a raw dump.

## Volatility 3 basics
```sh
# Identify / list processes (v3 auto-detects the profile via symbol tables)
vol -f mem.raw windows.info
vol -f mem.raw windows.pstree            # process tree (spot odd parents)
vol -f mem.raw windows.pslist            # active processes (EPROCESS list walk)
vol -f mem.raw windows.psscan            # pool scan: finds hidden/terminated procs
vol -f mem.raw windows.cmdline           # process command lines
vol -f mem.raw windows.netscan           # network connections/sockets
vol -f mem.raw windows.dlllist / ldrmodules   # loaded modules; detect unlinked
vol -f mem.raw windows.malfind           # injected RWX private memory (shellcode)
vol -f mem.raw windows.handles / filescan / dumpfiles
vol -f mem.raw windows.registry.hivelist / printkey
vol -f mem.raw windows.svcscan / windows.modules / windows.ssdt
vol -f mem.raw linux.pslist / linux.bash / linux.check_syscall   # Linux plugins
```
- **pslist vs psscan**: pslist walks the active `EPROCESS` linked list; **psscan** scans the pool for `EPROCESS` signatures, so it finds processes **unlinked by DKOM rootkits** or already exited. Diffing the two reveals hiding.
- **MemProcFS** mounts a memory image as a **virtual file system** you can browse (processes as folders), a very approachable alternative/complement.

## Profiles and symbols
- Volatility 3 uses **symbol tables** (ISF JSON). Windows symbols download automatically; **Linux/macOS need a symbol table built** from the exact kernel (via `dwarf2json`). Getting this right is the usual beginner hurdle on Linux.

# Finding Malware and Injection in Memory

## Code injection techniques and their traces
- **Classic DLL injection**: `LoadLibrary` in a remote thread → the DLL appears in the module list but may be path-anomalous. `dlllist`/`ldrmodules` (a module in VAD but not in all three PEB lists = suspicious).
- **Reflective DLL / manual mapping**: no entry in the loader lists; shows as private executable memory.
- **Process hollowing**: a legitimate process (e.g. svchost) is created suspended and its image replaced, mismatched image path vs on-disk, odd memory protections.
- **Shellcode / injected RWX**: **`malfind`** finds private, executable, non-file-backed VADs (the heuristic from the OS module). Often starts with recognisable stubs (`MZ`, or shellcode prologues).
- **APC / thread hijacking / CreateRemoteThread**: look at threads with start addresses outside any module.

## Triage workflow
1. `pstree`/`pslist` + `psscan` (diff for hidden procs); check parents and paths against the known-good tree (OS module).
2. `cmdline`, `netscan` (C2 connections), `malfind` (injection), `ldrmodules` (hidden DLLs), `svcscan`, `modules`/`driverscan` (rootkits).
3. **Dump** suspicious regions/processes (`windows.dumpfiles`, `memmap`/`vaddump`, `procdump`) and analyse statically (Binaries/Debugging modules) or scan with YARA.
4. Extract **strings**, IPs/URLs/registry keys, and **credentials** (see below).
5. Correlate with disk artifacts (Artifacts module) and build a timeline.

## YARA against memory
Run **YARA** rules across the dump or per-process to flag known malware families, packers, and C2 strings (`vol ... yarascan`, or yara on dumped regions). Pairs well with threat-intel rule sets.

# Keys, Credentials and Anti-Forensics

## Secrets in RAM
- **Disk-encryption keys**: tools can recover **BitLocker** (FVEK), **LUKS/dm-crypt**, **TrueCrypt/VeraCrypt** keys from a memory image (e.g. aeskeyfind/bulk_extractor key scanners, Volatility plugins, Elcomsoft). This, plus cold boot (Architecture module), is why RAM capture matters for encrypted machines.
- **Windows credentials**: **LSASS** memory holds hashes, and sometimes cleartext/Kerberos tickets. Volatility's `hashdump`/`lsadump`/`cachedump` and tools like **mimikatz** (read from a dump with its minidump mode) extract them. Credential Guard (VBS) protects these on modern systems by isolating LSASS secrets in VTL1.
- **Other**: cached registry secrets (LSA secrets), passwords in process memory, session tokens/cookies, SSH keys, and command/console history (`cmdscan`/`consoles`, `linux.bash`).

## Anti-forensics to be aware of
- **DKOM** (unlinking EPROCESS/modules), **direct kernel object hiding**, and **rootkits** that hook the SSDT/IDT/IRP tables, detect by scanning (psscan) and checking hook tables (`ssdt`, `callbacks`, `driverirp`).
- **Anti-memory-acquisition**: some malware detects/obstructs acquisition tools; using a kernel-level or hypervisor-level capture reduces this.
- **In-memory-only / fileless** malware: by definition it leaves little on disk, memory forensics is often the *only* way to catch it, reinforcing why you capture RAM.
- **Timestomping/log clearing** on disk is countered by memory and multiple-artifact corroboration.

# Practising Memory Forensics

## The learning loop
1. Acquire RAM from a **VM you control** (snapshot it), ideally after running benign "suspect" activity (open a browser, map a drive, run Sysinternals tools).
2. Analyse with Volatility 3 / MemProcFS: enumerate processes, connections, and command lines, and confirm they match what you did.
3. Then use **known-malware memory samples** from public datasets to practise detecting injection and C2 safely (never run live malware outside an isolated lab).

## Public practice resources (legal)
- **Volatility sample images** and the Volatility Foundation's documentation and plugins.
- **MemLabs** (CTF-style memory challenges), **DFIR/CTF memory images**, **Ali Hadi's Challenge #X** memory sets, and SANS **FOR508/FOR532** materials.
- The book **"The Art of Memory Forensics"** (Ligh, Case, Levy, Walters) is the canonical reference.

## Fitting into the bigger picture
Memory forensics closes the loop with everything else in this track: it recovers **keys** that unlock encrypted disks (Storage), reveals **injected code** absent from disk (Binaries/OS), confirms **execution and network** facts for the timeline (Artifacts/Forensics), and captures the live state of the very low-level systems (processes, page tables, kernel objects) you studied in the Architecture and OS modules. Together they let you reconstruct, soundly and defensibly, what a machine was actually doing.

> [!lab] Capstone: snapshot a Windows VM, run a benign simulated-intrusion script (e.g. Atomic Red Team tests you understand, in an isolated VM), capture RAM with WinPmem, and use Volatility 3 to (1) build the process tree and spot the anomaly, (2) find the network connection, (3) run malfind, (4) dump the suspect process and scan it with YARA, and (5) write a short report correlating the memory findings with disk artifacts. That exercise ties the whole DFIR track together, entirely on systems you own.
