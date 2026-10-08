# Principles of Digital Forensics

Digital forensics is the identification, preservation, analysis and presentation of digital evidence in a way that is **sound, repeatable and defensible**. The technical skills from the rest of this course only count in court (or in a report anyone trusts) if the **process** is right.

## Core principles
- **Integrity**: evidence must not be altered. Prove it with cryptographic **hashing** before and after.
- **Repeatability/reproducibility**: another examiner following your documentation must reach the same result.
- **Documentation**: record what you did, when, with which tools (and versions), and why, contemporaneously.
- **Chain of custody**: an unbroken, documented record of who held the evidence, when, and what they did, from seizure to court.
- **Least intrusive**: prefer methods that change the least; when you must change something (e.g. pulling RAM alters state), document it.

## Guiding standards and doctrine
- **ACPO Principles** (UK, widely cited): (1) don't change data that may be relied upon; (2) if you must access original data, be competent and explain your actions; (3) keep an audit trail a third party could follow; (4) the lead is responsible for compliance.
- **NIST SP 800-86** (integrating forensics into IR), **ISO/IEC 27037** (identification, collection, acquisition, preservation), **27041/27042/27043**, **SWGDE** best practices, and the **Daubert/Frye** standards for admissibility of expert evidence in the US.
- **Locard's exchange principle** (every contact leaves a trace) is the conceptual basis: digital actions leave artifacts.

