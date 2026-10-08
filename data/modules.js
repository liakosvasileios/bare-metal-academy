// Course structure. Each module's lessons live in content/<id>.md (one "# " heading per lesson);
// its questions live in data/questions/<id>.js.
window.QBANK = {};
window.TRACKS = [
  { id: "core", title: "Foundations & Architecture", blurb: "Bits, bytes and how a CPU really executes them." },
  { id: "sw", title: "Assembly & Software RE", blurb: "x86-64, ARM64, operating systems and debugging." },
  { id: "hw", title: "Hardware Hacking & Embedded RE", blurb: "Electronics, buses, tools, IoT, routers, smart home, phones and physical attacks." },
  { id: "dfir", title: "Storage, Recovery & Forensics", blurb: "Drives, flash, file systems, data recovery and digital evidence." },
];
window.MODULES = [
  { id: "foundations", track: "core", icon: "01", title: "Data Representation", summary: "Number bases, two's complement, endianness, bitwise logic, IEEE-754 floats, text encodings and hexdumps." },
  { id: "architecture", track: "core", icon: "CPU", title: "Computer Architecture", summary: "ISAs, pipelines, caches, virtual memory, MMU/TLB, interrupts, DMA, buses, speculative execution and the boot flow." },
  { id: "x86", track: "sw", icon: "x86", title: "x86-64 Assembly", summary: "Registers, flags, addressing, the instruction set, calling conventions, stack frames, syscalls, SIMD and compiler idioms." },
  { id: "arm64", track: "sw", icon: "A64", title: "ARM64 (AArch64) Assembly", summary: "X/W registers, load/store, condition flags, AAPCS64, exception levels, syscalls, PAC/BTI/MTE and NEON." },
  { id: "os", track: "sw", icon: "OS", title: "Operating Systems Internals", summary: "Processes, threads, scheduling, paging, system calls, Linux and Windows internals, drivers and boot." },
  { id: "debugging", track: "sw", icon: "DBG", title: "Debugging & Dynamic Analysis", summary: "GDB, WinDbg, x64dbg, LLDB, breakpoints, tracing, Frida, emulation with QEMU/Unicorn and symbolic execution." },
  { id: "electronics", track: "hw", icon: "Ω", title: "Electronics for Hardware Hackers", summary: "Ohm's law, logic levels, pull-ups, components, PCB anatomy, datasheets, soldering, ESD and safety." },
  { id: "interfaces", track: "hw", icon: "TX", title: "Hardware Interfaces & Protocols", summary: "UART, SPI, I²C, JTAG, SWD, eMMC/SD, USB, CAN and how to identify and speak to them." },
  { id: "hwtools", track: "hw", icon: "TL", title: "Hardware & Software Tooling", summary: "Multimeters, logic analyzers, scopes, flash programmers, debug probes, OpenOCD, flashrom, binwalk, Ghidra and more." },
  { id: "binaries", track: "sw", icon: "ELF", title: "Executable Formats & Software RE", summary: "ELF, PE and Mach-O layout, linking and loading, PLT/GOT, static analysis with Ghidra/IDA, decompilation and packing." },
  { id: "exploitation", track: "sw", icon: "SEC", title: "Memory Safety & Mitigations", summary: "Vulnerability classes (overflow, UAF, type confusion) at a conceptual level, and how ASLR, NX, canaries, RELRO and CFI defend against them." },
  { id: "iot", track: "hw", icon: "IoT", title: "IoT, Router & Firmware RE", summary: "End-to-end methodology: recon, teardown, console access, flash dumping, firmware extraction, emulation and bug hunting." },
  { id: "wireless", track: "hw", icon: "RF", title: "Smart Home & Wireless", summary: "Wi-Fi, BLE, Zigbee, Z-Wave, Thread/Matter, Sub-GHz, SDR, MQTT, cloud APIs and OTA updates." },
  { id: "mobile", track: "hw", icon: "MOB", title: "Smartphone Hardware & Mobile RE", summary: "Android and iOS boot chains, partitions, EDL/BROM, ADB/fastboot, APK/IPA analysis, eMMC/UFS and chip-off." },
  { id: "hwattacks", track: "hw", icon: "FI", title: "Secure Boot, TEEs & Physical Attacks", summary: "Chains of trust, TrustZone, readout protection, fault injection, side channels and countermeasures." },
  { id: "storage", track: "dfir", icon: "HDD", title: "Storage Media Internals", summary: "HDD mechanics and firmware, SSD/NAND, FTL, TRIM, USB flash drives, SD/eMMC/UFS, interfaces and SMART." },
  { id: "filesystems", track: "dfir", icon: "FS", title: "Partitions & File Systems", summary: "MBR, GPT, FAT/exFAT, NTFS, ext4, APFS/HFS+, timestamps and what deletion really does." },
  { id: "recovery", track: "dfir", icon: "REC", title: "Data Recovery", summary: "Triage, imaging failing media, ddrescue, file carving, NAND chip-off reconstruction, RAID rebuilds and tools." },
  { id: "forensics", track: "dfir", icon: "DF", title: "Digital Forensics Process", summary: "Principles, chain of custody, order of volatility, write blocking, imaging formats, hashing, tools and reporting." },
  { id: "artifacts", track: "dfir", icon: "ART", title: "OS & Application Artifacts", summary: "Windows registry, prefetch, event logs, $MFT/USN, Linux and macOS artifacts, browsers, timelines and mobile." },
  { id: "memforensics", track: "dfir", icon: "RAM", title: "Memory Forensics & Incident Analysis", summary: "RAM acquisition, Volatility 3, process/injection analysis, malware triage, YARA and anti-forensics." },
];
