# 🏰 ai-ulu: Otonom Ekosistem Teknik Mimarisi

Bu belge, **ai-ulu** organizasyonunun "Kendi Kendini Yöneten Startup" vizyonunu hayata geçiren teknik katmanları detaylandırır.

## 1. Akıllı CI/CD Katmanı (Smart Pipeline)
- **Dosya:** `.github/workflows/pipeline.yml`
- **Yetenekler:** 
  - **Otonom Tanımlama:** Projenin bağımlılık yöneticisini (pnpm, npm, poetry) ve yapısını (monorepo/standard) çalışma anında tespit eder.
  - **Dinamik Cache:** Tespit edilen araca göre otonom olarak cache stratejisi uygular.
  - **Hata Yakalama:** Bir hata oluştuğunda direkt olarak `repair-agent`'ı uyarır.

## 2. Otonom Ajanlar (The Sentries)
### A. Repair Agent (Tamirci)
- **Mantık:** Hata loglarını analiz eder, sorunu çözmek için otonom bir "fix" branch'i açar ve PR gönderir.
- **Entegrasyon:** `tasks.md` dosyalarındaki görevleri otonom olarak tamamlar (`[ ]` -> `[x]`).

### B. Media Agent (Sözcü)
- **Mantık:** Teknik başarıyı (tamir veya yeni özellik) pazarlama değerine dönüştürür.
- **Kanal:** LinkedIn ve X formatında otonom Markdown çıktısı üretir.
- **Mekanizma:** GitHub Issues üzerinden senin onayına sunar.

### C. Chaos Monkey (Sınayıcı)
- **Mantık:** Organizasyonun direncini ölçmek için rastgele repolara kontrollü hatalar bırakır.

## 3. Gözlemlenebilirlik (War Room)
- **Adres:** [ai-ulu.github.io](https://ai-ulu.github.io)
- **Mimari:** GitHub API üzerinden beslenen dinamik Dashboard.
- **Metrikler:** 
  - **AOR:** Otonom Operasyon Oranı.
  - **RSI:** Dayanıklılık Kararlılık Endeksi.
  - **Neural Log:** Ajanların anlık aktiviteleri.

## 4. Stratejik Varlık Yönetimi
- **Unicorns:** Ticari potansiyeli en yüksek amiral gemileri (GodFather, QA, UluCore, GitAura, Nexus-Agi).
- **Muscle:** Altyapı ve yetenek kütüphaneleri.
- **Archive:** Silinmesi gereken profesyonellik dışı test repoları.
