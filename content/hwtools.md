# Measurement Tools: Multimeter, Logic Analyzer, Scope

These three instruments answer "what is this pin, and what is it doing?" Buy them roughly in this order.

## Digital multimeter (DMM) — buy first
The everyday tool. Key modes:
- **Continuity** (beep): find GND, trace connections, check for shorts. The most-used mode in hardware RE.
- **DC voltage**: identify power rails (3.3 V, 1.8 V, 5 V, 1.2 V), confirm logic voltage *before* connecting adapters.
- **Resistance**: measure resistors, check pull-ups.
- **Diode test**: check diodes/LEDs, find ESD diodes on pins.
- (Current mode exists but you rarely break a circuit to use it in RE.)

> [!tip] Technique: black probe on a known GND. Probe pads: steady 3.3/1.8 V = a rail; 0 V with continuity to GND = ground; a pin that flickers as the device boots is a signal (candidate TX/CLK). This alone narrows an unknown header fast.

## Logic analyzer — buy second
Captures multiple digital lines over time and **decodes protocols** (UART, SPI, I²C, SWD, CAN…). This is how you reverse an unknown bus.
- Cheap **8-channel "Saleae clone"** (FX2-based) + **sigrok/PulseView** (free) covers most hobby needs up to ~24 MS/s.
- **Saleae Logic**, **DSLogic**, or FPGA-based analyzers for higher speed/channels.
- Workflow: connect the channels + GND, set a sample rate ≥ 4× the signal rate, capture while the device does something, then apply the matching **protocol decoder**. PulseView shows decoded bytes/ASCII directly.

## Oscilloscope — buy third (optional for pure digital)
Shows the analog shape of a signal over time: voltage levels, rise/fall times, glitches, noise, analog sensor outputs, and power-rail behaviour. Needed for signal-integrity issues, analog work, and precise timing/glitch work. Entry options: Rigol DHO/DS series, Siglent SDS, or a pocket scope. Specs that matter: bandwidth, sample rate, channels.

# Flash Programmers and Debug Probes

## SPI flash programmers (dump/write firmware)
- **CH341A** (cheap, ubiquitous): reads/writes SPI NOR with **flashrom**. Note: many CH341A modules output 5 V on the data lines by default, which can damage 3.3 V flash; use a 3.3 V-modified unit or a level-shifted one for in-circuit work.
- **Tigard**, **FT2232H**-based boards: cleaner 3.3/1.8 V support, also do UART/JTAG/SWD.
- **XGecu T48/TL866** series: universal programmers that support thousands of chips (SPI/parallel NOR/NAND, EEPROMs, microcontrollers) with sockets and adapters, great for off-board NAND/EEPROM.
- Clips/adapters: SOIC-8 test clip (in-circuit), SOIC-to-DIP adapters, TSOP-48 NAND sockets, BGA reballing stencils for the hardcore.

## Debug probes (JTAG/SWD)
- **J-Link** (SEGGER): industry standard, broad device support, works with GDB/OpenOCD and vendor IDEs.
- **ST-Link** (STM32, cheap), **CMSIS-DAP** / **DAPLink** (open), **Black Magic Probe** (built-in GDB server, no OpenOCD needed), **FT2232H/Tigard** (OpenOCD).
- They pair with **OpenOCD** or a vendor server to halt the CPU, read/write memory, dump flash and run GDB.

## Specialised and SoC-specific tools
- **eMMC/UFS readers** (e.g. easy-JTAG/Medusa-class boxes in forensics), SD/eMMC breakout adapters.
- **Bus Pirate / Glasgow Interface Explorer**: scriptable multi-protocol swiss-army adapters.
- **JTAGulator** (pin discovery), **Tigard** (UART+JTAG+SWD+SPI+I²C in one).
- SoC flashing tools: **mtk-su / SP Flash Tool** (MediaTek), **EDL/firehose + edl.py** (Qualcomm), **Odin/Heimdall** (Samsung), **fastboot** (Android), **NXP/STM ROM loaders**.

# Fault-Injection and RF Gear (Advanced)

These are specialist tools; know what they are and when they appear.

## Glitching / fault injection
- **ChipWhisperer** (NewAE): the standard open platform for **voltage/clock glitching** and **side-channel power analysis**, with training material. Used to study (and defeat, on your own devices) secure boot and readout protection.
- **PicoEMP / EMFI tools**: electromagnetic fault injection.
- **Crowbar glitchers**: MOSFET pulls a power rail low for nanoseconds to skip an instruction (e.g. a signature check). Covered conceptually in the Secure Boot module.

