# ISAs, Microarchitecture and the Execution Model

An **Instruction Set Architecture (ISA)** is the contract between software and hardware: registers, instructions, encodings, memory model, privilege levels and exceptions. A **microarchitecture** is one particular implementation of an ISA. Intel Raptor Cove and AMD Zen 4 both implement x86-64; Apple's M-series cores and ARM Cortex-A78 both implement ARMv8/9-A.

## CISC vs RISC

| | CISC (x86) | RISC (ARM, MIPS, RISC-V, PowerPC) |
|---|---|---|
| Instruction length | variable (1–15 bytes on x86) | usually fixed (4 bytes), plus optional 16-bit compressed forms (Thumb, RVC) |
| Memory operands | most ALU instructions can read/write memory | **load/store**: only loads and stores touch memory |
| Registers | historically few (8 → 16 GPRs in x86-64) | many (31 on AArch64, 32 on MIPS/RISC-V) |
| Decoding | complex; modern x86 cracks instructions into RISC-like **µops** | simple, regular |

> [!note] The CISC/RISC line is blurry today. High-end x86 cores decode into micro-ops and execute them out of order, much like a RISC core would.

## The Von Neumann model and the fetch–decode–execute cycle
1. **Fetch**: read the instruction at the program counter (PC / RIP).
2. **Decode**: work out the operation and operands.
3. **Execute**: the ALU, the address generation unit, or a branch.
4. **Memory**: load or store if needed.
5. **Write-back**: update the architectural registers.

**Von Neumann** machines keep code and data in one memory space. **Harvard** machines have separate instruction and data buses or memories. Classic AVR and PIC microcontrollers are Harvard (code in flash, data in SRAM, different address spaces). Modern CPUs are "modified Harvard": split L1 instruction and data caches, but a unified memory.

## Common ISAs you'll reverse

| ISA | Where | Notes |
|---|---|---|
| x86-64 (AMD64) | PCs, servers | little-endian, variable length |
| AArch64 (ARM64) | phones, Apple Silicon, servers, newer SBCs | fixed 32-bit instructions |
| ARMv7-A / Thumb-2 | older phones, many routers and cameras | ARM (32-bit) and Thumb (16/32-bit) modes |
| ARMv7-M / v8-M (Cortex-M) | microcontrollers, smart-home devices | Thumb only, vector table at the start of flash |
| MIPS32 (BE/LE) | routers (Broadcom, Atheros/QCA, MediaTek, Realtek) | **branch delay slot** |
| RISC-V | ESP32-C3/C6, new SoCs | modular extensions (RV32IMAC, RV64GC) |
| Xtensa | ESP8266, ESP32 (original/S2/S3) | windowed registers |
| AVR, 8051, PIC | 8-bit microcontrollers | Harvard; 8051 still lives inside many USB and flash controllers |

# Pipelining, Hazards and Out-of-Order Execution

A **pipeline** overlaps the stages of consecutive instructions so that, ideally, one instruction finishes every cycle.

## Hazards
- **Structural**: two instructions need the same hardware unit at once.
- **Data**: an instruction needs a result that isn't ready yet (read-after-write). It's solved by **forwarding/bypassing** results between stages, or by stalling.
- **Control**: the next PC isn't known until a branch resolves. It's solved by **branch prediction**.

## Branch prediction
Modern CPUs predict the direction and target of a branch, and speculatively fetch and execute along the predicted path. A misprediction flushes the pipeline (around 15–20 cycles on big cores).
- **BTB** (Branch Target Buffer): caches the targets of taken branches.
- **RSB/RAS** (Return Stack Buffer): predicts `ret` targets.
- **Indirect branch predictors**: predict `jmp rax`/`call [rax]`-style targets. These were abused by Spectre v2 (Branch Target Injection).

## MIPS branch delay slots
On classic MIPS, the instruction **right after a branch or jump always executes**, whether or not the branch is taken:

```asm
jal   some_function
move  $a0, $s0        # delay slot: runs BEFORE some_function's first instruction
```

When reversing router firmware, read the delay slot as part of the call setup. Ghidra and IDA show it indented or marked with `_`.

