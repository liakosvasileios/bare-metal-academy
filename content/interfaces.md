# UART: The First Thing to Find

**UART** (Universal Asynchronous Receiver/Transmitter) is the serial console found on a huge fraction of embedded devices. Getting a UART shell is often the single fastest way into a router, camera or IoT box, which is why it's the first interface to hunt for.

## How it works
- **Asynchronous**: no clock line. Both ends must agree on the **baud rate** (bits per second).
- Two data lines: **TX** (transmit) and **RX** (receive), crossed between devices (device TX → adapter RX), plus a common **GND**. VCC is usually left unconnected.
- Frame: 1 **start** bit (LOW), 5–9 **data** bits (usually 8, LSB first), optional **parity**, 1–2 **stop** bits (HIGH). "8N1" = 8 data, no parity, 1 stop. Idle line is HIGH.
- Common baud rates: 9600, 57600, and very commonly **115200**. Others: 38400, 230400, 921600. The MCU's crystal sometimes yields oddballs like 74880 (ESP8266 boot ROM).

## Logic levels (critical)
UART on a board is **TTL/CMOS level** (3.3 V or 1.8 V), *not* RS-232 (±12 V). Use a **USB-TTL adapter** (CP2102, FT232, CH340, PL2303) set to the board's voltage. Confirm the target voltage first; feeding 3.3 V into a 1.8 V line can damage it.

## Finding and connecting
1. Identify a candidate 3–4 pad header/test points (see Electronics).
2. With a multimeter: find GND (continuity to shield/planes), VCC (steady rail), TX (idles at logic voltage, pulses on boot), RX (often idles high, no boot activity). A logic analyzer or scope confirms TX by showing serial bursts at power-on.
3. Wire adapter GND→GND, adapter RX→board TX, adapter TX→board RX. (Start with just GND+RX to listen safely.)
4. Open a terminal: `screen /dev/ttyUSB0 115200`, `minicom`, `picocom -b 115200 /dev/ttyUSB0`, or PuTTY/`tio`. If you see garbage, try other baud rates (the Lab can estimate baud from a measured pulse width).

## What you get
- Boot logs (bootloader + kernel): CPU, flash layout, partition names, versions, sometimes decryption hints.
- A **bootloader prompt** (U-Boot: "Hit any key to stop autoboot") lets you dump flash and change boot args (`setenv bootargs ... init=/bin/sh`).
- A **root/login shell** (sometimes passwordless, sometimes default creds, sometimes locked). Even a locked shell leaks information.

> [!tip] The boot log is a free gift: it usually prints the exact flash partition map (offsets and names) and the SoC model, which tells you where firmware lives and how to dump it.

# SPI and I²C: Talking to Chips

## SPI (Serial Peripheral Interface)
Fast, full-duplex, synchronous, master/slave. Four signals:
- **SCLK** (clock, from master), **MOSI** (Master Out Slave In), **MISO** (Master In Slave Out), **CS/SS** (Chip Select, active LOW).
- MSB-first; modes 0–3 set by clock polarity (CPOL) and phase (CPHA).

SPI is how the CPU reads **SPI NOR flash** (where firmware often lives). The flash speaks a simple command set: `0x9F` read JEDEC ID, `0x03` read data (slow), `0x0B` fast read, `0x06` write enable, `0x02` page program, `0x20`/`0xD8` erase. A **flash programmer** (see Tools) issues these to dump or write the chip.

