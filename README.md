# Digicam Webcam — Live Effects (Web)

Repo demo web webcam dengan berbagai efek bergaya "digicam", bisa ambil foto & rekam video langsung di browser, lalu download.

## Fitur
- Live camera preview (WebRTC getUserMedia)
- Beragam efek: grayscale, sepia, RGB split, vintage, scanlines/grain, invert
- Capture foto (PNG)
- Rekam video (WebM) — merekam dari canvas sehingga efek tersimpan
- Pilihan kamera (jika device punya lebih dari 1)
- iPhone-friendly: `playsinline` & HTTPS requirement

## Cara pakai lokal
1. Clone repo:
```bash
git clone https://github.com/username/digicam-webcam.git
cd digicam-webcam
