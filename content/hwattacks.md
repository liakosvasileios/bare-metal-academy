# Chains of Trust and Secure Boot

**Secure boot** ensures a device only runs code the vendor authorised, by verifying each stage before executing it. Understanding it is essential both to assess a device's security and to know why dumping/modifying firmware is sometimes blocked.

## The chain
```text
Immutable Root of Trust (BootROM, fused keys/hash) 
  → verifies signature of first-stage loader 
    → verifies next loader / TEE 
      → verifies OS/kernel 
        → (measured/verified boot of userspace)
```
- The **root of trust** is in hardware: a public key (or its hash) burned into **eFuses/OTP**, plus immutable BootROM code. Everything above is verified against it with asymmetric crypto (RSA/ECDSA) and hashes.
- **Verified boot** (Android AVB, UEFI Secure Boot, Apple's chain) rejects unsigned/modified images. **Measured boot** instead records hashes into a **TPM**/secure element for later **attestation** (the system boots but can prove what it ran).
- **Anti-rollback**: monotonic counters in fuses prevent installing older, vulnerable signed versions.

## Where it's implemented
- **x86 PC**: UEFI Secure Boot (db/dbx/KEK/PK), plus Intel Boot Guard / AMD PSB verifying the firmware itself, and a TPM for measured boot/BitLocker.
- **ARM**: BootROM → TF-A (BL1/BL2/BL31) with signatures; Android AVB on top.
- **MCUs**: vendor secure boot (STM32 RSS/SFI, NXP HAB, ESP32 Secure Boot v2) with keys in OTP.

## Why it blocks you (and when it doesn't)
If secure boot is fully enforced with a hardware root of trust, you can't run modified firmware without the signing key or a vulnerability. Weaknesses that enable research access: unsigned stages, keys left in test mode, verification bugs (not checking the whole image, signature-parsing flaws), debug/unlock backdoors, or **physical attacks** (below).

# TEEs, TrustZone and Secure Elements

## ARM TrustZone
TrustZone splits the SoC into a **Normal World** (the regular OS at EL0/EL1) and a **Secure World** (a trusted OS at Secure-EL1, monitor at EL3). An `smc` call crosses between them. The Secure World hosts a **TEE OS**: Qualcomm **QSEE**, Trustonic **Kinibi**, Samsung **TEEGRIS**, Google **Trusty**, open-source **OP-TEE**.

- **Trusted Applications (TAs)** run in the TEE and handle secrets: DRM (Widevine L1), key management (keystore/keymaster/StrongBox), biometrics, mobile payments.
- The Normal World can only call defined TA interfaces; it can't read Secure World memory. TEE vulnerabilities (in TAs or the TEE OS) are high-value because they breach that boundary.

## Dedicated secure elements
Separate chips/cores with their own CPU and storage, isolated even from the main SoC:
- Apple **Secure Enclave (SEP)**, Google **Titan M/M2**, Samsung **eSE/Knox Vault**, **TPM** (PC), **SIM/eSIM (UICC)**, EMV payment chips.
- They enforce **rate limiting** on passcode attempts (which is what makes phone brute force slow), store keys that never leave the chip, and run attestation.

## TPM (Trusted Platform Module)
A chip (or firmware TPM, fTPM) that stores keys, performs crypto, and holds **PCRs** (Platform Configuration Registers) that accumulate boot measurements. BitLocker can seal the disk key to PCR values so the disk only unlocks if the boot chain is unchanged. Known research: sniffing the discrete TPM's **LPC/SPI bus** at boot to capture the BitLocker key when no PIN is used, a reminder that a secure chip is only as secure as its connections.

# Readout Protection and Debug Locking

Vendors lock JTAG/SWD and flash readback to stop the dumping you learned in earlier modules.

## MCU readout protection
- **STM32 RDP** (Readout Protection): Level 0 (open), **Level 1** (flash read via debug blocked; debug still attaches, but reading flash triggers mass-erase on some ops), **Level 2** (debug permanently disabled, irreversible).
- **NXP CRP**, **Microchip/Atmel lock bits**, **TI code protection**, **ESP32 flash encryption + secure boot + eFuse `JTAG disable`**.
- These are set by blowing fuses or writing option bytes. Level 2-style settings are often **one-way**.

## What's left when debug is locked
- Observe behaviour via UART/LEDs/side channels.
- Attack a different interface (an unprotected bootloader ROM command, a USB DFU path, an SPI flash that's external and unencrypted).
- **Physical attacks** (next section) to bypass the protection, used in research and by advanced forensic labs on devices they're authorised to examine.

> [!note] Many documented bypasses exploit **imperfect** protection: a debug interface that's disabled late, a bootloader command that still reads memory, flash encryption with a recoverable key, or a glitchable check. Fully-correct implementations resist these.

# Fault Injection (Glitching)

**Fault injection** deliberately pushes hardware outside its operating envelope for a moment to cause a *controlled error*, typically to make the CPU **skip or corrupt an instruction**, such as the comparison that enforces secure boot or readout protection. This is advanced research done on your own hardware.

## Types
- **Voltage glitching**: drop (or spike) the core voltage for nanoseconds to microseconds at a precise moment, causing a misexecution. A "crowbar" (a MOSFET shorting the rail briefly) is the common tool.
- **Clock glitching**: insert an extra/shortened clock edge so an instruction doesn't complete correctly (works where the clock is external/controllable).
- **Electromagnetic FI (EMFI)**: a localized EM pulse from a coil injects faults without electrical contact (PicoEMP, ChipSHOUTER).
- **Optical/laser FI**: decapsulate the chip and pulse transistors with a laser, the most precise and most expensive; the domain of specialised labs.
- **Body-biasing** and temperature attacks: other ways to disturb operation.

## The method (conceptual)
1. Identify the target operation (e.g. the signature-check branch) and a trigger (a GPIO/UART pattern, power signature) to time against.
2. Sweep **timing and glitch parameters** (delay, width, voltage) over many attempts; most attempts crash or do nothing.
3. Detect success (the device boots unsigned code, or dumps memory).
Tools: **ChipWhisperer** (the standard teaching/research platform), custom FPGA glitchers.

## Defenses
Redundant checks, random delays, voltage/clock/EM sensors, error-detecting state machines, "do the security-critical thing twice and compare", and never relying on a single branch. Security-certified parts (Common Criteria, EMVCo) are explicitly tested against FI.

# Side-Channel Analysis and Physical Extraction

## Side channels
Secrets can leak through **physical measurements** correlated with the data being processed, even with perfect software.
- **Power analysis**: **SPA** (read operations from a single power trace) and **DPA/CPA** (statistically correlate many traces with guessed intermediate values to recover a key, e.g. one AES byte at a time). Devastating against unprotected crypto.
- **EM analysis**: the same idea using the chip's electromagnetic emissions (no shunt resistor needed).
- **Timing attacks**: data-dependent execution time (non-constant-time comparisons, square-and-multiply) leaks keys, remotely in some cases.
- **Acoustic, photonic, cache** (software side channels, see Architecture) round out the family.
- Countermeasures: **constant-time** code, **masking/blinding**, randomization, shielding, balanced logic. The ChipWhisperer courses teach DPA hands-on on your own target.

## Invasive and semi-invasive extraction
- **Decapsulation** (acid/laser) exposes the die; **microprobing** taps internal signals; **FIB** (Focused Ion Beam) edits circuits; **optical ROM reading** images mask ROM bits directly. These recover keys/firmware from chips that resist everything else, in high-end labs, and are relevant to understanding why "unextractable" is relative and expensive.

## Memory remanence and cold boot
As in the Architecture module: DRAM keeps data briefly after power-off (longer when cold), enabling **cold boot** recovery of disk-encryption keys from RAM. A defense is to not keep keys in RAM, or to scrub on reset.

> [!warn] These techniques are legitimate in **security research, product evaluation, and authorised forensics**, performed on devices you own or are engaged to assess. They can also be destructive and are regulated in some contexts. Learn them on development boards and CTF-style targets (ChipWhisperer, the "rhme" challenges, pico/HW CTFs). Never apply them to others' devices.

## Learning resources (hands-on, legal)
- **ChipWhisperer** tutorials (glitching + DPA on an included target).
- **rhme2/rhme3** and hardware CTF challenges, **Hardware Hacking Handbook** (Woudenberg & O'Flynn), **The Hardware Hacking Handbook** and **Power Analysis Attacks** (Mangard et al.) for theory.
- Vendor security app-notes (STM32 RDP, ESP32 secure boot) to see defenses from the designer's side.
