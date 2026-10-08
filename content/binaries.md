# From Source to Binary: Compiling, Linking, Loading

```text
source.c --cpp--> preprocessed --cc1--> assembly (.s) --as--> object (.o) --ld--> executable / .so
                                                                   ^
                                                     static libs (.a), crt startup objects
```

- **Object files** hold machine code with **relocations** (addresses not yet fixed) and a **symbol table**.
- **Static linking** copies library code into the executable. The result is a large, self-contained binary with no runtime dependencies, common in embedded devices (BusyBox built static, Go binaries, musl builds). It's harder to analyse because library functions appear inline and unlabelled; signature databases (FLIRT in IDA, FunctionID in Ghidra) re-identify them.
- **Dynamic linking** resolves library functions through a loader (`ld-linux.so` on Linux, the Windows loader in `ntdll`, `dyld` on macOS) at load time or lazily on first call.

## Stripping and symbols
A **stripped** binary has had its symbol table removed, so functions show up as `sub_401000` instead of their names. Debug information (DWARF on ELF/Mach-O, PDB files on Windows) maps addresses back to source lines and types when present. Most shipped firmware is stripped; recovering structure is the core RE skill.

# ELF: The Executable and Linkable Format

ELF is used by Linux, the BSDs, Android and most embedded systems. It has two complementary views.

## File header (first 64 bytes, ELF64)
```text
7F 45 4C 46   magic "\x7fELF"
02            EI_CLASS: 1=32-bit, 2=64-bit
01            EI_DATA:  1=little-endian, 2=big-endian
01            EI_VERSION
00            EI_OSABI (00=System V, 03=Linux)
...
e_type        1=REL (.o), 2=EXEC, 3=DYN (PIE/shared lib), 4=CORE (crash dump)
e_machine     0x3E=x86-64, 0xB7=AArch64, 0x08=MIPS, 0x28=ARM, 0xF3=RISC-V
e_entry       entry point virtual address
e_phoff/e_shoff  program/section header table offsets
```

> [!tip] `e_machine` and `EI_DATA` tell you the architecture and endianness, which is exactly what Ghidra and a cross toolchain need. For a raw firmware blob there's no ELF header, so you must determine these yourself (see the Architecture and IoT modules).

## Two views
| Section view (linking) | Segment view (execution) |
|---|---|
| `.text` code, `.rodata` constants | `PT_LOAD` segments mapped into memory with R/W/X perms |
| `.data` init'd globals, `.bss` zero-init | `PT_INTERP` names the dynamic loader |
| `.symtab`/`.strtab`, `.debug_*` | `PT_DYNAMIC` the dynamic linking info |
| `.plt`/`.got`, `.rela.*` relocations | `PT_GNU_STACK` (stack exec flag), `PT_NOTE` |

- Read headers with `readelf -h -l -S`, `objdump -d`, `nm`, `eu-readelf`, or `llvm-readelf`.
- `file`, `rabin2 -I` (radare2) and Detect It Easy (DIE) summarise it quickly.

## Dynamic linking: PLT and GOT
To call a library function lazily, the compiler emits a call into the **PLT** (Procedure Linkage Table); the PLT jumps through a slot in the **GOT** (Global Offset Table). The first call resolves the real address and patches the GOT; later calls jump straight there.

- `objdump -d` shows `call puts@plt`.
- `RELRO` (Relocation Read-Only) makes the GOT read-only after startup (full RELRO), removing a historically abused write target. Check with `checksec`.
- On Windows the equivalent is the **IAT** (Import Address Table); on macOS, the lazy/non-lazy symbol pointers bound by dyld.

# PE and Mach-O

## PE (Portable Executable, Windows: .exe/.dll/.sys)
```text
MZ (DOS header, 'MZ' = 4D 5A) -> e_lfanew -> PE\0\0 signature
COFF header: Machine (0x8664 x64, 0xAA64 ARM64), NumberOfSections, Characteristics
Optional header: AddressOfEntryPoint, ImageBase, subsystem (GUI/console), DLL characteristics (ASLR/DEP/CFG bits)
Section table: .text .rdata .data .rsrc .reloc .pdata
Data directories: Import (IAT), Export, Resources, Relocations, TLS, Debug, Load Config, .NET
```
- Imports/exports reveal capability at a glance (e.g. `ws2_32.dll` → networking, `advapi32`→ registry/crypto).
- Resources (`.rsrc`) hold icons, manifests, version info, and sometimes embedded payloads.
- `.NET` assemblies are PE files with a CLR header; decompile with dnSpyEx/ILSpy.
- Tools: PE-bear, CFF Explorer, PEview, `pefile` (Python), Detect It Easy, `dumpbin`, `rabin2`.

