# Kernel, User Space and System Calls

An operating system **multiplexes hardware** (CPU time, memory, devices) between programs and **enforces isolation** between them. It relies on the CPU's privilege levels: the kernel runs privileged (ring 0 / EL1), applications don't (ring 3 / EL0).

## Kernel architectures
| Type | Idea | Examples |
|---|---|---|
| Monolithic | the whole OS (drivers, FS, network) in one privileged address space; loadable modules | Linux, the BSDs |
| Microkernel | minimal kernel (IPC, scheduling, memory); drivers and services in user space | seL4, QNX, MINIX 3, Fuchsia (Zircon) |
| Hybrid | microkernel-ish design, much in kernel space for speed | Windows NT, XNU (Mach + BSD) |
| RTOS | deterministic scheduling for microcontrollers, often no MMU/isolation | FreeRTOS, Zephyr, ThreadX (Azure RTOS), VxWorks, µC/OS, RIOT |
| Bare metal | no OS; a superloop with interrupt handlers | many small MCUs |

> [!note] IoT firmware runs anything from Linux (routers, cameras, NAS devices) to an RTOS (smart plugs, sensors, BLE devices) to bare metal. Identifying which one is your first job: look for strings such as `Linux version`, `FreeRTOS`, `vTaskDelay`, `Zephyr`, `VxWorks` or `tx_thread_create`.

## System call path (Linux x86-64)
1. libc's `write()` wrapper puts the number in RAX and the args in registers, then executes `syscall`.
2. The CPU switches to ring 0, loads RIP from `MSR_LSTAR` (`entry_SYSCALL_64`), saves the user RIP in RCX and RFLAGS in R11.
3. The kernel switches to the per-thread kernel stack, saves registers (`pt_regs`) and indexes `sys_call_table[rax]`.
4. `ksys_write` → VFS → driver.
5. The kernel returns with `sysretq` (or `iretq`).

Tracing tools: `strace -f ./prog` (syscalls via ptrace), `ltrace` (library calls), `perf trace`, eBPF (`bpftrace -e 'tracepoint:syscalls:sys_enter_openat { printf("%s\n", str(args->filename)); }'`). On Windows: Process Monitor, ETW, API Monitor.

## vDSO
Some "syscalls" such as `clock_gettime` and `gettimeofday` run entirely in user space through the **vDSO**, a small shared library the kernel maps into every process (`[vdso]` in `/proc/self/maps`).

# Processes, Threads and Scheduling

## Process vs thread
- A **process** is an address space, open handles/file descriptors, credentials, and one or more threads.
- A **thread** is an execution context: registers, stack, TLS. Threads in a process share the address space.
- Linux represents both as `task_struct`. Threads are tasks created with `clone(CLONE_VM|CLONE_FILES|…)`. Windows has `EPROCESS`/`KPROCESS` and `ETHREAD`/`KTHREAD`.

## Process creation
- **Unix**: `fork()` duplicates the process (copy-on-write pages), then `execve()` replaces the image. `posix_spawn`/`vfork` are cheaper variants.
- **Windows**: `CreateProcess` → `NtCreateUserProcess` does it in one step. The parent–child relationship (PPID) can be spoofed with `PROC_THREAD_ATTRIBUTE_PARENT_PROCESS`, a trick malware uses and something forensic analysts need to know about.

## Process memory layout (Linux x86-64, typical)

```text
0x7fff_ffff_ffff  ┌──────────────────────┐
                  │ stack (grows down)   │  ← argv, envp, auxv at top
                  │ ...                  │
                  │ mmap region          │  ← shared libs (ld.so, libc), anonymous mmaps
                  │ ...                  │
                  │ heap (brk, grows up) │
                  │ .bss / .data         │
                  │ .text (PIE base)     │  ← 0x55xx_xxxx_x000 typical with ASLR
0x0000_0000_0000  └──────────────────────┘
```

`cat /proc/<pid>/maps` shows the real layout. Windows equivalents: VMMap, Process Hacker/System Informer, or `!address` in WinDbg.

## Scheduling
- **Preemptive multitasking**: a timer interrupt lets the kernel switch tasks on a **context switch**, saving one task's registers and loading another's (plus CR3/TTBR0 if the process changes).
- Linux used **CFS** (Completely Fair Scheduler, a red-black tree ordered by virtual runtime) and replaced it with **EEVDF** in 6.6. Real-time classes are `SCHED_FIFO` and `SCHED_RR`.
- Windows uses priority-based preemptive scheduling with 32 levels, quantum boosts and dynamic priority.
- RTOSes use fixed-priority preemptive scheduling. Watch for **priority inversion**, solved with priority-inheritance mutexes (the famous 1997 Mars Pathfinder bug).

