# AArch64 Registers and State

AArch64 is the 64-bit execution state of ARMv8-A and later (ARMv9-A). It runs nearly every smartphone, Apple Silicon Mac, AWS Graviton server, Raspberry Pi 3/4/5 in 64-bit mode, and more and more routers and IoT gateways.

## General-purpose registers

| Register | Role (AAPCS64) |
|---|---|
| X0–X7 | arguments and return values (X0, and X1 for 128-bit results) |
| X8 | indirect result location (pointer for returning large structs); **syscall number on Linux** |
| X9–X15 | caller-saved temporaries |
| X16, X17 | IP0/IP1: intra-procedure-call scratch, used by PLT stubs and veneers; X16 is the syscall number on Apple/XNU |
| X18 | platform register (reserved on Apple/Windows; shadow call stack on Android) |
| X19–X28 | **callee-saved** |
| X29 | FP: frame pointer |
| X30 | LR: link register (return address) |
| SP | stack pointer (must be 16-byte aligned when used for memory access) |
| XZR/WZR | zero register: reads as 0, writes are discarded (shares encoding 31 with SP depending on the instruction) |
| PC | not a general-purpose register; read it via `adr`/`adrp` |

- **W0–W30** are the low 32 bits of X0–X30. **Writing a W register zeroes the upper 32 bits**, just like the x86-64 32-bit rule.
- **V0–V31**: 128-bit SIMD/FP registers, viewed as B (8-bit), H (16), S (32), D (64) or Q (128). FP arguments go in V0–V7. V8–V15 (low 64 bits) are callee-saved.

## PSTATE and condition flags
**NZCV**: Negative, Zero, Carry, oVerflow. Only flag-setting instructions update them: `cmp`, `cmn`, `tst`, `adds`, `subs`, `ands`… A plain `add` doesn't.

> [!warn] The ARM carry flag after a subtraction is the **inverse of a borrow**. `cmp x0, x1` sets C=1 when x0 ≥ x1 (unsigned). x86 does the opposite: CF=1 when there's a borrow.

## Condition codes

| Code | Meaning | Flags |
|---|---|---|
| EQ / NE | equal / not equal | Z=1 / Z=0 |
| HS (CS) / LO (CC) | unsigned ≥ / < | C=1 / C=0 |
| HI / LS | unsigned > / ≤ | C=1∧Z=0 / C=0∨Z=1 |
| GE / LT | signed ≥ / < | N=V / N≠V |
| GT / LE | signed > / ≤ | Z=0∧N=V / Z=1∨N≠V |
| MI / PL | negative / positive-or-zero | N |
| VS / VC | overflow / no overflow | V |

## System registers
Accessed with `mrs`/`msr`. Examples: `TPIDR_EL0` (user TLS pointer), `TPIDR_EL1`, `SCTLR_EL1` (MMU/cache enable), `TTBR0_EL1`/`TTBR1_EL1`, `VBAR_EL1` (exception vectors), `ESR_EL1` (exception syndrome: why the fault happened), `FAR_EL1` (faulting address), `ELR_EL1` (exception return address), `CurrentEL`, `MIDR_EL1` (CPU ID), `CNTVCT_EL0` (virtual counter, used in timing checks).

# Instructions and Addressing

Every A64 instruction is **32 bits wide**, little-endian in memory. Data processing is three-operand: `add x0, x1, x2` means x0 = x1 + x2.

## Data processing
```asm
mov   x0, #42              ; alias of movz/orr
movz  x0, #0x1234, lsl #16 ; zero then insert 16 bits
movk  x0, #0x5678          ; keep other bits, insert 16 bits
add   x0, x1, x2, lsl #3   ; x0 = x1 + (x2 << 3)  (shifted register operand)
sub   w0, w1, #1
mul   x0, x1, x2 ; madd x0, x1, x2, x3 (x1*x2 + x3)
sdiv  w0, w1, w2 ; udiv     (no remainder instruction: msub computes it)
and   x0, x1, #0xff        ; bitmask immediates
orr / eor / bic (and-not) / mvn (not)
lsl / lsr / asr / ror
ubfx  w0, w1, #4, #3       ; extract bits [6:4] unsigned
sbfx / bfi / bfxil         ; bitfield ops
sxtw  x0, w1 ; uxtb / sxtb / sxth
clz, rbit, rev (byte swap), rev16, rev32
```

