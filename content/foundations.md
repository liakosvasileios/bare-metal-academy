# Bits, Bytes and Number Bases

Everything a computer stores (instructions, pixels, file systems, encryption keys) is a pattern of **bits**. Reverse engineering largely means looking at raw bits and working out what they encode. This module gives you that fluency.

## Units

| Unit | Size | Notes |
|---|---|---|
| bit | 1 binary digit | 0 or 1 |
| nibble | 4 bits | one hex digit |
| byte | 8 bits | smallest addressable unit on virtually all modern CPUs |
| word | ISA-dependent | x86 "WORD" = 16 bits (historical); ARM "word" = 32 bits |
| dword / qword | 32 / 64 bits | x86 naming (double/quad word) |
| halfword / doubleword | 16 / 64 bits | ARM naming |

> [!warn] "Word" means different sizes on different architectures. In Intel syntax `DWORD PTR` is 4 bytes; in ARM documentation a *word* is already 4 bytes.

Storage vendors use decimal prefixes (1 GB = 10⁹ bytes) while operating systems often use binary prefixes (1 GiB = 2³⁰ = 1,073,741,824 bytes). That's why a "1 TB" drive shows up as about 931 GiB. In forensic reports, always say which one you mean.

## Positional number systems

A number in base *b* is Σ dᵢ·bⁱ. The bases you'll use daily:

| Base | Name | Digits | Prefix / notation |
|---|---|---|---|
| 2 | binary | 0–1 | `0b1011`, `1011b` |
| 8 | octal | 0–7 | `0o755`, leading `0` in C (`0755`) — Unix permissions |
| 10 | decimal | 0–9 | — |
| 16 | hexadecimal | 0–9, A–F | `0x1F`, `1Fh` (MASM), `$1F` (old Motorola) |

### Why hex?
One hex digit is exactly 4 bits, so two hex digits are exactly one byte. Converting between hex and binary is a lookup, not arithmetic:

```text
0x  D    E    A    D    B    E    E    F
   1101 1110 1010 1101 1011 1110 1110 1111
```

Memorise the 16 nibbles. You'll see `0xF` (1111), `0x8` (1000), `0x7` (0111) and `0x5`/`0xA` (0101/1010 alternating patterns) constantly in masks.

### Conversions
- **Decimal → binary**: repeatedly divide by 2 and read the remainders bottom-up, or subtract the largest powers of two.
- **Binary → decimal**: add the powers of two for each set bit.
- **Powers of two to know by heart**: 2¹⁰ = 1024 (0x400), 2¹² = 4096 (0x1000, one page), 2¹⁶ = 65536 (0x10000), 2²⁰ = 1 MiB (0x100000), 2³² = 4 GiB (0x1_0000_0000).

> [!tip] An address ending in `000` hex is 4 KiB-aligned (page-aligned). Spotting this lets you recognise page tables, mmap regions and section alignment at a glance.

## Unsigned ranges

An *n*-bit unsigned integer holds 0 … 2ⁿ−1:

| Bits | Max (hex) | Max (decimal) |
|---|---|---|
| 8 | 0xFF | 255 |
| 16 | 0xFFFF | 65,535 |
| 32 | 0xFFFFFFFF | 4,294,967,295 |
| 64 | 0xFFFFFFFFFFFFFFFF | 18,446,744,073,709,551,615 |

When arithmetic exceeds the range it **wraps modulo 2ⁿ**: `0xFF + 1` in a byte is `0x00`, and the CPU sets the **carry flag**. Many real-world bugs (allocation-size overflows, for example) come from this wraparound.

# Signed Integers and Two's Complement

CPUs store negative integers in **two's complement**. To negate: invert all bits and add 1.

```text
 5  = 0000 0101
~5  = 1111 1010
-5  = 1111 1011 = 0xFB
```

Properties:
- The **most significant bit (MSB)** is the sign bit; its weight is −2ⁿ⁻¹ instead of +2ⁿ⁻¹.
- The range is −2ⁿ⁻¹ … 2ⁿ⁻¹−1. For 8 bits that's −128 … 127, so there's one more negative value than positive.
- Addition and subtraction use the **same hardware** for signed and unsigned. Only the *interpretation* and the flags you check differ.
- `-1` is all ones: `0xFF`, `0xFFFF`, `0xFFFFFFFF`… When you see `0xFFFFFFFF` in a disassembly, think "−1" (often an error return).
- Negating the minimum value overflows: `-(-128)` in 8 bits is still `-128`.

