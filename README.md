<div align="center">

# SpiritVale Drops Overlay

### Packet-based Rare Drop Overlay for SpiritVale

Lightweight • Portable • Sound Packs • Own Drop Detection

**Created by MrNexus**

สนับสนุนค่ากาแฟ https://easydonate.app/mrnexus

---

![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%2F%2011-blue)
![Version](https://img.shields.io/badge/Version-v1.0.0-success)
![Status](https://img.shields.io/badge/Status-Stable-brightgreen)
![License](https://img.shields.io/badge/License-All%20Rights%20Reserved-red)

</div>

---

# 🇹🇭 ภาษาไทย

## SpiritVale Drops Overlay คืออะไร?

SpiritVale Drops Overlay เป็นโปรแกรม Overlay สำหรับเกม **SpiritVale** ที่ตรวจจับ Rare Drop จากข้อมูล Network Packet ของเกม พร้อมระบบแจ้งเตือนด้วยเสียง, Grind Tracker, History และ Profiles

โปรแกรมเป็น **Portable** ไม่ต้องติดตั้ง เพียงแตกไฟล์แล้วเปิดใช้งานได้ทันที

---

# ✨ Features

| Feature | รายละเอียด |
| --- | --- |
| 🎯 Rare Drop Detection | ตรวจจับ Rare Drop จาก Packet |
| 👤 Own Drop Detection | แจ้งเตือนเฉพาะ Rare Drop ของตัวเอง |
| 🔊 Custom Sound Packs | เปลี่ยนชุดเสียงได้ |
| 📊 Grind Tracker | นับเวลา Kill Coins EXP |
| 📜 Drop History | บันทึก Rare Drop |
| 💾 Profiles | บันทึกการตั้งค่าหลายชุด |
| ⌨ Ctrl + Alt + O | ซ่อน/แสดง Overlay |
| 📦 Portable | ใช้งานได้โดยไม่ต้องติดตั้ง |
| 📝 Runtime Logs | เก็บ Log สำหรับตรวจสอบปัญหา |


---

# 📷 ตัวอย่าง

## 📊 Grind Tracker and History

<p align="center">
  <img src="docs/grind.png" width="48%">
  <img src="docs/history.png" width="48%">
</p>

---

# 🔒 ความปลอดภัย

Overlay นี้

✅ อ่านข้อมูล Packet เท่านั้น

Overlay นี้

❌ ไม่แก้ไขไฟล์เกม

❌ ไม่ Inject DLL

❌ ไม่ Hook Process

❌ ไม่แก้ Memory

❌ ไม่ส่ง Packet

❌ ไม่มีระบบ Bot

❌ ไม่มี Macro

โปรแกรมทำหน้าที่เพียงอ่านข้อมูล Network และแสดงผลบน Overlay เท่านั้น

---

# 📦 การติดตั้ง

## 1. ดาวน์โหลด Release ล่าสุด

ดาวน์โหลด

```
SpiritValeDropsOverlay-v1.0.0-win64.zip
```

จากหน้า

**Releases**

---

## 2. แตกไฟล์

เช่น

```
SpiritValeDropsOverlay/
```

---

## 3. ติดตั้ง Npcap

ดาวน์โหลดจาก

https://npcap.com

ถ้าไม่ติดตั้งจะไม่สามารถใช้งานได้นะครับ

---

## 4. เปิดโปรแกรม

```
SpiritValeDropsOverlay.exe ซึ่งจะอยู่ใน folder bin
```
> อย่าย้ายไฟล์ EXE ออกจากโฟลเดอร์ `bin`

จากนั้นเปิดเกม SpiritVale

---

# ⌨ Hotkey

```
Ctrl + Alt + O
```

ซ่อน / แสดง Overlay

> แม้ Overlay ถูกซ่อน การตรวจจับ Packet จะยังทำงานต่อ

---

# 🔊 Sound Pack

โฟลเดอร์ Sound Pack

```text
sounds/packs/
```

สร้างโฟลเดอร์ใหม่ได้เอง เช่น

```text
sounds/
└── packs/
    └── My Pack/
        ├── card_boss.mp3
        ├── card_normal.wav
        ├── gem_boss.mp3
        ├── gem_normal.wav
        ├── essence.wav
        ├── eggs.wav
        └── lure_boss.wav
```

## สำคัญ

- รองรับ `.mp3` และ `.wav`
- สามารถเปลี่ยนเสียงได้ตามต้องการ
- **ชื่อไฟล์ต้องตรงกับชื่อเดิม**

เช่น

```text
card_boss.mp3
```

หากเปลี่ยนชื่อเป็น

```text
boss_card.mp3
```

Overlay จะหาไฟล์ไม่พบ

หากไม่มีไฟล์บางไฟล์ Overlay จะใช้เสียงจาก Default โดยอัตโนมัติ


---

# 👤 Own Drop Detection

เมื่อเปิด **Own Drops Only**

- แจ้งเตือนเฉพาะ Rare Drop ของตัวเอง
- Rare Drop ของผู้เล่นคนอื่นจะไม่เล่นเสียง

ในบางสถานการณ์เสียงอาจดังหลังเก็บของ เพราะ Overlay ต้องรอ Packet เพิ่มเติมเพื่อยืนยันเจ้าของ Drop

นี่เป็นพฤติกรรมที่ออกแบบไว้ ไม่ใช่ Bug

---

# 📊 Grind Tracker

เก็บ

- เวลา
- Kill
- Coins
- EXP

เริ่มเมื่อกด Start และหยุดเมื่อกด Stop

---


# 👤 Profiles

รองรับหลาย Profile เช่น

- Default
- Farming
- Raid
- Silent

แต่ละ Profile จะจำ

- Volume
- Opacity
- Sound Pack
- Sound Filter

แยกจากกัน

---

# 📁 โครงสร้างโฟลเดอร์

```
SpiritValeDropsOverlay/

├── bin/
├── sounds/
│   └── packs/
├── data/
│   ├── logs/
│   └── settings.json
└── SpiritValeDropsOverlay.exe
```

---

# 📝 Log

ไฟล์ Log จะอยู่ที่

```
data/logs/
```

ใช้สำหรับตรวจสอบปัญหา

---

# ❓ FAQ

### โปรแกรมแก้ไฟล์เกมหรือไม่?

ไม่

---

### โปรแกรมใช้ Memory Hack หรือไม่?

ไม่

---

### ต้องติดตั้งหรือไม่?

ไม่

เป็น Portable

---

### ต้องติดตั้งอะไรเพิ่มหรือไม่?

ต้องติดตั้ง

Npcap

---

### Sound Pack อยู่ที่ไหน?

```
sounds/packs/
```

---

# ❤️ สนับสนุนการพัฒนา

หากโปรแกรมนี้มีประโยชน์สำหรับคุณ
และต้องการสนับสนุนการพัฒนาต่อ

สามารถสนับสนุน **MrNexus** ได้ที่ลิงค์ด้านล่างนะครับ

> https://easydonate.app/mrnexus

---

# 🇺🇸 English

English documentation will be added soon.

---

# 📄 License

Copyright © 2026 **MrNexus**

All Rights Reserved.