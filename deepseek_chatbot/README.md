# NewAI Chat

Отдельное Android-приложение для чата с DeepSeek и OpenAI-совместимыми провайдерами.

Возможности:

- DeepSeek, ChatGPT и AnyModel из коробки;
- добавление любого OpenAI-compatible endpoint;
- загрузка списка моделей через `/models`;
- зашифрованное хранение API-ключей на устройстве;
- секреты CI (`DEEPSEEK_API`, `ANYMODEL_KEY`, `GH_TOKEN`) попадают в приложение только через `BuildConfig`;
- несколько диалогов, Markdown, вложения, голосовой ввод и фоновые задачи.

## Сборка

```bash
./gradlew test
./gradlew lint
./gradlew assembleDebug
```

Для DeepSeek достаточно указать ключ в настройках приложения или передать `DEEPSEEK_API` при сборке.
