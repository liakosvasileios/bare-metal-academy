# Electricity Basics for Hardware Hackers

You don't need an EE degree to reverse hardware, but you do need enough electronics to measure safely, not destroy the target, and understand datasheets.

## The three quantities
- **Voltage (V, volts)**: electrical potential difference. Always measured *between two points*; "3.3 V" means 3.3 V relative to ground (GND).
- **Current (I, amps)**: rate of charge flow, measured *through* something (break the circuit, or use a sense resistor / clamp).
- **Resistance (R, ohms Ω)**: opposition to current.

## Ohm's law and power
```text
V = I × R        I = V / R        R = V / I
P = V × I = I²R = V²/R   (power in watts)
```
A 220 Ω resistor across 3.3 V passes 3.3/220 = 15 mA and dissipates 3.3 × 0.015 ≈ 50 mW. The Lab's Electronics calculator does these for you.

## Series and parallel
- **Series** resistors add: R = R1 + R2 + …. Same current through each; voltage divides.
- **Parallel** resistors: 1/R = 1/R1 + 1/R2 + …. Same voltage across each; current divides.
- **Capacitors** are the opposite (parallel adds, series combines like parallel resistors).

## AC/DC and signals
Digital devices run on **DC**. Logic signals are square waves switching between two voltages. Key signal properties: frequency (Hz), period (1/f), duty cycle, rise/fall time, and amplitude. A UART bit at 115200 baud lasts 1/115200 ≈ 8.68 µs (the Lab can turn a measured pulse width into a baud rate).

# Logic Levels, GPIO and Interfacing

## Voltage standards
Most modern SoCs and flash chips run at **3.3 V** or **1.8 V** logic; older/simple parts use **5 V**. Within a family:
- Logic HIGH ("1") is a voltage above V_IH; LOW ("0") is below V_IL; in between is undefined.
- For 3.3 V CMOS, roughly: HIGH ≳ 2.0 V, LOW ≲ 0.8 V.

> [!warn] **Never connect a 5 V output to a 3.3 V (or 1.8 V) input without level shifting**; you can destroy the pin or the chip. Equally, measure the target's logic voltage *before* connecting a 3.3 V adapter. Many routers use 3.3 V UART; some modern SoCs and most flash are 1.8 V. Using a 3.3 V USB-UART on a 1.8 V line can damage it.

## GPIO and its states
A general-purpose I/O pin can be an **input** (reads a voltage) or **output** (drives HIGH/LOW). Inputs are high-impedance; floating inputs read random noise, so they need a defined level.

- **Pull-up resistor**: ties a line to Vcc so it reads HIGH when nothing drives it (typical 4.7 kΩ–10 kΩ). I²C requires pull-ups on SDA/SCL.
- **Pull-down resistor**: ties a line to GND so it reads LOW when idle.
- **Open-drain / open-collector**: the pin can only pull LOW; an external pull-up provides HIGH. Used for shared buses (I²C) and interrupt lines so multiple devices can share one wire.
- **Push-pull**: the pin actively drives both HIGH and LOW (normal GPIO/UART output).

## Level shifting
To bridge voltage domains safely:
- **Bidirectional MOSFET level shifter** (BSS138-based) for I²C and other open-drain, bidirectional lines.
- **Dedicated level-shifter ICs** (TXB0108, TXS0108) for multiple fast lines.
- A **voltage divider** (two resistors) works only for slow, unidirectional inputs (e.g. stepping a 5 V TX down to 3.3 V RX). Vout = Vin × R2/(R1+R2). Not for bidirectional or high-speed signals. The Lab has a divider calculator.

# Components You'll Recognise on a Board

| Component | Markings / package | Role |
|---|---|---|
| **Resistor** | SMD: 3/4-digit code ("103"=10 kΩ, "4R7"=4.7 Ω) or E96 code; THT: colour bands | limit current, dividers, pull-ups |
| **Capacitor** | ceramic (unmarked SMD), electrolytic (can, polarity!), tantalum | decoupling, filtering, timing |
| **Inductor / ferrite bead** | coil / small block | filtering, power supplies, EMI |
| **Diode** | band = cathode; LED; Schottky; Zener | rectify, protect, regulate |
| **Transistor / MOSFET** | SOT-23, etc. | switching, amplifying, level shifting |
| **Crystal / oscillator** | metal can, often 2 or 4 pads | clock source (e.g. 25 MHz, 32.768 kHz RTC) |
| **Voltage regulator** | LDO (SOT-23/223), buck/boost modules | make 3.3/1.8/1.2 V rails |
| **Connector / header** | 0.1" or 0.05" pads, test points | often debug (UART/JTAG) access! |