## Superscalar and out-of-order (OoO) execution
- **Superscalar** cores issue several instructions per cycle across multiple execution ports.
- **OoO** execution: instructions wait in a reservation station or scheduler and run when their operands are ready, not in program order. A **Reorder Buffer (ROB)** retires them in order, so the program sees sequential behaviour.
- **Register renaming** maps architectural registers (RAX…) onto a larger physical register file, removing false dependencies (WAR/WAW). That's why `xor eax, eax` is a "zero idiom": the renamer recognises it and breaks the dependency on the old value.

## Speculative execution side channels
Work done on a mispredicted path is architecturally discarded, but it leaves **microarchitectural traces**, mainly in the cache state.
- **Spectre v1** (bounds-check bypass): trains a branch predictor so a bounds check is speculatively skipped, then leaks out-of-bounds data through cache timing (Flush+Reload).
- **Spectre v2** (branch target injection): poisons the indirect branch predictor. Mitigations: retpoline, IBRS/eIBRS, IBPB.
- **Meltdown** (rogue data cache load): on affected Intel CPUs, a user-mode load from kernel memory speculatively forwards data before the permission fault. Mitigation: KPTI/KAISER (separate page tables for user and kernel).
- Later variants: Foreshadow/L1TF, MDS (ZombieLoad, RIDL), Retbleed, Downfall, Inception, and others. The common theme is that **performance features leak data across security boundaries**.

# Memory Hierarchy and Caches

| Level | Typical size | Latency (approx.) |
|---|---|---|
| Registers | ~hundreds of bytes architectural | 0–1 cycle |
| L1 I/D cache | 32–64 KiB each, per core | ~4–5 cycles |
| L2 | 256 KiB – 2 MiB per core | ~12–15 cycles |
| L3 / LLC | tens of MiB, shared | ~40–60 cycles |
| DRAM | GBs | ~80–120 ns (hundreds of cycles) |
| NVMe SSD | TBs | ~10–100 µs |
| HDD | TBs | ~5–10 ms |

## Cache organisation
- **Cache line**: the unit of transfer, usually 64 bytes (Apple M-series uses 128-byte lines at some levels).
- An address is split into **tag | index | offset**. The index picks a *set*; the line can live in any of the set's *N ways* (N-way set associative).
- **Write-back vs write-through**; **inclusive vs exclusive** hierarchies.
- **Coherence**: MESI/MOESI protocols keep per-core caches consistent. "False sharing" happens when two cores write different variables in the same line.

## Why reversers care
- **Cache timing side channels** (Prime+Probe, Flush+Reload, Evict+Time) are used against crypto and for speculative-execution leaks.
- **Self-modifying code and unpackers** on ARM must explicitly clean the D-cache and invalidate the I-cache (`dc cvau`, `ic ivau`, `isb`) before running freshly written code. Seeing these instructions in firmware is a hint that code is being decompressed or patched at runtime.
- **DMA coherence**: drivers must flush or invalidate caches around DMA buffers on non-coherent SoCs. Bugs here corrupt data.

## DRAM and Rowhammer
DRAM stores bits as charge in capacitors, organised in banks, rows and columns. It must be refreshed (typically every 64 ms). **Rowhammer**: repeatedly activating ("hammering") a row can flip bits in neighbouring rows, which has been used to escalate privileges by flipping page-table bits. Mitigations include TRR (Target Row Refresh), ECC and higher refresh rates, and none of them is perfect.

**Cold boot attacks**: DRAM keeps its contents for seconds to minutes after power loss, longer when cooled. An attacker can reboot into a small dumper or move the DIMMs to read keys. This is why full-disk-encryption keys in RAM are a forensic opportunity, and a risk.

# Virtual Memory, Paging and the MMU

Each process gets its own **virtual address space**. The **MMU** translates virtual addresses (VA) to physical addresses (PA) using **page tables** that the OS maintains.

## x86-64 4-level paging (48-bit VA)