## Sign extension vs zero extension

Widening a value needs a rule for the new upper bits:
- **Zero extension** fills with 0. Use it for unsigned values. x86: `movzx`; ARM64: `uxtb`/`uxth`, or simply writing a W register.
- **Sign extension** copies the sign bit. Use it for signed values. x86: `movsx`, `movsxd`, `cbw/cwde/cdqe`, `cqo`; ARM64: `sxtb`, `sxth`, `sxtw`, `ldrsb`/`ldrsw`.

```text
0xF0 (as int8 = -16)  sign-extended to 32 bits → 0xFFFFFFF0 (-16)
0xF0 (as uint8 = 240) zero-extended to 32 bits → 0x000000F0 (240)
```

> [!note] The instruction a compiler picks tells you the variable's type. `movsx` from a byte means the source was a `char`/`int8_t`; `movzx` means `unsigned char`/`uint8_t`/`bool`. Decompilers rely on these clues.

## Overflow vs carry

| Flag | Meaning | Relevant to |
|---|---|---|
| CF (carry) | result didn't fit as **unsigned** (carry/borrow out of the MSB) | unsigned comparisons (`jb`, `ja`) |
| OF (overflow) | result didn't fit as **signed** (two positives gave a negative, or vice versa) | signed comparisons (`jl`, `jg`) |

Example in 8 bits: `0x7F + 0x01 = 0x80`. Unsigned that's 127 + 1 = 128 (fine, CF=0); signed it's 127 + 1 = −128 (OF=1).

## Integer division and shifts
- Logical right shift (`shr`, `lsr`) fills with zeros, which equals unsigned division by 2ᵏ.
- Arithmetic right shift (`sar`, `asr`) fills with the sign bit. It's signed division by 2ᵏ rounding toward −∞. C division rounds toward zero, so compilers add a correction for negative values. That's the odd `shr reg, 31; add; sar` pattern you'll see in disassembly.
- Division by constants is usually turned into **multiplication by a magic reciprocal** followed by shifts (`imul` + `sar`). Recognise it rather than trying to read it literally.

# Endianness

**Endianness** is the order in which a multi-byte value's bytes are stored in memory.

Take the 32-bit value `0x11223344` stored at address 0x1000:

| Address | Little-endian | Big-endian |
|---|---|---|
| 0x1000 | 44 | 11 |
| 0x1001 | 33 | 22 |
| 0x1002 | 22 | 33 |
| 0x1003 | 11 | 44 |

- **Little-endian** (least significant byte first): x86/x86-64, and ARM/AArch64 and RISC-V as normally configured.
- **Big-endian**: network byte order (TCP/IP headers), many older MIPS and PowerPC devices, Java class files, many file-format headers (PNG, JPEG markers). Lots of routers use big-endian MIPS (`mips`), others little-endian (`mipsel`).
- **Bi-endian** CPUs (ARM, MIPS, PowerPC) can run either way; the firmware chooses.

> [!tip] Firmware-analysis trick: find a known constant such as a magic number, a length field or a pointer into the image. If `0x00001000` shows up as `00 10 00 00`, the target is little-endian. Ghidra needs the right endianness or the disassembly will be garbage.

## Where endianness bites
- Reading hexdumps: `xxd` shows bytes in memory order, so a little-endian DWORD looks "reversed".
- `hexdump` without `-C` groups 16-bit words in host order, which is confusing. Always use `hexdump -C` or `xxd`.
- Network code: `htons`, `htonl`, `ntohl` convert between host and network (big-endian) order.
- Forensics: FAT, NTFS and ext4 structures are little-endian; HFS+ is big-endian; APFS is little-endian.
- Bit order within a byte is a separate question, mostly relevant for serial protocols. SPI and I²C send MSB first; UART sends LSB first.

# Bitwise Logic and Masks

| Operation | Symbol (C) | Typical use |
|---|---|---|
| AND | `&` | clear bits / test bits: `x & 0x0F` keeps the low nibble |
| OR | `\|` | set bits: `flags \|= 0x80` |
| XOR | `^` | toggle bits, simple ciphers, zeroing (`xor eax,eax`) |
| NOT | `~` | invert a mask before ANDing to clear: `x & ~MASK` |
| SHL | `<<` | multiply by 2ᵏ, build fields |
| SHR / SAR | `>>` | divide, extract fields |
| ROL / ROR | (no C operator) | hash functions, crypto, obfuscation |