## Synchronisation
Atomic instructions (`lock cmpxchg`, `ldxr/stxr`, LSE `cas`) → spinlocks → mutexes/semaphores (futex on Linux, which only enters the kernel under contention) → condition variables. Bugs here (races, TOCTOU, double fetch) are a major class of kernel vulnerability.

# Memory Management in the OS

## Virtual memory areas
The kernel tracks regions (Linux `vm_area_struct`, Windows **VADs**, Virtual Address Descriptors). Each has a range, protection and backing (anonymous or a file).

> [!tip] In memory forensics, a VAD that is **private, executable and not backed by a file** (`PAGE_EXECUTE_READWRITE` with no mapped image) is the classic sign of injected code. Volatility's `malfind` looks for exactly that.

## Key mechanisms
- **Demand paging**: pages are only loaded on first access (page fault).
- **Copy-on-write (CoW)**: shared pages are marked read-only, and a write fault makes a private copy. `fork()` and private file mappings rely on it. Dirty COW (CVE-2016-5195) was a race in this logic.
- **Swapping/paging to disk**: Linux swap partitions or files; Windows `pagefile.sys` and `swapfile.sys`; **hiberfil.sys** holds compressed RAM at hibernation. All three are forensic goldmines.
- **Memory-mapped files**: `mmap`, `CreateFileMapping/MapViewOfFile`.
- **Allocators**: the kernel uses buddy + slab/SLUB (Linux) or pools (Windows). User space uses ptmalloc (glibc), jemalloc, the Windows NT heap / Segment Heap. Each has its own metadata, and heap exploitation means attacking that metadata.
- **OOM killer** (Linux): kills processes when memory runs out.

## API cheat sheet
| Purpose | Linux | Windows |
|---|---|---|
| Allocate pages | `mmap` | `VirtualAlloc(Ex)` / `NtAllocateVirtualMemory` |
| Change protection | `mprotect` | `VirtualProtect(Ex)` |
| Write another process | `process_vm_writev`, `ptrace(POKEDATA)`, `/proc/pid/mem` | `WriteProcessMemory` |
| Remote thread | `ptrace` + register manipulation | `CreateRemoteThread`, `NtCreateThreadEx`, APC queueing |
| Load library | `dlopen` | `LoadLibrary` → `LdrLoadDll` |

The `VirtualAllocEx` → `WriteProcessMemory` → `CreateRemoteThread` sequence is the textbook process injection pattern, and a high-signal detection.

# Linux Internals for Reversers and Forensics

## Boot and init
Firmware → bootloader (GRUB/U-Boot) → kernel (`vmlinuz` = compressed; `vmlinux` = ELF with symbols) → **initramfs** (early user space that mounts the real root) → `/sbin/init` (systemd, BusyBox init, OpenWrt `procd`, SysV init).

Embedded Linux often uses **BusyBox**, a single binary providing `sh`, `ls`, `wget`, `telnetd` and more via symlinks. Init scripts live in `/etc/init.d/` and `/etc/inittab`; on OpenWrt, `/etc/rc.d`.

## Everything is a file
- `/proc`: per-process info (`/proc/<pid>/cmdline`, `maps`, `fd/`, `exe` → binary, `environ`), plus `/proc/cpuinfo`, `/proc/mtd` (flash partitions on embedded devices!), `/proc/kallsyms` (kernel symbols).
- `/sys`: devices, drivers, GPIO (`/sys/class/gpio`), firmware info.
- `/dev`: device nodes, e.g. `/dev/mtdblock*` and `/dev/mtd*` (raw flash), `/dev/mmcblk0` (eMMC/SD), `/dev/sda`, `/dev/mem` (physical memory, usually restricted).

## Kernel modules and drivers
`.ko` files loaded with `insmod`/`modprobe` and listed with `lsmod`. Drivers register character or block devices, or network interfaces. Vendor IoT kernels carry many proprietary modules (Wi-Fi, NPU, hardware NAT), often a source of vulnerabilities reachable through `ioctl`s.

## Security mechanisms
Users/groups and DAC permissions, **capabilities** (`CAP_NET_ADMIN`…), setuid binaries, namespaces and cgroups (containers), seccomp-bpf (syscall filters), LSMs (SELinux on Android, AppArmor), dm-verity (verified read-only partitions on Android and ChromeOS), and kernel hardening (KASLR, SMEP/SMAP or PAN/PXN, CFI, stack protector).

## Forensic touchpoints on Linux
- Logs: `/var/log/auth.log` or `secure`, `syslog`/`messages`, the systemd journal (`journalctl --file`), `wtmp`/`btmp`/`lastlog` (binary login records).
- Shell history: `~/.bash_history`, `~/.zsh_history`. Persistence: cron (`/etc/crontab`, `/var/spool/cron`), systemd units (`/etc/systemd/system`), `~/.ssh/authorized_keys`, `/etc/ld.so.preload`, `.bashrc`, rc scripts.
- Covered in more depth in the Artifacts module.