> [!tip] A 64-bit constant takes up to four instructions (`movz` + three `movk`), or a PC-relative literal load `ldr x0, =const` (assembled as `ldr x0, [pc, #off]`). Decompilers fold these back together, but in raw disassembly you need to recognise the pattern.

## Loads and stores
Only loads and stores access memory.

```asm
ldr   x0, [x1]             ; 64-bit load
ldr   w0, [x1, #8]         ; 32-bit, immediate offset
ldrb  w0, [x1, x2]         ; byte, register offset
ldrsw x0, [x1, w2, sxtw #2]; signed word, index sign-extended and scaled ×4
str   x0, [sp, #16]
ldp   x29, x30, [sp], #16  ; load pair, post-index (sp += 16 after)
stp   x29, x30, [sp, #-16]!; store pair, pre-index (sp -= 16 first, writeback)
ldur  / stur               ; unscaled (unaligned) immediate offsets
ldxr / stxr / ldaxr / stlxr; exclusive (atomic LL/SC) & acquire/release
ldadd / cas / swp          ; ARMv8.1 LSE atomics
```

| Mode | Syntax | Effect |
|---|---|---|
| Base + offset | `[x1, #8]` | address = x1+8, x1 unchanged |
| Pre-index | `[x1, #8]!` | x1 += 8, then access |
| Post-index | `[x1], #8` | access at x1, then x1 += 8 |
| Register offset | `[x1, x2, lsl #3]` | x1 + x2*8 |
| PC-relative literal | `ldr x0, label` | ±1 MiB from PC |

## PC-relative addressing: adrp + add
Position-independent code builds the address of a global in two steps:

```asm
adrp  x0, 0x412000          ; page of the target (4 KiB aligned, ±4 GiB range)
add   x0, x0, #0x3a8        ; low 12 bits → x0 = 0x4123a8
ldr   x1, [x0]              ; or fold the offset into the load
```

Disassemblers resolve these pairs automatically (`adrp x0, str_hello@PAGE` + `add x0, x0, str_hello@PAGEOFF` on Apple tools).

# Control Flow and AAPCS64

## Branches
```asm
b      label          ; unconditional, ±128 MiB
bl     func           ; call: LR(x30) = return address
br     x16            ; indirect jump
blr    x8             ; indirect call
ret                   ; branch to x30 (by default)
b.eq   label          ; conditional (b.ne, b.lt, b.hs ...)
cbz    w0, label      ; compare and branch if zero  (no flags touched)
cbnz   x1, label
tbz    w0, #3, label  ; test bit 3 and branch if zero
tbnz   x0, #63, neg   ; sign bit test
```

**No delay slots.** Conditional selects replace small branches:
```asm
cmp   w0, w1
csel  w2, w0, w1, gt   ; w2 = (w0 > w1) ? w0 : w1  → max()
cset  w0, eq           ; w0 = (Z == 1)
csinc w0, w1, w2, ne   ; w0 = ne ? w1 : w2+1
ccmp  w1, #5, #0, ne   ; conditional compare (chains && / ||)
```

## Function prologue and epilogue
```asm
func:
    stp   x29, x30, [sp, #-48]!   ; save FP & LR, allocate 48 bytes
    mov   x29, sp                 ; set up frame pointer
    stp   x19, x20, [sp, #16]     ; save callee-saved regs we use
    ...
    ldp   x19, x20, [sp, #16]
    ldp   x29, x30, [sp], #48
    ret
```