## Field extraction idiom
To read bits [hi:lo] of x: `(x >> lo) & ((1 << (hi - lo + 1)) - 1)`.

Example: a register defines a 3-bit field `MODE` at bits [6:4]. With `reg = 0x5A` (0101 1010) you get `(0x5A >> 4) & 0x7 = 0x5 & 0x7 = 5`.

ARM64 has dedicated instructions for this (`ubfx`, `sbfx`, `bfi`); x86 has BMI1/BMI2 `bextr` and `pdep/pext`. Decompilers show them as shifts and masks.

## Useful identities
- `x & (x - 1)` clears the lowest set bit. It's zero if and only if x is a power of two (or 0).
- `x & -x` isolates the lowest set bit.
- `x ^ x = 0` and `x ^ 0 = x`, and XOR is its own inverse: `(p ^ k) ^ k = p`. That's why single-byte XOR "encryption" is common in malware and firmware, and why it's trivially broken. XOR a known-plaintext region (for example a run of zeros) with the ciphertext and you get the key.
- Alignment: `(x + (a - 1)) & ~(a - 1)` rounds x up to a power-of-two alignment a.

## Flags and bitfields in the wild
Permission bits (`rwx` = 4/2/1, so `0755` = rwxr-xr-x), page-table entries (present, writable, user, NX), the x86 RFLAGS register, NTFS file attributes (`0x20` = ARCHIVE, `0x02` = HIDDEN, `0x04` = SYSTEM), and the ELF `p_flags` field (PF_X = 1, PF_W = 2, PF_R = 4) are all bitfields.

# Floating Point (IEEE-754)

Floats show up in sensor firmware (temperature, scaling factors), game reversing and DSP code. IEEE-754 single precision (32-bit):

```text
| sign (1) | exponent (8, bias 127) | fraction (23) |
value = (-1)^s × 1.fraction × 2^(exponent - 127)
```

Double precision (64-bit) has an 11-bit exponent with bias 1023 and a 52-bit fraction.

