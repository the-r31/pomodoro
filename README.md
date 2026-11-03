# Pomodoro (Tauri v2 + React + TS)

## Personal planner
- **Planner → Lists**: create/rename lists, organize tasks, set priority and notes, pick a gradient background or upload a local PNG/JPEG/WebP photo under 500 KB. Removing a list moves its tasks to Inbox.
- **Matrix**: four Eisenhower quadrants. High/medium priority is important; tasks starting today or earlier are urgent. Each task can override these automatic rules.
- **Filters**: search, list, completion status, date, and priority. AND/OR combines date and priority; search/list/status remain required. Save named views and use them in Lists, Matrix, or Timeline.
- **Timeline**: week/month scales, list groups, multi-day blocks, drag to shift dates, and one-day arrow controls. Scroll horizontally in the compact window.
- **Activity**: the latest 1,000 local task/list/habit changes, with list and task selectors. Existing history is not fabricated. This is a single-user log, not shared-team collaboration.
- **Habits**: daily check-ins for the current week, saved locally.
- **Reminders**: at start, a custom number of minutes before start, or at the end. Optional repeat every 1/5/15 minutes until dismissed or completed; snooze for 5 minutes. All-day reminders use 9:00 AM. Reminders run while the app is open, including widget mode; they do not run after the app exits. Recent missed reminders (within 24 hours) appear on reopen. Delivery is checked every 15 seconds and may be delayed by OS sleep or webview throttling.
- **Widgets**: Mini/Wide timer plus Tasks, Calendar, Matrix, and Habits. These are alternate views of the same native window, with pin and drag controls; they are not multiple independent windows or Windows Widgets extensions.
- Existing tasks are migrated into the workspace store on their first change, preserving their IDs, completion, and schedules. A compatibility copy is also kept in `pomo-tasks`.

## Calendar
- Open **Calendar** from the main screen and switch between Day, Week, and Month views.
- Use **+** to schedule a task with local start/end dates and times, or mark it **All day**. Multi-day events are shown on every intersecting day.
- Click an event to edit it or remove its schedule. Removing a schedule keeps the task in the task list.
- Existing unfinished tasks appear under **Not scheduled**. Completion stays synchronized with the main Tasks list.
- Use the play button in a day's agenda to start your configured focus session for that task. Finish or reset an existing timer first.
- Week view scrolls horizontally in the compact desktop window. Overlapping events use separate columns.
- Schedules are stored locally; this is not a connection to an external calendar service.

## Yangi imkoniyatlar
- Qora/orange dizayn va Focus Statistics sahifasi: kunlik/jami hisoblar, Day/Week/Month/Year filtrlari, trend va vazifalar bo‘yicha fokus taqsimoti.
- Sessiyalar tarixi, haftalik timeline, soatlik fokus grafigi, yillik faollik kataklari va JSON eksport.
- Soatlik grafikda faqat tugallangan yangi sessiyalarning faol vaqti hisoblanadi, pause oralig‘i chiqarib tashlanadi. Eski sessiyalarga vaqt yoki vazifa tafsilotlari to‘qib qo‘shilmaydi.
- Mini (300×250) va keng (440×200) desktop widget ko‘rinishlari.
- Widget sarlavhasidan sudrab ko‘chirish, Pin/Unpin, Ochish orqali asosiy oynaga qaytish.
- Widget va asosiy oyna bitta timerni ishlatadi; ko‘rinish almashtirish sessiyani to‘xtatmaydi.
- Vazifalarni qo‘shish, bajarilgan deb belgilash va o‘chirish; widgetda birinchi bajarilmagan vazifa chiqadi.
- Kunlik sessiya maqsadi, mahalliy sana bo‘yicha statistika, ovozni yoqish/o‘chirish.
- Timer, vazifalar va sozlamalar lokal saqlanadi. Yopiq paytda muddati tugagan sessiya keyingi ochishda bir marta qayd etiladi; keyingi sessiya o‘sha vaqtdan boshlanadi.
- Eski sessiya sonlari saqlanadi. Aniq fokus daqiqalari ushbu versiyadan boshlab hisoblanadi; avvalgi daqiqalar taxmin qilinmaydi.

Brauzerda widget faqat ko‘rinish sifatida ishlaydi. Alohida desktop oyna, sudrash va always-on-top uchun `npm run tauri dev` ishlating. Widgetlar asosiy oynaning ixcham rejimlari, Windows Widgets paneli kengaytmasi emas.

## Tekshirish
```bash
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
node --experimental-strip-types --test tests/timer.test.mjs tests/statistics.test.mjs tests/calendar.test.mjs tests/planner.test.mjs # Node 22.6+
```

Ixtiyoriy UI smoke test: Microsoft Edge va `playwright` o‘rnatilgan bo‘lsa, `node tests/ui-smoke.mjs` ishlating. Test vaqtinchalik brauzer profilida ishlaydi, o‘z Vite serverini 1421-portda ochib yopadi va `tests/*-preview.png` rasmlarini yaratadi. Playwright boshqa joyda bo‘lsa, uning `index.mjs` fayliga `file:///...` URLni birinchi argument sifatida bering.

## Talablar
- Node 18+
- Rust (https://rustup.rs)
- OS dependency'lar: https://tauri.app/start/prerequisites/

## Ishga tushirish
```bash
npm install
python3 make_icon.py            # app-icon.png yaratadi (yoki o'zingnikini qo'y, 1024x1024)
npm run tauri icon app-icon.png # barcha iconlarni generatsiya qiladi
npm run tauri dev               # development
npm run tauri build             # .exe / .dmg / .deb / .AppImage
```
