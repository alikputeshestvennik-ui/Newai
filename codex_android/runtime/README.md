# Codex на телефоне

Android-приложение поднимает это окружение само: при первом запуске оно
распаковывает Termux bootstrap из APK, ставит Python, pip, Git, GitHub CLI
(`gh`), ripgrep и архивные утилиты, затем скачивает статический Codex для arm64 и его
`codex-code-mode-host`. Termux, ручной ключ и отдельный Linux-сервер не нужны.

Codex сбрасывает переменные `LD_*` при старте, поэтому мост возвращает
`LD_LIBRARY_PATH` и `LD_PRELOAD` уже в окружение дочерней команды. Login shell
и shell snapshots отключены: профиль Android может заменить `PATH` и скрыть
встроенные Python, Git и ripgrep. Если команда так и не запустилась, сервис
возвращает явную ошибку инструмента, а не подменяет её вежливым ответом модели.

Сервис слушает только `127.0.0.1:18766` и принимает bearer-ключ из
`~/.ten-local/token`. Ключ создаётся автоматически и не показывается в логах.
Ключи провайдеров вводятся в настройках приложения; в APK их нет.

Рабочие файлы: `~/.ten-local/workspace/<dialog-id>`. У каждого диалога Codex
свой провайдер, модель и рабочая папка. Вложения пользователя копируются в
`workspace/<dialog-id>/attachments`, а созданные или изменённые файлы
возвращаются в чат карточками.

Провайдеры:

- `chatgpt:<model>` — OpenAI Responses API через вход в аккаунт ChatGPT;
- `deepseek:<model>` — прямой DeepSeek API с ключом из настроек (OpenAI Responses);
- `any:<model>` и `cx/`, `cc/`, `ds/`, `ag/`, `kmc/` — AnyModel с ключом из настроек (OpenAI Responses);
- `compatible:<model>` — свой HTTPS endpoint с OpenAI Responses API (`/responses`) и ключ.

Тесты: `python3 -m unittest discover -s codex_android/runtime -v`

Проверка работоспособности на реальном телефоне всё ещё требуется: CI
собирает и подписывает APK, но не запускает Android-устройство.