## The chips that matter most
- **SoC / MCU / CPU**: the big chip, usually BGA or QFP. Note the part number and look up the datasheet.
- **DRAM**: separate DDR chip(s) near the SoC (or PoP-stacked on top on phones).
- **Flash storage**: SPI NOR (8-pin SOIC/WSON, e.g. Winbond W25Q), SPI NAND, parallel NAND (TSOP48), or eMMC/UFS (BGA). This is where firmware lives, the prime dump target.
- **PMIC**: power management IC.
- **PHY / radio**: Ethernet PHY, Wi-Fi/BT combo, cellular modem.

> [!tip] Read the markings. Search the exact part number (plus "datasheet" or "pinout"). The datasheet gives you pinouts, logic voltage, protocols and often debug features. For an unknown SoC, the DRAM and flash part numbers alone often reveal the platform.

# PCB Anatomy and Reading a Board

## Construction
A PCB has copper layers separated by insulating FR-4. Cheap devices use 2 layers; phones use 8–12+. Features:
- **Traces**: copper wires. **Vias**: plated holes connecting layers.
- **Pads / test points**: exposed copper for probing; often labelled (TP1, RX, TX, GND, CLK) or arranged as a header footprint.
- **Silkscreen**: the printed labels (R1, C5, U3, J2, and sometimes "UART", "JTAG").
- **Reference designators**: R=resistor, C=capacitor, L=inductor, D=diode, Q=transistor, U=IC, J=connector, Y/X=crystal, TP=test point, FB=ferrite bead, SW=switch.
- **Ground plane / power plane**: large copper fills.

## Finding debug interfaces (the hacker's goal)
- Look for **unpopulated headers** (rows of 2–6 holes/pads), groups of **test points**, and anything silk-screened RX/TX/GND/VCC or TCK/TMS/TDI/TDO.
- UART is commonly 3–4 pads: VCC (often leave unconnected), GND, TX, RX.
- Measure to confirm (see the Tools module): GND is continuous with the shield/large planes; TX idles HIGH at logic voltage and shows activity (changing voltage) on boot; VCC is a steady rail.
- JTAG/SWD often appear as a 10/20-pin header or a cluster of fine-pitch pads near the SoC.

## Getting the schematic (when you can)
- FCC ID lookup (fccid.io) often yields internal photos and sometimes block diagrams.
- Manufacturer service manuals, datasheets and reference designs for the SoC.
- For dense boards, X-ray and board-view files reveal hidden/BGA connections.

# Soldering, Rework and Safe Measurement

## Tools
- **Temperature-controlled soldering iron** (fine tip), good leaded or lead-free solder, **flux** (essential for SMD and rework), solder wick and a solder sucker.
- **Hot-air rework station** for SMD components and chip removal/reflow.
- **Helping hands / PCB holder**, fume extraction, good light and magnification.
- **Flat/fine tweezers**, **0.1" header pins**, **enamelled magnet wire** for microsoldering, and **Kapton tape**.
- **Chip clips** (SOIC-8/16 test clip, Pomona) to read a flash chip **in-circuit** without desoldering.

## Technique essentials
- Tin the tip; keep it clean. Heat the joint, then feed solder to the joint, not the tip.
- Use flux generously for SMD; drag-soldering and hot-air reflow are your friends.
- For fine UART/JTAG wiring, solder to pads/test points and strain-relief the wires (hot glue/Kapton) so they don't rip the pads off.

## Safety
> [!warn] Safety rules: unplug mains and discharge big capacitors before touching anything connected to the wall; **never** probe the primary side of an AC/mains power supply with normal tools. Wear eye protection when soldering/clipping leads. Lead solder: wash hands, don't eat at the bench, ventilate. Li-ion/LiPo batteries are a fire hazard: don't puncture, short, or overheat them, and disconnect the battery on phones before rework when practical.

## ESD (electrostatic discharge)
Static can silently damage CMOS inputs. Use an **anti-static wrist strap** tied to a ground point, an ESD mat, and store boards/chips in anti-static bags. This matters most with exposed flash pins and fine-geometry SoCs. Damaged inputs may fail immediately or become intermittent, which is maddening to debug.

> [!lab] First-board exercise (on a device you own and don't mind risking): identify the SoC, DRAM and flash from their markings; find GND, a 3.3 V rail, and a candidate UART header with a multimeter; then read the UART module and connect a USB-UART adapter to watch it boot.