```text
 63      48 47    39 38    30 29    21 20    12 11        0
[sign ext ][ PML4  ][ PDPT  ][  PD   ][  PT   ][ offset    ]
             9 bits   9 bits   9 bits   9 bits   12 bits
```
- CR3 holds the physical address of the top-level table (PML4).
- Each table has 512 entries of 8 bytes, which fills one 4 KiB page.
- **Canonical addresses**: bits 63–48 must copy bit 47. User space is 0x0000_0000_0000_0000–0x0000_7FFF_FFFF_FFFF; the kernel uses the upper half (0xFFFF_8000_0000_0000+). A non-canonical address causes #GP.
- **Large pages**: 2 MiB (PD level) and 1 GiB (PDPT level).
- **5-level paging** (LA57) adds PML5 for 57-bit VAs.

Key PTE bits: **P** (present), **R/W**, **U/S** (user/supervisor), **PWT/PCD** (caching), **A** (accessed), **D** (dirty), **NX/XD** (bit 63, no-execute), plus the physical frame number.

## ARM64 translation
- **TTBR0_EL1** holds user-space (low) addresses; **TTBR1_EL1** holds kernel (high) addresses.
- Granules of 4 KiB, 16 KiB (Apple uses 16 KiB pages) or 64 KiB. Typically 39- or 48-bit VAs, configured in **TCR_EL1**.
- Permission bits: **AP** (access permissions), **UXN/PXN** (unprivileged/privileged execute-never), **AF** (access flag), plus memory attributes indexed through **MAIR_EL1**.
- With virtualisation there's a **stage 2** translation (IPA → PA) controlled by the hypervisor at EL2.

## TLB
The **Translation Lookaside Buffer** caches VA→PA translations. A context switch changes CR3/TTBR0, which needs a TLB flush unless entries are tagged with **PCID** (x86) or **ASID** (ARM). Kernels issue TLB shootdowns (IPIs) when they change mappings that other cores might have cached.

