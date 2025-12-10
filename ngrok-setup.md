# Настройка ngrok для локального сервера

ngrok создает безопасный туннель к вашему локальному серверу, позволяя использовать `wss://` для WebSocket соединений.

## Установка ngrok

### macOS:
```bash
brew install ngrok/ngrok/ngrok
```

### Linux:
```bash
# Скачайте с https://ngrok.com/download
# Или через snap
snap install ngrok
```

### Windows:
Скачайте установщик с https://ngrok.com/download

## Регистрация и получение токена

1. Зарегистрируйтесь на https://ngrok.com (бесплатно)
2. Получите authtoken из Dashboard: https://dashboard.ngrok.com/get-started/your-authtoken
3. Настройте токен:
```bash
ngrok config add-authtoken YOUR_AUTHTOKEN
```

## Запуск ngrok

### Вариант 1: Простой запуск (временный URL)

```bash
ngrok http 3000
```

Вы получите URL вида: `https://abc123.ngrok-free.app`

**Важно:** Бесплатный ngrok генерирует новый URL при каждом запуске.

### Вариант 2: Статический домен (рекомендуется)

1. В ngrok Dashboard → Domains создайте бесплатный домен
2. Запустите с доменом:
```bash
ngrok http 3000 --domain=your-domain.ngrok-free.app
```

### Вариант 3: Использование конфигурационного файла

Создайте файл `ngrok.yml` в корне проекта:

```yaml
version: "2"
authtoken: YOUR_AUTHTOKEN
tunnels:
  server:
    addr: 3000
    proto: http
    # Раскомментируйте для статического домена:
    # domain: your-domain.ngrok-free.app
```

Запуск:
```bash
ngrok start server
```

## Настройка переменных окружения

После запуска ngrok вы получите HTTPS URL. Используйте его для WebSocket:

### Для Vercel:

```bash
# Через CLI
vercel env add VITE_WS_URL production
# Введите: wss://your-ngrok-url.ngrok-free.app/ws

# Или через Dashboard:
# https://vercel.com/dashboard → проект → Settings → Environment Variables
# Добавьте: VITE_WS_URL = wss://your-ngrok-url.ngrok-free.app/ws
```

### Для GitHub Pages:

В GitHub Secrets добавьте:
- Name: `VITE_WS_URL`
- Value: `wss://your-ngrok-url.ngrok-free.app/ws`

## Автоматический запуск (опционально)

Можно создать скрипт для автоматического запуска ngrok вместе с сервером.

### macOS/Linux:

Создайте файл `start-with-ngrok.sh`:

```bash
#!/bin/bash

# Запуск сервера в фоне
npm start &
SERVER_PID=$!

# Ждем запуска сервера
sleep 2

# Запуск ngrok
ngrok http 3000 &
NGROK_PID=$!

# Функция для очистки при выходе
cleanup() {
    echo "Остановка процессов..."
    kill $SERVER_PID $NGROK_PID 2>/dev/null
    exit
}

trap cleanup SIGINT SIGTERM

# Ждем
wait
```

Сделайте исполняемым:
```bash
chmod +x start-with-ngrok.sh
```

Запуск:
```bash
./start-with-ngrok.sh
```

## Проверка работы

1. Запустите сервер: `npm start`
2. Запустите ngrok: `ngrok http 3000`
3. Скопируйте HTTPS URL из вывода ngrok (например: `https://abc123.ngrok-free.app`)
4. Откройте в браузере: `https://abc123.ngrok-free.app/health`
5. Должен вернуться JSON: `{"status":"ok",...}`

## WebSocket URL

Используйте HTTPS URL от ngrok с протоколом `wss://`:
- ngrok URL: `https://abc123.ngrok-free.app`
- WebSocket URL: `wss://abc123.ngrok-free.app/ws`

## Важные замечания

⚠️ **Бесплатный ngrok:**
- Генерирует новый URL при каждом запуске (если не используете статический домен)
- Ограничение на количество подключений
- Может быть медленнее чем платные планы

✅ **Рекомендации:**
- Используйте статический домен для продакшена
- Для разработки можно использовать временный URL
- Рассмотрите платные планы для стабильности

## Альтернативы ngrok

- **Cloudflare Tunnel** (cloudflared) - полностью бесплатно
- **LocalTunnel** - бесплатный open-source вариант
- **Serveo** - простой SSH туннель

