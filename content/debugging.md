# Dynamic Analysis: Watching Code Run

Static analysis tells you what code *could* do; dynamic analysis shows what it *actually* does with real inputs, resolved pointers, decrypted strings and unpacked code. The two are complementary. Dynamic analysis is essential when code is obfuscated, self-modifying, or depends on runtime state you can't predict.

## How debuggers work under the hood
- **Software breakpoints**: the debugger overwrites the first byte of an instruction with a trap (`0xCC` = `int3` on x86; `brk` on ARM). When hit, the CPU traps, the debugger regains control, restores the original byte, and lets you inspect state.
- **Hardware breakpoints**: the CPU's debug registers (x86 DR0–DR3; ARM breakpoint/watchpoint registers) trap on an address without modifying code. Limited in number (usually 4) but work on read-only/flash code, and give **watchpoints** that trap on data reads or writes.
- **Single-stepping**: the trap flag (x86 TF) or hardware step makes the CPU trap after each instruction.
- **ptrace** (Linux) and the Windows debug API are the OS primitives: attach, read/write registers and memory, catch signals/events.

> [!tip] A watchpoint ("break when this memory changes") is often the fastest way to find *who* writes a value, far quicker than reading code. Use `watch *0xaddr` in GDB or a hardware data breakpoint in x64dbg.

# GDB and the Linux Toolkit

GDB is the workhorse for Linux, embedded Linux and cross-debugging.

## Essential commands
```text
gdb ./prog             start        | gdb -p <pid>   attach
run [args] / r         start running | continue / c  resume
break main / b *0x401000             set breakpoint (symbol or address)
tbreak                 one-shot breakpoint
watch var / rwatch / awatch          data write / read / access watchpoint
stepi / si , nexti / ni              step one instruction (ni steps over calls)
step / next            source-level step
info registers / i r   | p/x $rax    registers
x/16xw $rsp   x/8i $rip   x/s $rdi   examine memory (hex words / instructions / string)
bt                     backtrace     | frame N   select frame
info proc mappings     memory map    | info sharedlibrary
set $rax = 0           modify state  | set {int}0x1234 = 1
disassemble /r func    disassemble with raw bytes
set disassembly-flavor intel
```

## Make GDB usable: pwndbg / GEF / peda
Install **pwndbg** or **GEF**. They add a context view (registers, disassembly, stack), heap inspection (`heap`, `bins`, `vis`), `checksec`, `telescope`/`dereference` (follow pointer chains), `search`, and ROP/gadget helpers. They turn raw GDB into a practical RE environment.

## Cross and remote debugging
- Build or run `gdbserver :1234 ./prog` on the target (or `qemu-... -g 1234`), then on the host `gdb-multiarch`, `target remote <ip>:1234`, `set architecture aarch64`.
- For embedded Linux you'll often `scp` a static `gdbserver` onto the device.
- For bare-metal MCUs, GDB talks to a **debug probe** over JTAG/SWD through OpenOCD or a vendor gdb-server (see the Tools and Interfaces modules): `target extended-remote :3333`, then `load`, `mon reset halt`, `b Reset_Handler`.

## Companion tools
- `strace`/`ltrace` (syscalls/library calls), `ldd`, `nm`, `objdump -d`, `readelf`.
- `valgrind` (memory errors, callgrind profiling), ASan/UBSan builds.
- `perf` and eBPF (`bpftrace`) for production-safe tracing.
- `core` dumps: `gdb ./prog core` to post-mortem a crash (`ulimit -c unlimited`, see `/proc/sys/kernel/core_pattern`).

# Windows and macOS Debuggers

## x64dbg (Windows, user mode)
The go-to free user-mode debugger for Windows RE: graph view, memory map, call stack, breakpoints (including conditional and memory), and plugins (ScyllaHide for anti-anti-debug, Scylla for import reconstruction when dumping unpacked code). Great for malware triage in a VM.

## WinDbg (kernel and user mode)
Microsoft's powerful debugger (use **WinDbg Preview / WinDbgX**). It's the only practical way to debug the Windows kernel, drivers and crash dumps.
```text
!analyze -v        auto-analyze a crash/BSOD dump
lm                 list modules       | !process 0 0   list processes (kernel)
k / kb             stack trace        | dt nt!_EPROCESS  show a structure
!peb  !teb         process/thread env | !handle  !object
bp / ba            software / hardware breakpoint
u / dd / dps       disassemble / dump / dump with symbols
.reload /f         load symbols (set _NT_SYMBOL_PATH to the MS symbol server)
```
Kernel debugging is done over a network/serial/USB connection between a host and a target VM or machine; set it up with `bcdedit /debug on` and `kdnet`.

## LLDB (macOS, iOS, also Linux)
The default on Apple platforms, bundled with Xcode. Commands differ from GDB: `b`, `r`, `c`, `si/ni`, `register read`, `memory read -c 32 -f x $sp`, `image list`, `disassemble -s $pc`. On jailbroken iOS, `debugserver` + remote LLDB attaches to apps.

## Other dynamic tooling
- **Process Monitor / Process Explorer / System Informer** (Sysinternals): file, registry, process and network activity in real time, invaluable for behavioural malware analysis.
- **API Monitor**, **Frida-trace**, **Detours**-based hooking.
- **ETW** and **Sysmon** for telemetry; **Time Travel Debugging (TTD)** in WinDbg records an execution you can replay backwards.

# Instrumentation, Hooking and Emulation

