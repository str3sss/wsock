# Деплой на Vercel

Vercel предоставляет бесплатный хостинг с HTTPS, что решает проблему смешанного контента.

## Вариант 1: Только клиент на Vercel (сервер локальный)

### Шаги:

1. **Установите Vercel CLI:**
```bash
npm i -g vercel
```

2. **Войдите в Vercel:**
```bash
vercel login
```

3. **Деплой клиента:**
```bash
# Из корневой папки проекта
vercel

# Следуйте инструкциям:
# - Set up and deploy? Y
# - Which scope? (выберите ваш аккаунт)
# - Link to existing project? N
# - Project name? (название проекта)
# - Directory? client
# - Override settings? N
```

4. **Настройте ngrok туннель:**
```bash
# Установите ngrok: https://ngrok.com/download
# Настройте authtoken: ngrok config add-authtoken YOUR_TOKEN
# Запустите туннель:
ngrok http 3000
# Скопируйте HTTPS URL (например: https://abc123.ngrok-free.app)
```

5. **Настройте переменные окружения:**
```bash
# Через CLI
vercel env add VITE_WS_URL production
# Введите: wss://your-ngrok-url.ngrok-free.app/ws
# Например: wss://abc123.ngrok-free.app/ws

# Или через веб-интерфейс:
# https://vercel.com/dashboard → ваш проект → Settings → Environment Variables
# Добавьте: VITE_WS_URL = wss://your-ngrok-url.ngrok-free.app/ws
```

**Подробные инструкции по ngrok:** см. [ngrok-setup.md](./ngrok-setup.md)

5. **Редиплой после добавления переменных:**
```bash
vercel --prod
```

### Важно:
- Для локального сервера все равно нужен SSL/туннель (ngrok, cloudflared)
- Или используйте домен с SSL сертификатом

## Вариант 2: Клиент и сервер на Vercel (рекомендуется)

### Подготовка сервера для Vercel:

Vercel поддерживает serverless functions, но WebSocket требует специальной настройки. Можно использовать:

1. **Vercel Edge Functions** (ограниченная поддержка WebSocket)
2. **Или отдельный сервис для WebSocket** (например, Railway, Render, или отдельный VPS)

### Альтернатива: Использовать Vercel для клиента + отдельный сервис для WebSocket

**Бесплатные варианты для WebSocket сервера:**
- **Railway** (бесплатный tier)
- **Render** (бесплатный tier)
- **Fly.io** (бесплатный tier)
- **Cloudflare Workers** (с Durable Objects для WebSocket)

## Быстрый старт (только клиент):

```bash
# 1. Установите Vercel CLI
npm i -g vercel

# 2. Войдите
vercel login

# 3. Деплой
vercel

# 4. Добавьте переменные окружения
vercel env add VITE_WS_URL production
# Введите ваш WebSocket URL (wss://...)

# 5. Продакшн деплой
vercel --prod
```

После деплоя вы получите URL вида: `https://your-project.vercel.app`

## Преимущества Vercel:

✅ Бесплатный HTTPS  
✅ Автоматический деплой при push в GitHub  
✅ Быстрый CDN  
✅ Простая настройка  
✅ Поддержка переменных окружения  

## Настройка автоматического деплоя:

1. Подключите репозиторий GitHub в Vercel Dashboard
2. Vercel автоматически будет деплоить при каждом push
3. Настройте переменные окружения в Dashboard

## Переменные окружения:

В Vercel Dashboard → Settings → Environment Variables добавьте:
- `VITE_WS_URL` = `wss://your-server-url/ws`
- `VITE_BASE_PATH` = `/` (или путь к вашему репозиторию)