## RF / SDR
- **Software-Defined Radio**: RTL-SDR (receive-only, cheap, great for learning), HackRF One (TX/RX, wide band), LimeSDR, USRP (high end). Used for Sub-GHz, key fobs, ADS-B, and general spectrum work.
- Protocol radios: **nRF24**, **CC1101** (Sub-GHz), **Flipper Zero** (Sub-GHz/NFC/IR/GPIO multi-tool), **Ubertooth** (BLE sniffing), **HackRF/Proxmark3** (RFID/NFC). Details in the Wireless module.

> [!warn] Transmitting on RF is regulated. Receiving is generally fine; transmitting (jamming, replaying, spoofing) can be illegal and can interfere with safety systems. Practise on your own devices in a controlled way, and know your local radio laws.

# The Software Toolbox

## Firmware extraction and analysis
- **binwalk**: scans an image for embedded signatures, filesystems and compression; extracts them (`binwalk -e`, and `binwalk -Me` for recursive). The first tool on any firmware blob. (Note: run extraction in a sandbox/container; crafted images have caused extractor bugs.)
- **unblob**: modern, robust extractor (safer, many formats), a strong binwalk alternative.
- **firmware-mod-kit**, **sasquatch** (patched unsquashfs for vendor-mangled SquashFS), **jefferson** (JFFS2), **ubi_reader** (UBI/UBIFS), **cramfsck**, **yaffshiv** (YAFFS).
- **dumpflash / nanddump** and **ubidump** for raw NAND.

## Disassembly / decompilation / binary analysis
- **Ghidra**, **IDA**, **Binary Ninja**, **radare2/Cutter** (see the Binaries & Debugging modules).
- **Capstone** (disassembler), **Keystone** (assembler), **Unicorn** (emulation) — the Python trio for custom tooling.
- **qemu** (re-hosting), **Qiling**, **angr** (analysis/symbolic), **Frida** (instrumentation).

## Inspection and search
- `file`, `strings`, `xxd`/`hexdump`, `binwalk -E` (entropy), **ImHex**/**010 Editor** (structured hex editing), **Detect It Easy** (packer/compiler ID).
- `grep`/`ripgrep` over extracted filesystems for passwords, keys, URLs, and backdoor hints; `find` for setuid binaries and configs.
- **FACT** (Firmware Analysis and Comparison Tool) and **EMBA** automate large-scale firmware analysis (extraction, CVE matching, credential and crypto hunting) — great for triage.

# Building a Practical Lab

## A sensible progression
1. **Starter (cheap)**: a DMM, a USB-TTL UART adapter (CP2102/FT232), a CH341A SPI programmer + SOIC-8 clip, a cheap 8-ch logic analyzer, basic soldering iron, jumper wires and a breadboard. This handles most routers, cameras and IoT devices: UART shell, SPI flash dump, bus decoding.
2. **Intermediate**: a temperature-controlled iron + hot-air station, a Tigard (or FT2232H), a J-Link/ST-Link, a Bus Pirate, a better logic analyzer, an RTL-SDR, a Raspberry Pi (as a flexible SPI/I²C/JTAG host and Linux box), a bench PSU with current limiting.
3. **Advanced**: oscilloscope, universal programmer (T48) with NAND/BGA adapters, HackRF/Flipper, ChipWhisperer, microscope, eMMC/UFS readers, reballing/BGA rework gear.

## Software baseline
A Linux workstation (or VM) with: Ghidra, radare2/Cutter, binwalk + unblob + sasquatch + jefferson + ubi_reader, flashrom, OpenOCD, sigrok/PulseView, QEMU + Qiling, Frida, Wireshark, `can-utils`, `i2c-tools`, pwntools, and your preferred debugger plugins. Distros like **REMnux** (malware analysis) and **Kali/Parrot** bundle a lot.

> [!tip] Software is free and most of the learning is there. You can study ELF/firmware RE, assembly, QEMU emulation, binwalk and Ghidra with **no hardware at all**, using firmware images downloaded from vendor support sites (practise only on firmware you're permitted to analyse). Add hardware when you want to touch a physical device.

## Workflow mindset
Measure before you connect. Change one thing at a time. Keep notes and photos (annotate the board). Dump flash **twice** and diff to confirm. Work on a device you own first. And budget for the occasional **bricked device**, it's part of learning, which is why you practise on something expendable before touching anything that matters.