# Windows Internals Essentials

## Architecture
```text
User mode:   apps → Win32 APIs (kernel32, user32, advapi32…) → ntdll.dll (Nt*/Zw* syscall stubs)
Kernel mode: ntoskrnl.exe (Executive: Object Mgr, Memory Mgr, I/O Mgr, Security Ref Monitor, Config Mgr/registry)
             + HAL + drivers (.sys) + win32k.sys (GUI)
Below:       Hyper-V hypervisor → VBS/VTL1 (Secure Kernel, LSAIso / Credential Guard)
```

## Key concepts
- **Objects and handles**: files, processes, threads, mutexes, sections and registry keys are kernel objects referenced through per-process handle tables.
- **Access tokens**: user SID, group SIDs, privileges (SeDebugPrivilege…), integrity level (Low/Medium/High/System).
- **Sessions**: services run in session 0; interactive users in session 1 and up.
- **Important processes**: System (PID 4), `smss.exe`, `csrss.exe`, `wininit.exe`, `services.exe`, `lsass.exe` (authentication; credential theft target), `svchost.exe` (service host, always a child of `services.exe`), `winlogon.exe`, `explorer.exe`.

> [!tip] Memory forensics and DFIR rely on knowing the **normal process tree**. An `lsass.exe` whose parent isn't `wininit.exe`, several lsass instances, or an `svchost.exe` outside `C:\Windows\System32` or not spawned by `services.exe` are classic anomalies.

## Kernel structures you'll meet in memory forensics
`EPROCESS` (with `ActiveProcessLinks`, a doubly linked list; DKOM rootkits unlink entries from it to hide processes), `ETHREAD`, `PEB` (user-mode: loaded modules via `PEB->Ldr`, command line, environment), `TEB`, the VAD tree, the object/handle tables, `KUSER_SHARED_DATA` (fixed address `0x7FFE0000` in user mode).

## The registry
A hierarchical configuration database stored in **hive** files: `SYSTEM`, `SOFTWARE`, `SAM`, `SECURITY` and `DEFAULT` in `C:\Windows\System32\config\`, plus per-user `NTUSER.DAT` and `UsrClass.dat`. It's the richest forensic source on Windows (see Artifacts).

## Drivers and kernel security
Kernel drivers need valid signatures (DSE, Driver Signature Enforcement). **PatchGuard** (KPP) detects kernel patching on x64. **HVCI** (memory integrity) uses the hypervisor to enforce W^X in the kernel. Attackers use **BYOVD** (Bring Your Own Vulnerable Driver): they load a legitimately signed but vulnerable driver to gain kernel read/write. Microsoft maintains a vulnerable-driver blocklist against it.

# Device Drivers, Firmware Interfaces and RTOS Concepts

## What a driver does
- Probes and initialises hardware (via device tree, ACPI or PCI enumeration).
- Maps MMIO registers and configures clocks, resets and pins.
- Registers interrupt handlers (top half/bottom half, softirqs/tasklets/workqueues on Linux; ISRs/DPCs on Windows).
- Moves data with DMA and exposes an interface (`read`/`write`/`ioctl`, network devices, block devices).

## Device Tree (ARM/embedded Linux)
A data structure (`.dts` source → `.dtb` blob, magic `D0 0D FE ED`) that describes non-discoverable hardware: CPU, memory, UART addresses, GPIO, flash partitions. You can decompile it with `dtc -I dtb -O dts`. **In firmware RE, the DTB tells you the SoC's peripheral addresses and the flash partition layout.**

```dts
spi@1100a000 {
    compatible = "mediatek,mt7621-spi";
    reg = <0x1100a000 0x100>;
    flash@0 {
        compatible = "jedec,spi-nor";
        partitions {
            partition@0      { label = "u-boot"; reg = <0x0 0x30000>; read-only; };
            partition@50000  { label = "firmware"; reg = <0x50000 0xfb0000>; };
        };
    };
};
```

## ACPI (x86)
Firmware tables (DSDT, SSDT, MADT, FADT…) describe hardware and power management to the OS. AML bytecode runs inside the kernel's interpreter.

## RTOS concepts (FreeRTOS example)
- Tasks (`xTaskCreate`), each with its own stack and priority.
- Queues, semaphores, mutexes and event groups for IPC.
- A tick interrupt (SysTick on Cortex-M) drives the scheduler. Context switches happen in the `PendSV` handler.
- Everything is usually linked into **one flat binary** without symbols. Identify the RTOS from strings (task names like `"IDLE"`, `"Tmr Svc"`) and known function signatures (FLIRT, Ghidra FunctionID, BinDiff against a compiled SDK).

> [!lab] Finding `xTaskCreate` in a stripped ESP32 or STM32 image lets you enumerate every task entry point by looking at its callers. The task-name strings you'll find there are a map of the firmware's architecture.