> [!lab] Dumping SPI NOR: either desolder the chip or clip onto it in-circuit (hold the main SoC in reset so it doesn't fight the bus), connect a CH341A / flashrom-supported programmer, and run `flashrom -p ch341a_spi -r dump.bin`. Read twice and compare to confirm a clean dump.

## I²C (Inter-Integrated Circuit)
Two wires, multi-device, slower (100 kHz standard, 400 kHz fast, up to 3.4 MHz):
- **SDA** (data) and **SCL** (clock), both **open-drain with pull-ups**.
- Each slave has a 7-bit (or 10-bit) **address**. The master sends START, address+R/W, then data, with per-byte ACK/NACK, then STOP.
- Used for EEPROMs (24Cxx config storage, a common place for secrets/serials), RTCs, sensors, PMICs, HDMI DDC/EDID, and board management.

Tooling: a Bus Pirate, a cheap I²C adapter, or `i2cdetect`/`i2cdump`/`i2cget` on a Linux SBC (Raspberry Pi) scan for addresses and read devices. A logic analyzer with an I²C decoder reveals traffic passively.

## SWD/SPI/I²C decoding
A **logic analyzer** (even an $8 clone with sigrok/PulseView, or a Saleae) captures the lines and **decodes** protocol frames automatically, which is how you reverse an unknown bus between two chips without guessing.

# JTAG, SWD and On-Chip Debug

**JTAG** (IEEE 1149.1) and ARM's **SWD** give low-level control of a CPU: halt, single-step, read/write registers and memory, set hardware breakpoints, and often dump or reflash the whole device. Finding working JTAG/SWD is close to full control.

## Signals
- **JTAG**: TCK (clock), TMS (mode select), TDI (data in), TDO (data out), optional TRST (reset), plus GND and reference voltage. Often a 10/14/20-pin header, or scattered test pads.
- **SWD** (ARM Cortex, fewer pins): **SWDIO** (bidirectional data), **SWCLK** (clock), plus GND/Vref. Sometimes **SWO** for trace. Common on Cortex-M.

## Uses
- Debugging firmware with GDB via a probe (OpenOCD or vendor server; see the Tools module).
- **Dumping internal flash** (if readout protection is off): `flash read_bank`, or memory reads.
- Reflashing, unbricking, setting breakpoints on `Reset_Handler`.
- Boundary scan: driving/reading pins to map connections or access other chips.

## Finding JTAG/SWD
- Look for 2×5 / 2×10 headers near the SoC, or clusters of fine pads.
- **JTAGulator** (or a Tigard/Pi + scripts) brute-forces which unknown pins are TCK/TMS/TDI/TDO by exercising the state machine and reading the IDCODE.
- Confirm with OpenOCD: it reports the TAP/IDCODE if the scan chain is alive.

> [!warn] Many shipped devices **disable or fuse off** JTAG/SWD (readout protection, debug-disable fuses) specifically to stop this. The Secure Boot module covers readout protection (RDP on STM32, CRP on LPC, debug-disable eFuses) and the fault-injection techniques sometimes used against it, which are advanced and device-specific.

# Flash, Storage and High-Speed Buses

## Memory/storage interfaces (dump targets)
| Interface | Chips | How to read |
|---|---|---|
| **SPI NOR** | W25Q, MX25, GD25 (SOIC-8/WSON-8) | CH341A/Tigard + flashrom; in-circuit clip or desolder |
| **SPI NAND** | larger, needs ECC/bad-block handling | specialized programmer or SoC |
| **Parallel NAND** | TSOP-48 | NAND programmer; raw dump includes spare/OOB area, needs ECC + de-interleave |
| **eMMC** | BGA-153/169 | in-system via test points (CLK/CMD/DAT0/VCC/VCCQ/GND) with an SD/eMMC reader, or chip-off + adapter |
| **UFS** | BGA, modern phones | specialized readers / ISP; harder |
| **I²C EEPROM** | 24Cxx | I²C adapter; small, holds config/serials |

> [!tip] **eMMC in-system programming (ISP)**: expose CLK, CMD, DAT0, VCC, VCCQ and GND (often test points), hold the SoC in reset, and an eMMC/SD reader can read it like an SD card. This is a staple of phone and set-top-box forensics and is less destructive than chip-off.

## High-speed buses (context)
- **USB**: differential pair (D+/D−) up to 480 Mbps (2.0); USB 3+ adds SuperSpeed pairs. Host-controlled; descriptors enumerate the device. See the USB subsection below.
- **PCIe / NVMe**: serial lanes for SSDs and add-in cards.
- **SD/SDIO**: SD cards; SDIO also carries Wi-Fi on some modules.
- **Ethernet (MII/RMII/RGMII)** between MAC and PHY; **SGMII** at higher speeds.
- **DDR**: the DRAM bus (very high speed, not something you tap casually).

## USB as an interface
USB devices expose **descriptors** (Vendor/Product ID, classes, endpoints). Enumerate with `lsusb -v`, Windows USBView, or Wireshark's USBPcap/usbmon to capture traffic. Reversing a USB gadget means understanding its class (HID, CDC-serial, mass storage, DFU) and its vendor-specific control transfers. **DFU** (Device Firmware Upgrade) is a standard USB class for flashing firmware, and often a path in and out.

# CAN, RF and Other Buses

## CAN bus (automotive, industrial)
- **CAN** is a differential, multi-master bus (CAN_H / CAN_L) used in vehicles and industrial gear. Messages have an **arbitration ID** and up to 8 data bytes (classic) or 64 (CAN FD). No addresses; nodes filter by ID.
- Tooling: a USB-CAN adapter (CANable/candleLight, Kvaser) + Linux **SocketCAN** (`can-utils`: `candump`, `cansend`, `cangen`), or the **CANtact/Macchina** boards. Higher layers: OBD-II and UDS (diagnostics), J1939 (trucks).
- Reversing CAN means capturing traffic, correlating IDs with actions, and replaying, done on a bench or a vehicle **you own**, never on public roads or others' vehicles.

## 1-Wire, RS-485, Modbus
- **1-Wire** (Dallas/Maxim): a single data line (plus GND) for ibuttons, temperature sensors; each device has a unique 64-bit ROM ID.
- **RS-485 / RS-422**: differential, long-distance serial; carries **Modbus RTU** in industrial/ICS gear.
- **RS-232**: the old ±12 V PC serial; needs a MAX232-type transceiver to meet TTL UART.

## Wireless buses
BLE, Zigbee, Z-Wave, Thread, Wi-Fi and Sub-GHz are covered in the **Smart Home & Wireless** module. They're "interfaces" too, just over the air, and the same capture/decode/replay methodology applies with an SDR or protocol-specific radio.

## Choosing a multi-tool
A single adapter like the **Bus Pirate**, **Tigard**, **FT2232H board**, **Glasgow Interface Explorer**, or a **Raspberry Pi** can speak UART, SPI, I²C, JTAG/SWD and more, which is why they're staple first buys for hardware RE. The Tools module compares them.

> [!lab] Methodology for an unknown header: (1) power the board and map pins with a multimeter (GND, VCC, and which pins toggle). (2) Put a logic analyzer on the active pins and let it auto-decode (it will often recognise UART and show ASCII, or SPI/I²C frames). (3) Match the pinout to a known interface and connect the right adapter. Patience and measurement beat guessing, and random probing can short something.