**Leaf functions** (functions that make no calls) often skip saving LR entirely, because `bl` stores the return address in a register and not on the stack. That's a key difference from x86, where the return address is always on the stack.

## AAPCS64 summary
- Args: X0–X7 (integers/pointers), V0–V7 (FP/SIMD). Further args go on the stack, 8-byte slots.
- Return: X0 (X0:X1), V0. Large structs are returned via a buffer pointed to by X8.
- Callee-saved: X19–X28, X29, X30 (if clobbered), SP, and the low 64 bits of V8–V15.
- **Apple arm64 differences**: variadic arguments always go **on the stack**; X18 is reserved; char is signed; stack arguments are packed by natural alignment.
- **Windows on ARM64**: similar to AAPCS64, with X18 = TEB pointer.

# System Calls, Exceptions and Exception Levels

## Linux AArch64 syscalls
`svc #0` with the syscall number in **X8** and args in **X0–X5**; the return value is in X0. AArch64 uses the **generic** syscall table, which is different from x86-64 numbering.

| # | Name |
|---|---|
| 56 | openat |
| 57 | close |
| 63 | read |
| 64 | write |
| 93 | exit |
| 94 | exit_group |
| 220 | clone |
| 221 | execve |
| 222 | mmap |
| 226 | mprotect |

```asm
// write(1, msg, len); exit(0)
    mov  x0, #1
    adr  x1, msg
    mov  x2, #14
    mov  x8, #64
    svc  #0
    mov  x0, #0
    mov  x8, #93
    svc  #0
msg: .ascii "Hello, metal!\n"
```

On **XNU** (iOS/macOS) the number goes in **X16** and the call is `svc #0x80`.

## Exception levels and calls between them
| Instruction | From → To | Purpose |
|---|---|---|
| `svc` | EL0 → EL1 | system call |
| `hvc` | EL1 → EL2 | hypervisor call |
| `smc` | EL1/EL2 → EL3 | secure monitor call (TrustZone / PSCI power management) |
| `eret` | ELn → lower | return from exception, restoring SPSR/ELR |

The vector table at `VBAR_ELn` has 16 entries of 0x80 bytes: {Synchronous, IRQ, FIQ, SError} × {current EL with SP0, current EL with SPx, lower EL AArch64, lower EL AArch32}.

When something crashes, `ESR_EL1.EC` (exception class) says why: 0x15 = SVC from AArch64, 0x20/0x21 = instruction abort, 0x24/0x25 = data abort, 0x3C = BRK. `FAR_EL1` holds the faulting address.

## Debug-related instructions
- `brk #imm`: software breakpoint (encoding `0xD4200000 | imm<<5`; `brk #0` is `00 00 20 D4` in memory). The kernel and debuggers use it, and so do compiler traps (`__builtin_trap` produces `brk #0x3e8` with clang on Apple).
- `hlt #imm`: halts into external (JTAG) debug mode if one is attached.
- `nop` = `0xD503201F` (`1F 20 03 D5` in memory). Patching a branch with NOP is a common binary patch.

# Security Features: PAC, BTI, MTE

## Pointer Authentication (PAC, ARMv8.3)
PAC puts a cryptographic signature (the PAC) into the **unused upper bits** of a 64-bit pointer, computed from the pointer, a 64-bit modifier (often SP) and a secret key held in system registers.

```asm
func:
    paciasp                 ; sign LR with key A, modifier SP
    stp  x29, x30, [sp, #-16]!
    ...
    ldp  x29, x30, [sp], #16
    autiasp                 ; authenticate LR; corrupt → invalid pointer
    ret                     ; (or retaa = autiasp+ret)
```

- Keys: IA, IB (instructions), DA, DB (data) and GA (generic).
- An overwritten return address fails authentication, which stops classic ROP unless the attacker has a signing gadget or can leak/forge PACs.
- Apple's **arm64e** ABI (A12+) uses PAC widely: return addresses, C++ vtables, function pointers and Objective-C `isa` pointers.
- Instructions such as `xpaci`/`xpaclri` strip PAC bits. Debuggers display stripped pointers.