## Page faults
Accessing a non-present page or violating permissions raises a **page fault** (#PF, vector 14 on x86; a Data/Instruction Abort on ARM). The OS uses this for:
- demand paging and loading pages from disk/swap,
- copy-on-write after `fork()`,
- guard pages (stack growth),
- memory-mapped files.

> [!tip] Memory forensics tools (Volatility) rebuild each process's address space by walking these page tables, starting from the DTB (Directory Table Base, the CR3 value) stored in each process's kernel structure.

# Privilege Levels, Interrupts and Exceptions

## Privilege
- **x86**: rings 0–3. In practice the kernel runs in ring 0 and user mode in ring 3. Below that sit VMX root (hypervisor, sometimes called "ring −1") and **SMM** (System Management Mode, "ring −2", firmware-owned).
- **ARM64 exception levels**: EL0 for apps, EL1 for the OS kernel, EL2 for the hypervisor, EL3 for the secure monitor (TrustZone firmware such as ARM Trusted Firmware/TF-A). Secure and Non-secure worlds run in parallel; Secure-EL1 hosts a TEE OS (OP-TEE, QSEE, Trusty).

## Interrupts vs exceptions
- **Exceptions** are synchronous, caused by the instruction itself: divide error (#DE), invalid opcode (#UD), page fault (#PF), general protection (#GP), breakpoint (#BP, `int3`), a syscall (`syscall`/`svc`).
- **Interrupts** are asynchronous and come from devices or timers through an interrupt controller: APIC/IOAPIC/MSI on x86, GIC (Generic Interrupt Controller) on ARM, NVIC on Cortex-M.
- The **vector table** tells the CPU where the handlers are: the IDT on x86 (pointed to by IDTR), `VBAR_ELx` on ARM64, and the vector table at address 0 or VTOR on Cortex-M.

## Cortex-M vector table (important for MCU firmware RE)

```text
0x00  Initial Main Stack Pointer value  (e.g. 0x20008000, top of SRAM)
0x04  Reset_Handler address | 1         (Thumb bit set → odd value)
0x08  NMI_Handler
0x0C  HardFault_Handler
...   peripheral IRQ handlers
```

> [!lab] To load a raw STM32 dump into Ghidra: language ARM Cortex (Thumb, little-endian), base address `0x08000000` (STM32 flash). Read the reset vector at offset 4, clear bit 0, and start disassembling there. Then map SRAM at `0x20000000` and the peripherals at `0x40000000`. An SVD file loader can label the peripheral registers for you.

# Buses, I/O and DMA

## How CPUs talk to devices
- **Memory-mapped I/O (MMIO)**: device registers appear at physical addresses. Reading or writing them has side effects, so drivers use `volatile` accesses and memory barriers. This is universal on ARM and MCUs: GPIO, UART and SPI controllers all live at fixed addresses listed in the SoC's memory map or datasheet.
- **Port I/O**: x86's separate 64 K I/O space (`in`/`out` instructions), for example the legacy UART at port 0x3F8 and the PCI config mechanism at 0xCF8/0xCFC.

## Buses
- **PCIe**: point-to-point serial lanes, packet-based (TLPs). Devices have a config space and BARs (Base Address Registers) that map their MMIO. Thunderbolt and USB4 tunnel PCIe.
- **AMBA (ARM)**: AXI (high performance), AHB, and APB (simple peripherals) inside SoCs.
- **System buses on MCUs**: AHB/APB bridges. A peripheral's base address tells you which bus it sits on.
- **Off-chip**: DDR memory bus, eMMC/UFS for storage, SPI/QSPI for NOR flash, I²C/SPI/UART for sensors and other chips (see the Interfaces module).

## DMA
**Direct Memory Access** lets a device read and write RAM without the CPU. It's essential for performance, and a security problem: a malicious PCIe or Thunderbolt device can read the whole of RAM (Inception, PCILeech) **unless an IOMMU** (Intel VT-d, AMD-Vi, ARM SMMU) restricts which addresses each device may touch. Windows "Kernel DMA Protection" and Linux `iommu=on` rely on this.

> [!tip] DMA attacks are also a forensic acquisition technique. PCILeech with an FPGA board can dump RAM from a locked machine if the IOMMU isn't enforcing.

# The Boot Process: From Reset Vector to Kernel

## x86 PC (UEFI)
1. Power on. The CPU starts in real mode at the reset vector `0xFFFFFFF0`, which is mapped to the SPI flash holding the firmware. (Before that, on modern Intel/AMD, the **CSME/PSP** security processor has already verified the firmware: Boot Guard / Platform Secure Boot.)
2. **UEFI phases**: SEC → PEI (memory init) → DXE (drivers) → BDS (boot device selection).
3. UEFI loads an EFI application (for example `\EFI\Microsoft\Boot\bootmgfw.efi` or `shimx64.efi`/GRUB) from the **EFI System Partition (ESP)**, a FAT32 partition.
4. **Secure Boot** checks signatures against the db/dbx/KEK/PK key databases.
5. The bootloader loads the kernel. On Windows: `winload.efi` → `ntoskrnl.exe`. On Linux: GRUB → `vmlinuz` + `initramfs`.

Legacy BIOS instead loads the **MBR** (sector 0, 512 bytes, signature `55 AA`) at `0x7C00` and jumps to it in 16-bit real mode.

## ARM SoC (phone, router, SBC)
1. **BootROM** (mask ROM, immutable) runs first. It may verify the next stage against a hash of the OEM key burned into **eFuses**.
2. It loads the first-stage loader from eMMC/NAND/SPI/SD/USB (examples: SPL, BL2, Qualcomm PBL→XBL/SBL, MediaTek Preloader).
3. TF-A (BL31) sets up EL3 and the secure monitor; a TEE (BL32) may start.
4. A non-secure bootloader (U-Boot, ABL/LK on Android, iBoot on Apple) loads the kernel, the **device tree** (DTB) and the initramfs.
5. The kernel starts and runs init/systemd/procd.

> [!note] BootROM bugs can't be patched because the ROM is in silicon. Examples: Apple **checkm8** (A5–A11), Nintendo Switch **Fusée Gelée** (Tegra X1 RCM), and various MediaTek BROM and Qualcomm EDL exploits. They give permanent, low-level access on affected devices, which matters a great deal for mobile forensics.

## Where reversers intervene
- Interrupting U-Boot over UART ("Hit any key to stop autoboot") gives a bootloader shell where you can dump flash (`md`, `nand read`, `sf read`), change `bootargs` (for example `init=/bin/sh`), and boot custom images.
- Patching or replacing firmware in SPI flash with a programmer (x86 BIOS/UEFI modding and implants).
- Exploiting the verification chain (glitching, TOCTOU, downgrades) to break secure boot. See the Secure Boot module.