> [!warn] Authority matters as much as technique. Examine only systems you own or are legally authorised to examine (a warrant, the owner's consent, or a defined engagement/scope). Unauthorised access is a crime regardless of intent. Privacy laws (GDPR and others) also govern handling of personal data in evidence.

# The Forensic Process and Order of Volatility

## Phases
1. **Identification**: what devices/data are relevant; scope and legal authority.
2. **Preservation/Collection**: seize and protect; capture volatile data; isolate from networks.
3. **Acquisition**: make verified forensic images/copies.
4. **Analysis**: examine the copies for relevant artifacts.
5. **Reporting/Presentation**: clear, accurate, defensible documentation and testimony.

## Order of volatility (collect most-perishable first)
When a system is live, data disappears at different rates (RFC 3227):
```text
1. CPU registers, cache                (gone in nanoseconds)
2. RAM: running processes, network connections, keys, clipboard
3. Network state (routing, ARP, open sockets), running services
4. Running processes / kernel state
5. Disk (files, slack, unallocated)
6. Remote logs / monitoring data
7. Physical config, backups, archival media  (most stable)
```
So: capture **RAM and live state before pulling the plug**, when lawful and the situation warrants it. The Memory Forensics module covers RAM acquisition and analysis.

## Live vs dead acquisition
- **Dead/static**: power off (or already off), image the disk with a write blocker. Cleanest integrity, but loses RAM, running malware, and keys for encrypted volumes.
- **Live**: collect from a running system (RAM, logical files, running processes). Necessary for encrypted disks (keys in RAM), fileless malware, and cloud sessions, but it **changes state**, so document tool use and acquire RAM first.
- The encryption era pushes toward **live acquisition**: if you power off a BitLocker/FileVault/LUKS machine without the key, you may get only ciphertext.

# Acquisition, Hashing and Write Blocking

## Imaging (recap + forensic specifics)
- Acquire through a **write blocker** (hardware bridge or verified read-only) or a forensic boot environment (Paladin, CAINE, Tsurugi).
- Formats: **raw/dd** (simple, large), **E01/Ex01** (EnCase: compressed, embedded metadata + hashes, segmented), **AFF4** (modern open container). Tools: FTK Imager, `ewfacquire` (libewf), `dc3dd`, Guymager, Tableau/Falcon imagers.
- Image the **whole physical device** (all sectors, including HPA/DCO), not just a partition, unless scope dictates otherwise.

## Hashing
- Compute a hash of the source **during** acquisition and of the image **after**; they must match. Use **SHA-256** (preferred) and often MD5/SHA-1 alongside for legacy/interoperability.
- **Why MD5/SHA-1 are still used**: forensic hashing proves *integrity of what you copied*, not resistance to a chosen-prefix attacker, so collision weaknesses are largely irrelevant here, though new work should prefer SHA-256.
- **Hash sets**: NSRL (known-good/known software), and curated known-bad sets, let you filter out OS/app files and flag contraband by hash without viewing it.

## Verification and working copies
- Always analyse a **copy/restored image**, never the original. Keep the master image read-only; make working copies.
- Record acquisition logs (tool, version, examiner, date/time, hashes, drive serials, errors).

# Evidence Handling and Reporting

## Chain of custody in practice
A chain-of-custody form tracks each item: unique ID, description, serial numbers, who collected it (when/where), and every subsequent transfer (who, when, why). Store evidence securely (tamper-evident bags, controlled access, logs). Any gap or undocumented access can make evidence inadmissible.

## Anti-contamination and bias
- Use **validated tools** and, where feasible, **cross-validate** key findings with a second tool (e.g. confirm a timeline fact in both Autopsy and a manual parse).
- Beware **confirmation bias**: document what you looked for and what you found, including exculpatory evidence. Dual-tool verification and peer review help.
- Maintain tool **validation records** (known tools produce known results on test data).

## Reporting
A good report is understandable by non-technical readers yet precise enough for an expert to reproduce:
- Scope and authority; items examined; tools and versions; methods.
- Findings tied to evidence (artifact, location/offset, timestamps, hash), separating **fact** from **interpretation**.
- Limitations and assumptions. A timeline is often the backbone.
- Appendices with hashes, logs, and raw artifact exports.

> [!tip] Write findings so each claim is traceable: "file X (SHA-256 …) at $MFT record N, created 2024-03-02 14:11:07 UTC, contained string Y." An opposing expert should be able to open the image and verify it.

# Forensic Platforms and Toolkits

## Suites
- **Autopsy / The Sleuth Kit** (free, open): disk analysis, timelines, keyword search, hash sets, artifact modules. Great to learn on.
- **Magnet AXIOM**, **EnCase**, **FTK**, **X-Ways Forensics** (commercial): full workflows, broad artifact parsing, reporting. X-Ways is lightweight and powerful.
- **Mobile**: Cellebrite UFED/Physical Analyzer, Magnet, MSAB XRY, Oxygen (Mobile module).
- **Memory**: Volatility 3, MemProcFS, Rekall (Memory Forensics module).

## Specialist/targeted tools
- **Timelines**: `log2timeline`/**plaso** → `psort`, Timeline Explorer; **super timelines** merge filesystem + artifacts + logs.
- **Windows artifacts**: Eric Zimmerman's tools (**MFTECmd**, **RECmd/Registry Explorer**, **PECmd** prefetch, **LECmd** LNK, **JLECmd** jump lists, **AmcacheParser**, **EvtxECmd**), KAPE (targeted collection + processing).
- **Carving/triage**: PhotoRec, bulk_extractor (Recovery module).
- **Linux/Mac**: TSK, `log2timeline`, UAC/`avml` (Linux live), macOS artifact parsers.

## Distributions and labs
- Bootable/forensic distros: **CAINE**, **SIFT Workstation** (SANS), **Tsurugi**, **Paladin**, **Kali** (has forensic mode). **REMnux** for malware-focused analysis.
- Build a lab VM with these plus a corpus of **test images** (below) to practise safely.

# Building Skills and Validating Your Work

## Legal, realistic practice data
- **Digital Corpora** (Real Data Corpus, the M57-Patents and Nitroba scenarios), **NIST CFReDS** reference sets, **DFIR CTFs** (Magnet Weekly, DFIR challenges), **Ali Hadi's** and **DigitalCorpora** scenario images, and intentionally-built practice disks.
- These give you full scenarios with known ground truth so you can check whether your process found the right answers.

## Certifications and references (orientation)
- **GIAC GCFE/GCFA** (SANS FOR500/FOR508), **GCFR**, **GREM** (malware), **GNFA** (network), **GASF** (mobile).
- **EnCE** (EnCase), **CCE**, **CFCE** (IACIS), vendor certs (Cellebrite CCO/CCPA, Magnet).
- Books: "File System Forensic Analysis" (Carrier, the canonical FS reference), "Windows Forensic Analysis" and "Windows Registry Forensics" (Carvey), "Practical Forensic Imaging" (Nikkel), "The Art of Memory Forensics".

## Validation mindset
Trust but verify your tools: run them against reference images with known answers, understand *how* an artifact is parsed (so you can explain it), and prefer conclusions that multiple independent artifacts support. A single artifact can be misleading (clock skew, timezone, timestomping, tool bugs); a corroborated timeline is strong.

> [!lab] End-to-end exercise on a practice image (e.g. a NIST CFReDS or Digital Corpora scenario): acquire/verify hashes, build a super timeline with plaso, answer the scenario's questions (what was downloaded, when, by whom), and write a short report where every finding cites its artifact and offset. Then cross-check one key finding with a second tool. This mirrors real casework without touching anyone's real data.
