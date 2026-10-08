# The Wireless Landscape of a Smart Home

A modern smart home mixes several radio technologies. Knowing which is which (by frequency, protocol and role) tells you how to listen to it and where the security lives.

| Technology | Band | Range/role | Mesh? |
|---|---|---|---|
| **Wi-Fi** (802.11) | 2.4/5/6 GHz | high-bandwidth; cameras, hubs, plugs | no (infra/AP) |
| **Bluetooth / BLE** | 2.4 GHz | phones, wearables, beacons, locks | no (BLE mesh exists) |
| **Zigbee** (802.15.4) | 2.4 GHz (+868/915) | low-power sensors/bulbs | yes |
| **Thread / Matter** | 2.4 GHz (802.15.4) | IP-based mesh; the convergence layer | yes |
| **Z-Wave** | Sub-GHz (~868/908/916 MHz regional) | sensors/locks, less congestion | yes |
| **Sub-GHz / ISM** | 315/433/868/915 MHz | remotes, doorbells, weather, alarms | varies |
| **LoRa / LoRaWAN** | Sub-GHz | long-range, low-rate IoT | star |
| **Cellular (LTE-M/NB-IoT)** | licensed | wide-area IoT | — |
| **NFC/RFID** | 13.56 MHz / 125 kHz | tags, access cards | — |

> [!note] Security assessment of your own smart-home gear usually spans **three planes**: the radio protocol, the device firmware (other modules), and the **cloud/app API** (often the weakest link). Many "device" bugs are really cloud authorization flaws.

# Wi-Fi

## Essentials
- 802.11 a/b/g/n/ac/ax(Wi-Fi 6)/be(Wi-Fi 7); channels in 2.4 GHz (1–13) and 5/6 GHz.
- Frames: **management** (beacons, probe, auth, assoc, deauth), **control** (ACK, RTS/CTS), **data**.
- Security: WEP (broken), WPA/WPA2-PSK (4-way handshake; capture + offline dictionary attack on weak passphrases), **WPA3-SAE** (Dragonfly; resists offline cracking), **WPS** (PIN brute-force weakness, Pixie-Dust), and enterprise (802.1X/EAP).

## Monitoring (on your own network)
- A card that supports **monitor mode** + packet injection (Atheros/Ralink/MediaTek chipsets; the classic Alfa adapters).
- **airmon-ng** → monitor mode; **airodump-ng** to survey APs/clients; capture the WPA2 handshake; crack offline with **hashcat**/aircrack if you own the network and want to test your passphrase strength. **Kismet** and **Wireshark** for analysis.
- Deauthentication frames (pre-802.11w) can disconnect clients; **802.11w (PMF)** protects management frames. Jamming/deauthing networks you don't own is illegal.

## Role in smart home
Wi-Fi devices usually talk to a **cloud** service; capturing their traffic (proxy/mitmproxy with your own CA on your own devices, or on the LAN) reveals the API. Setup/provisioning flows (SoftAP, WPS, BLE onboarding) are a common weak point (plaintext credentials, predictable tokens).

# Bluetooth and BLE

## BLE basics
- **GATT** model: a server exposes **services**, each with **characteristics** (values you read/write/notify) identified by UUIDs.
- Advertising on 3 primary channels; connections hop across 37 data channels.
- Security: **pairing** (Just Works — no MITM protection; Passkey; Numeric Comparison; OOB), **bonding** (stored keys), and link-layer encryption (AES-CCM). Many cheap devices use *Just Works* and then enforce security poorly in the app layer.