## Frida (dynamic instrumentation)
Frida injects a JavaScript engine into a process (Windows, Linux, macOS, Android, iOS) so you can hook functions, read/modify arguments and return values, trace calls and dump memory, **without recompiling or restarting**.

```js
// Log every call to a function and tamper with the result
Interceptor.attach(Module.getExportByName(null, "strcmp"), {
  onEnter(args) { this.a = args[0].readUtf8String(); this.b = args[1].readUtf8String(); },
  onLeave(ret)  { console.log(`strcmp("${this.a}","${this.b}") = ${ret}`);
                  if (this.a === "license") ret.replace(0); }  // force "equal"
});
```
`frida-trace -i "recv*" -p <pid>`, `objection` (mobile), and Frida's Stalker (code tracing) are staples of mobile and desktop RE. It's the fastest way to understand and manipulate a running app, bypass simple checks for analysis, and dump decrypted data.

## DBI frameworks
**Intel Pin**, **DynamoRIO** and **Frida Stalker** instrument every instruction/basic block for coverage, taint tracking and tracing. Used to build custom analysis (e.g. logging all memory writes, measuring code coverage for fuzzing).

## Emulation
Running code in an emulator gives total control and isolation, and lets you analyse foreign architectures with no hardware.
- **QEMU**: full-system (`qemu-system-arm` boots a whole firmware image/kernel) or user-mode (`qemu-aarch64 ./bin`). The basis of firmware re-hosting (see the IoT module). Add `-s -S` to wait for GDB.
- **Unicorn Engine**: a lightweight CPU emulator (QEMU-derived) scriptable from Python/C. Perfect for emulating a single function, an unpacking stub, or a crypto routine without the surrounding environment.
- **Qiling**: a higher-level framework on Unicorn that emulates OS syscalls and loaders, so you can run a binary (including firmware) with hooks and instrumentation.
- **Unicorn example use**: map memory, write the bytes of one function, set registers to the arguments, run to a return address, read the result, great for brute-forcing a checksum or key-derivation routine you found statically.

```python
# Sketch: emulate a leaf function with Unicorn (concept)
from unicorn import *
from unicorn.x86_const import *
mu = Uc(UC_ARCH_X86, UC_MODE_64)
mu.mem_map(0x1000, 0x1000); mu.mem_write(0x1000, CODE_BYTES)
mu.reg_write(UC_X86_REG_RDI, 0x1234)        # argument
mu.emu_start(0x1000, 0x1000 + len(CODE_BYTES))
print(hex(mu.reg_read(UC_X86_REG_RAX)))     # return value
```

# Symbolic Execution and Automated Reasoning

Sometimes you want to answer "what input reaches this code / makes this check pass?" without manual stepping.

## The idea
Instead of concrete values, treat inputs as **symbolic variables**. As execution explores paths, the engine builds **path constraints** (a formula of conditions that must hold to follow that path) and hands them to an **SMT solver** (Z3) to find a satisfying input, or prove none exists.

- **angr** (Python): load a binary, mark input symbolic, `explore(find=addr_of_success, avoid=addr_of_fail)`, and get the input that reaches `success`. Great for crackme-style "find the password" and for triaging which crashes are reachable.
- **Triton**, **Miasm**, **BINSEC**, **KLEE** (source-level), and **manticore** are related tools.

## Limits
**Path explosion** (branches multiply exponentially), complex loops, cryptographic functions (deliberately hard to invert), and environment modelling (syscalls, files) limit pure symbolic execution. **Concolic** execution (concrete + symbolic, as in driller/SAGE) mixes real runs with symbolic reasoning to scale, and is often combined with fuzzing.

> [!tip] Reach for symbolic execution when a check is self-contained and arithmetic (serial validators, flag checks, small parsers). Don't point it at a whole firmware image and expect magic, scope it to one function.

# A Practical Dynamic-Analysis Playbook

Always do this in an **isolated lab**: a VM with snapshots and controlled (or no) networking, never your host. Treat unknown binaries as hostile.

## Behavioural triage (malware or unknown binary)
1. Snapshot a clean analysis VM. Record the baseline.
2. Run with Process Monitor + Process Explorer (Windows) or `strace`/`sysdig`/`inotifywait` (Linux) capturing file, registry, process and network activity.
3. Capture network with Wireshark and a fake-internet stub (**INetSim**, **FakeNet-NG**) so the sample talks to a controlled server, revealing C2 and configuration without touching the real internet.
4. Note dropped files, persistence (registry Run keys, services, scheduled tasks, cron, systemd), and process injection.
5. Pivot to a debugger for the interesting routine.
6. Revert the snapshot.

## Unpacking (analysis of protected code)
Let the packer stub run to its **original entry point** (OEP): set breakpoints on the tail transfer (e.g. after it allocates RWX memory and populates it), or on `VirtualProtect`/`mprotect`/`CreateThread`. When the real code is resolved in memory, **dump** it (Scylla, `dumpulator`, `volatility`'s process dump, or a GDB `dump memory`) and reconstruct imports for static analysis. This is standard malware-analysis practice inside a sandbox.

## Correlating with static analysis
Run both views together: breakpoint at an address you found statically, inspect the real arguments, then feed names and types back into Ghidra/IDA. Frida or a debugger script can log every call to a function of interest across a whole session, turning a confusing call graph into a concrete trace.

> [!lab] Beginner exercise, fully legal: compile a small "password check" program yourself, strip it, then (a) find the password statically in Ghidra, (b) patch the branch or set the flag in GDB to accept any input, and (c) solve it with angr by marking stdin symbolic and exploring to the "Correct!" branch. You'll have used all three techniques on code you own.