| Pattern | Meaning |
|---|---|
| exponent all 0, fraction 0 | ±0 (yes, there's a −0) |
| exponent all 0, fraction ≠ 0 | subnormal (denormal) numbers |
| exponent all 1, fraction 0 | ±infinity |
| exponent all 1, fraction ≠ 0 | NaN |

Recognisable constants: `0x3F800000` = 1.0f, `0x40000000` = 2.0f, `0xBF800000` = −1.0f, `0x3FF0000000000000` = 1.0 (double), `0x40490FDB` ≈ π (float).

> [!tip] If a "random" 32-bit constant starts with `0x3F`, `0x40`, `0x41`, `0x42`, `0xBF` or `0xC0`, try decoding it as a float. The Lab's number converter shows the IEEE-754 interpretation.

On x86-64, scalar floating point uses the SSE registers XMM0–XMM15 (`movss`, `addsd`, `cvtsi2sd`…); the x87 FPU stack is legacy. On ARM64, it uses the S/D views of the V0–V31 registers (`fadd s0, s1, s2`).

Fixed-point arithmetic is common on microcontrollers without an FPU: the value is stored as an integer with an implied scaling factor (Q15, Q16.16). If you see multiplication followed by `>> 16`, suspect fixed point.

# Text Encodings and Strings

Strings are often the fastest way into an unknown binary: error messages, format strings, URLs, keys, debug prints.

## ASCII and friends
- **ASCII**: 7-bit. `0x20` = space, `0x30`–`0x39` = '0'–'9', `0x41` = 'A', `0x61` = 'a'. Lowercase = uppercase | 0x20.
- Control characters: `0x00` NUL (C string terminator), `0x0A` LF (`\n`), `0x0D` CR (`\r`), `0x09` TAB, `0x1B` ESC (ANSI terminal codes on UART consoles).
- **UTF-8**: variable length (1–4 bytes), ASCII-compatible. Lead bytes are `110xxxxx`, `1110xxxx` or `11110xxx`; continuation bytes are `10xxxxxx`. A BOM, if present, is `EF BB BF`.
- **UTF-16LE**: what Windows uses internally (`wchar_t`, "wide" APIs ending in `W`). ASCII text in UTF-16LE looks like `H.e.l.l.o.` in a hexdump (`48 00 65 00 …`). A BOM is `FF FE`.
- Pascal-style / length-prefixed strings: a count followed by bytes, with no terminator. Common in Delphi, protocols and some file systems.

> [!lab] Run `strings -n 8 firmware.bin` to get ASCII, and `strings -el` to get 16-bit little-endian strings. On Windows binaries, missing the UTF-16 pass means missing half the interesting text. FLOSS (FLARE) also recovers stack strings and obfuscated strings.

## Encodings you will meet
- **Base64**: A–Z a–z 0–9 + /, `=` padding; output is 4/3 the size of the input. Very common in configs, JWTs and malware.
- **Hex strings**: ASCII hex text (for example `"DEADBEEF"`), often keys or MAC addresses.
- **URL encoding** (`%20`), **quoted-printable**, **ROT13** (rare but present in Windows UserAssist registry values).
- **Intel HEX / Motorola S-record**: text formats for firmware images. Lines start with `:` (Intel HEX) or `S` (S-record), each carrying an address, data and a checksum. Convert them to raw binary with `objcopy -I ihex -O binary`.

# Reading Hexdumps

The canonical layout (`xxd`, `hexdump -C`) has an offset, 16 bytes in hex, then an ASCII column:

```text
00000000  7f 45 4c 46 02 01 01 00  00 00 00 00 00 00 00 00  |.ELF............|
00000010  03 00 3e 00 01 00 00 00  60 10 00 00 00 00 00 00  |..>.....`.......|
```

Reading this ELF header:
- `7f 45 4c 46`: magic `\x7fELF`.
- `02`: ELFCLASS64. `01`: little-endian. `01`: version.
- At 0x10: `03 00` = e_type 3 = ET_DYN (PIE or shared object). `3e 00` = e_machine 0x3E = x86-64.
- At 0x18: entry point 0x1060 (little-endian qword).

## Pattern recognition cheat sheet

| What you see | Likely meaning |
|---|---|
| Long runs of `FF` | erased NOR/NAND flash, unused space in a firmware image |
| Long runs of `00` | zero padding, BSS, sparse/unused disk areas |
| High-entropy region (looks like noise) | compressed or encrypted data |
| `55 AA` at offset 0x1FE | MBR or boot-sector signature |
| Repeating 4-byte values incrementing by a constant | pointer tables, vtables, interrupt vector tables |
| `00 00 xx xx` every 4 bytes at the start of a Cortex-M image | the vector table: initial SP, then the Reset handler (odd address = Thumb) |
| ASCII with `00` between every letter | UTF-16LE text |

> [!tip] Entropy close to 8 bits/byte means compressed or encrypted data. Compressed data usually has a recognisable header (gzip `1F 8B`, LZMA `5D 00 00`, xz `FD 37 7A 58 5A 00`, zstd `28 B5 2F FD`). Encrypted data usually doesn't. The Lab's File analyzer draws an entropy graph the way `binwalk -E` does.

## Tools
- `xxd file | less`, `xxd -s 0x200 -l 64 file` (seek/length), `xxd -r` (reverse: hex → binary).
- `hexdump -C`, `od -A x -t x1z`.
- GUI: HxD (Windows), ImHex (cross-platform, with a pattern language that parses structures), 010 Editor (binary templates), Hex Fiend (macOS).
- **ImHex patterns** and **010 templates** let you describe a structure once and see the file parsed into fields. Ideal for unknown firmware headers.

## Checksums and integrity values
Firmware headers and file systems carry integrity values. Recognise them:
- **CRC32**: polynomial 0x04C11DB7 (reflected 0xEDB88320). Look for that constant or a 256-entry table in code.
- **Adler-32** (zlib), **Fletcher**, and simple 8/16-bit additive checksums (common in bootloader headers).
- **Cryptographic hashes**: MD5 (16 bytes; init constants 0x67452301, 0xEFCDAB89…), SHA-1 (20 bytes), SHA-256 (32 bytes; constants 0x6A09E667… and the K table 0x428A2F98…).

Finding such constants in a binary (FindCrypt in Ghidra/IDA, `capa`, `yara` crypto rules) tells you which algorithms are inside without reading a line of code.