## Branch Target Identification (BTI, ARMv8.5)
Pages marked as guarded only allow indirect branches (`br`/`blr`) to land on `bti c` / `bti j` / `bti jc` instructions (or on `paciasp`, which acts as a landing pad). This is the counterpart of Intel's `endbr64`.

## Memory Tagging Extension (MTE, ARMv8.5)
Every 16-byte granule of memory has a 4-bit tag, and pointers carry a tag in bits 56–59. A mismatch raises a fault (synchronous or asynchronous), which catches use-after-free and overflows. It's used in Android hardened builds and on Pixel 8+ as an opt-in, and Apple's **MIE** (Memory Integrity Enforcement, iPhone 17 generation) builds on the enhanced form, EMTE. Instructions: `irg`, `addg`, `stg`, `ldg`.

## Top Byte Ignore (TBI)
The MMU can ignore bits 63–56 of data addresses, which lets software store a tag there. It's used by HWASan (hardware-assisted AddressSanitizer), MTE and Android's tagged pointers. You'll see heap pointers like `0xb400007a1c2340e0` on Android. The `0xb4` top byte is a tag, not part of the address.

# 32-bit ARM, Thumb and NEON

Plenty of IoT targets still run **ARMv7** (AArch32), and Cortex-M microcontrollers run **Thumb** only.

## AArch32 essentials
- Registers R0–R15: R13 = SP, R14 = LR, R15 = PC (directly accessible!). The CPSR holds the flags and mode.
- Calling convention (AAPCS): args R0–R3, return R0 (and R1), callee-saved R4–R11.
- **Conditional execution** of nearly every ARM-mode instruction: `addeq r0, r0, #1`, `movne r1, #0`. In Thumb-2 it's done with `it`/`ite` blocks.
- `push {r4-r7, lr}` / `pop {r4-r7, pc}` is the common prologue/epilogue. Popping into PC returns.
- `ldr r0, =0x40021000` → literal pool loads (constants stored after the function).
- Syscalls: `svc #0` with the number in R7 (EABI).

## ARM vs Thumb
- ARM mode: 32-bit instructions. Thumb: 16-bit instructions, plus 32-bit ones in Thumb-2.
- Interworking: `bx`/`blx` switch state based on **bit 0 of the target address** (1 = Thumb). That's why Cortex-M vector-table entries and function pointers are odd numbers.
- In Ghidra, set the TMode context register (or disassemble with ARM:LE:32:v7 and choose Thumb) or you'll get garbage. Mixed-mode binaries confuse auto-analysis.

## NEON / Advanced SIMD (AArch64)
```asm
ld1   {v0.16b}, [x0]        ; load 16 bytes
eor   v0.16b, v0.16b, v1.16b
add   v2.4s, v0.4s, v1.4s   ; 4 × 32-bit lanes
st1   {v2.4s}, [x1]
aese  v0.16b, v1.16b        ; AES round (Crypto extension)
aesmc v0.16b, v0.16b
sha256h q0, q1, v2.4s
```
Arrangement specifiers: `.8b .16b .4h .8h .2s .4s .1d .2d`. Seeing `aese`/`aesmc` or `pmull` (GHASH) identifies crypto immediately.

## Tools to practise with
- Cross toolchains: `aarch64-linux-gnu-gcc`, `arm-linux-gnueabihf-gcc`, `clang --target=aarch64-linux-gnu`.
- Run foreign binaries with **QEMU user mode**: `qemu-aarch64 -L /usr/aarch64-linux-gnu ./a.out`, and debug with `-g 1234` plus `gdb-multiarch`.
- Compiler Explorer (pick an ARM64 GCC or Clang), Raspberry Pi, Apple Silicon (`otool -tv`, `lldb`), Android `adb shell` plus a native binary.
- Online assemblers and disassemblers: Keystone/Capstone (Python bindings), `rasm2 -a arm -b 64`.