## Exploring your own devices
- Phone apps: **nRF Connect**, **LightBlue** enumerate services/characteristics and let you read/write them, the fastest way to poke a BLE device you own.
- Linux: **BlueZ** tools (`bluetoothctl`, `gatttool`, `bettercap`'s BLE module), **Nordic nRF52840 dongle** + nRF Sniffer, or **Ubertooth One** for sniffing.
- Attacks to understand (test on your own gear): sniffing unencrypted characteristics, replaying commands (a lock/plug that accepts a static "open" write), MITM during pairing, and app-side authorization flaws. Tools/research: **Sweyntooth**, **BrakTooth**, **GATTacker/BtleJuice** (MITM).

# 802.15.4: Zigbee, Thread and Matter

## Zigbee
- Built on **IEEE 802.15.4** (2.4 GHz PHY/MAC). Roles: Coordinator (one), Routers, End Devices; forms a mesh.
- Application layer: clusters/endpoints (Zigbee Cluster Library). Security: network key (AES-128) and link keys. The classic weakness is **insecure key transport during joining** (the well-known default Trust Center link key "ZigBeeAlliance09" was used to encrypt the network key on join in older ZHA devices).
- Tooling: an 802.15.4 radio (**Atmel RZUSBstick**, **TI CC2531/CC2652** with zb-sniffer, **nRF52840** with the Nordic sniffer) + **Wireshark** (802.15.4/Zigbee dissectors), **KillerBee** (zbdump/zbreplay/zbstumbler).

## Thread and Matter
- **Thread**: a low-power **IPv6** mesh over 802.15.4 (6LoWPAN), with its own commissioning and security (DTLS-based, PSKc/network key). No application semantics by itself.
- **Matter**: the application/interoperability layer (over Wi-Fi, Thread, or Ethernet) backed by the major vendors. Uses certificate-based device attestation (DAC), CASE/PASE secure sessions, and a commissioning flow with an 11-digit setup code / QR. It raises the security bar meaningfully compared with legacy Zigbee.

# Z-Wave, Sub-GHz and SDR

## Z-Wave
- Sub-GHz (region-specific: ~868 MHz EU, ~908/916 MHz US), which means less 2.4 GHz congestion and good range. Mesh; each network has a Home ID and node IDs.
- Security: legacy **S0** (had a known key-exchange weakness) and modern **S2** (ECDH-based, much stronger). Tooling: **Z-Wave controller sticks**, **Scapy-radio**/SDR, **EZ-Wave**.

## Sub-GHz and simple ISM remotes (315/433/868/915 MHz)
Doorbells, garage/gate remotes, weather stations, some alarms and plugs use simple OOK/ASK or FSK modulation.
- **Capture → analyse → (for your own devices) replay**: an RTL-SDR or HackRF with **Universal Radio Hacker (URH)**, **rtl_433** (decodes hundreds of known sensors), or GNU Radio. The **Flipper Zero** and **CC1101** modules do Sub-GHz capture/replay for supported protocols.
- **Rolling codes** (KeeLoq and similar) defeat naive replay by changing each press; **fixed-code** remotes are replayable. Understanding the difference is the core lesson. Jamming + capture ("RollJam"-style) and code prediction are researched attacks, study them conceptually and only on hardware you own.

> [!warn] It is illegal almost everywhere to **transmit** on these bands without authorization, to jam, or to operate others' devices (garage doors, cars, alarms). Receiving/decoding is generally permitted. Keep all transmit/replay experiments to your own equipment in a controlled setting, and check local law.

## SDR workflow
1. Find the frequency (device label/FCC ID, or scan with a waterfall in GQRX/SDR#).
2. Record IQ; inspect modulation and timing in URH.
3. Decode the symbol/packet structure; identify fixed vs rolling code.
4. For your own device, craft/replay to confirm understanding.

# Cloud, Apps and OTA: The Real Attack Surface

For most commercial smart-home products, the radio is secure-enough and the **mobile app + cloud API** is where the interesting issues are.

## Methodology (on your own account/devices)
- **Intercept the app's API**: mitmproxy/Burp with your CA installed on a device you own; bypass **certificate pinning** with **Frida**/objection if needed (Mobile RE module).
- Look for **authorization flaws**: can you control another user's device by changing an ID (IDOR)? Are device tokens predictable? Does the cloud actually check ownership?
- **MQTT** is ubiquitous in IoT: check for anonymous access, wildcard topic subscription, and missing ACLs on the broker (`mosquitto_sub -t '#'` on your own broker). Lack of TLS or auth exposes all devices.
- **OTA/update security**: is the firmware signed and encrypted? Can you pin the device to an old version? Is the update URL spoofable?
- **Provisioning/onboarding**: are Wi-Fi credentials sent in cleartext over SoftAP/BLE? Are setup tokens guessable?

## Protocols you'll meet
- **MQTT** (pub/sub broker), **CoAP** (UDP, REST-like for constrained devices), **AMQP**, plain **HTTP(S) REST**, **WebSockets**, and vendor clouds (AWS IoT, Azure IoT, Tuya, etc.).

> [!lab] Safe end-to-end exercise on your own smart plug: (1) enumerate its radio (is it Wi-Fi/BLE/Zigbee?). (2) If Wi-Fi, mitmproxy its app traffic and document the API. (3) Try an IDOR: can you toggle the device with another account's session? (4) Check if its MQTT/cloud requires auth. Report anything real to the vendor; keep it to your own devices/account.

## Where to learn (legal, hands-on)
- OWASP **IoT Security Testing Guide** and **MQTT/CoAP** security notes, the "Practical IoT Hacking" book, Black Hat/DEF CON IoT village talks, and home-automation platforms (**Home Assistant**, **Zigbee2MQTT**, **OpenThread**) which let you run the whole stack yourself to study it.