## Mach-O (macOS/iOS)
```text
magic FEEDFACF (64-bit LE) ; FAT/universal binaries start CAFEBABE with multiple slices
Load commands: LC_SEGMENT_64 (__TEXT, __DATA, __LINKEDIT), LC_MAIN (entry),
               LC_LOAD_DYLIB, LC_CODE_SIGNATURE, LC_ENCRYPTION_INFO (FairPlay on App Store apps)
```
- `otool -hlv`, `nm`, `lldb`, `jtool2`, Hopper, and Ghidra parse Mach-O.
- iOS App Store binaries are encrypted (FairPlay); they're decrypted in memory on a jailbroken device or with tools that dump the running image.

# Static Analysis with Ghidra, IDA and Others

## The reverse-engineering toolset
| Tool | Notes |
|---|---|
| **Ghidra** | Free, NSA-developed; excellent decompiler, scripting (Java/Python), huge processor support, version tracking/BinDiff-style compare |
| **IDA Pro / IDA Free** | Industry standard disassembler; Hex-Rays decompiler (paid); FLIRT signatures; vast plugin ecosystem |
| **Binary Ninja** | Modern, strong API, multi-level IL (LLIL/MLIL/HLIL) |
| **radare2 / Cutter** | Free, scriptable CLI + GUI (Cutter uses the Rizin fork) |
| **objdump / gdb** | Quick disassembly and dynamic inspection |
| **angr** | Python framework for static analysis and symbolic execution |

## A practical workflow
1. **Triage**: `file`, `checksec`, Detect It Easy, `strings`, inspect imports/exports. Is it packed? Stripped? Which architecture?
2. **Load** into Ghidra/IDA with the correct processor, endianness and base address.
3. **Find a foothold**: `main`/entry, interesting strings (error messages, format strings, paths, URLs), imported functions (`system`, `recv`, `strcpy`, crypto APIs), exports.
4. **Follow cross-references** (xrefs) to see who calls or uses a string or function.
5. **Recover types**: define structs, apply enums, name variables and functions as you understand them. The decompiler output improves as you do.
6. **Annotate** so a second pass is faster. Ghidra's decompiler plus renamed variables turns assembly into near-pseudocode.

> [!tip] Strings are the single fastest lead. A format string like `"/tmp/%s.pid"` or `"admin:%s"` tells you a lot before you read any code. Pair `strings` with xref navigation.

## Recognising library and crypto code
- **FLIRT / FunctionID / Lumina**: match statically-linked library functions against signature databases so `sub_...` becomes `memcpy`, `printf`, etc.
- **FindCrypt / capa / YARA**: spot cryptographic constants and API-usage patterns. `capa` maps code to MITRE ATT&CK-style capabilities ("encrypt data using AES", "receive data on a socket").
- **BinDiff / Diaphora**: diff two binaries to find what a patch changed — the basis of 1-day analysis.

# Obfuscation, Packing and Anti-Analysis

Legitimate software (DRM, anti-cheat) and malware both resist analysis. Recognising the technique matters more than defeating every instance.

## Packing and protection
A **packer** compresses or encrypts the real code and prepends a small **stub** that unpacks it into memory at runtime (UPX is the classic, reversible with `upx -d`; commercial protectors like VMProtect, Themida and ASPack are far harder).

Signs a file is packed:
- Few imports (often just `LoadLibrary`/`GetProcAddress` or `VirtualAlloc`/`mmap`/`mprotect`).
- High-entropy sections (the entropy graph is nearly flat at ~8; see the Lab's File analyzer).
- Odd section names (`UPX0`, `.vmp0`), tiny `.text`, a writable+executable section, an entry point outside `.text`.

The general approach to understanding packed code is **dynamic**: let the stub unpack, then capture the real code from memory once it's resolved (see the Debugging module). This is analysis in a controlled lab, not redistribution.

## Code-level obfuscation
- **Control-flow flattening**: the natural structure is replaced by a dispatcher loop and a state variable, so blocks run in an order chosen at runtime. Deobfuscators and symbolic tools help recover the original flow.
- **Opaque predicates**: branches whose outcome is always the same but not obviously so, inserted to confuse decompilers.
- **String encryption / stack strings**: strings are built or decrypted at runtime (see Foundations). Scripts or emulation (Frida, Unicorn, FLOSS) recover them.
- **Junk / dead code and instruction substitution**: equivalent but noisier instruction sequences.
- **Virtualization obfuscation**: the code is compiled to a custom bytecode run by an embedded interpreter (VMProtect, Themida). This is the hardest class; analysts reconstruct the VM's handler semantics.

## Anti-debug and anti-VM (recognition)
Programs may check for a debugger or sandbox: `IsDebuggerPresent`/`CheckRemoteDebuggerPresent`, the PEB `BeingDebugged` flag, timing checks with `rdtsc`, ptrace self-attach on Linux, or looking for VM artifacts (MAC prefixes, driver names, CPUID hypervisor bit). Knowing these patterns lets you spot them in a disassembly and understand why a sample behaves differently under analysis. Analysis sandboxes counter them transparently; your job in RE is usually just to identify the check and reason about the code path it guards.

> [!note] These topics are standard in malware analysis and security research courses. Study them on samples you are authorised to analyse, inside an isolated VM with networking controlled, and never run unknown binaries on your host.
