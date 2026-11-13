# NewAI

Самостоятельное Android-приложение на базе режима Codex из «Тени».
Весь проект находится в [`codex_android`](codex_android); подготовлена сборка через GitHub Actions.

- Отдельный пакет `ru.alim.newai`, устанавливается рядом с «Тенью».
- Локальное окружение Python/Git/GitHub CLI/Codex, чат с сохранением истории,
  выполнение задач в foreground service, остановка и выдача файлов.
- Вход ChatGPT, DeepSeek, AnyModel и совместимый HTTPS Responses API.
- Диктовка через DeepSeek: удержать микрофон, закончить кнопкой «Готово».
- Ключей моделей и GitHub в APK нет: вводятся в настройках и хранятся через
  Android Keystore / EncryptedSharedPreferences. Резервное копирование отключено.

## Сборка

Автоматическая сборка: [`.github/workflows/codex-apk.yml`](.github/workflows/codex-apk.yml).
Запускается при изменениях приложения и вручную через GitHub Actions.

Workflow `Build NewAI APK` проверяет Python-сервер и Android-код, готовит runtime,
собирает APK и проверяет подпись. Результат — артефакт `NewAI-signed-apk`.
Используются только четыре GitHub Actions secrets:

- `ANDROID_KEYSTORE_B64`
- `ANDROID_STORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Локально: JDK 17, Android SDK 34, Gradle 8.13; затем
`python3 codex_android/scripts/prepare_runtime_assets.py` и
`gradle -p codex_android :app:assembleDebug`.

## Первый запуск

Нужен arm64-телефон с Android 8+. При первом запуске приложение распаковывает
окружение и скачивает закреплённые версии Codex и code-mode-host с проверкой SHA256.
В настройках подключить аккаунт либо ввести ключ и выбрать идентификатор модели
с префиксом `chatgpt:`, `deepseek:`, `any:` или `compatible:`. Для работы с
репозиториями ввести собственный GitHub-токен. Для диктовки нужен ключ DeepSeek.

Порты приложения: `18766` (сервер) и `18767` (прокси); у «Тени» они другие.
`targetSdk 28` сохранён из исходного runtime: Android запрещает исполнение
бинарников из приватного каталога при targetSdk 29+. Это APK для установки
напрямую, не конфигурация для публикации в Google Play.

Источник: Bolshoi, ветка `codex/ten-local-runtime`, коммит
`94faba528df67b8c340e1c5903bb597ae817149d`. Перенесены только компоненты Codex;
Telegram, почта, платежи, маршруты и прочие режимы «Тени» не включены.
