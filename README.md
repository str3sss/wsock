# Video Chat (Fastify + WebSocket + React)

Простой видеочат на базе Fastify и WebSocket для сервера, и React для клиента. Используется для сигналинга WebRTC между клиентами.

**Архитектура:**

- Сервер: Fastify + WebSocket (локальный, по IP)
- Клиент: React (деплой на GitHub Pages)

## Установка

```bash
npm install
```

## Запуск сервера

```bash
# Обычный запуск
npm start

# С автоперезагрузкой (Node.js 18+)
npm run dev
```

Сервер запустится на `http://0.0.0.0:3000` (или порт из переменной окружения `PORT`).

## API

### WebSocket Endpoint

`ws://YOUR_IP:3000/ws` (замените YOUR_IP на ваш локальный IP)

### REST Endpoints

- `GET /health` - Проверка статуса сервера
- `GET /rooms/:roomId` - Информация о комнате

## Протокол WebSocket

### Входящие сообщения (от клиента)

#### Присоединение к комнате

```json
{
  "type": "join-room",
  "roomId": "room-123"
}
```

#### Выход из комнаты

```json
{
  "type": "leave-room"
}
```

#### WebRTC Offer

```json
{
  "type": "offer",
  "targetConnectionId": "connection-id-123",
  "data": {
    /* SDP offer */
  }
}
```

#### WebRTC Answer

```json
{
  "type": "answer",
  "targetConnectionId": "connection-id-123",
  "data": {
    /* SDP answer */
  }
}
```

#### ICE Candidate

```json
{
  "type": "ice-candidate",
  "targetConnectionId": "connection-id-123",
  "data": {
    /* ICE candidate */
  }
}
```

#### Сообщение в чат

```json
{
  "type": "chat-message",
  "text": "Привет!"
}
```

### Исходящие сообщения (от сервера)

#### Подключение установлено

```json
{
  "type": "connected",
  "connectionId": "connection-id-123"
}
```

#### Комната присоединена

```json
{
  "type": "room-joined",
  "roomId": "room-123",
  "userId": "user_abc123"
}
```

#### Новый пользователь присоединился

```json
{
  "type": "user-joined",
  "userId": "user_xyz789",
  "connectionId": "connection-id-456"
}
```

#### Пользователь вышел

```json
{
  "type": "user-left",
  "userId": "user_xyz789"
}
```

#### Существующие пользователи в комнате

```json
{
  "type": "existing-users",
  "users": [
    {
      "userId": "user_xyz789",
      "connectionId": "connection-id-456"
    }
  ]
}
```

#### Сообщение в чат

```json
{
  "type": "chat-message",
  "userId": "user_abc123",
  "text": "Привет!",
  "timestamp": 1703123456789
}
```

#### Ошибка

```json
{
  "type": "error",
  "message": "Error description"
}
```

## Переменные окружения

- `PORT` - Порт сервера (по умолчанию: 3000)
- `HOST` - Хост сервера (по умолчанию: 0.0.0.0)

## Структура проекта

```
wsock/
├── server.js          # Основной файл сервера
├── package.json       # Зависимости и скрипты сервера
├── README.md          # Документация
├── DEPLOY.md          # Инструкции по деплою
├── .gitignore         # Игнорируемые файлы
├── .github/
│   └── workflows/
│       └── deploy.yml # GitHub Actions для деплоя клиента
└── client/            # React клиент
    ├── src/
    │   ├── App.jsx    # Основной компонент
    │   ├── App.css    # Стили
    │   ├── main.jsx   # Точка входа
    │   ├── index.css  # Глобальные стили
    │   └── utils/
    │       └── cookies.js # Утилиты для работы с куками
    ├── package.json   # Зависимости клиента
    └── vite.config.js # Конфигурация Vite
```

## Использование с клиентом

Сервер работает как сигнальный сервер для WebRTC. Клиенты должны:

1. Подключиться к WebSocket endpoint
2. Присоединиться к комнате
3. Обмениваться WebRTC сигналами (offer/answer/ice-candidate) через сервер
4. Установить прямые P2P соединения для передачи видео/аудио

### Запуск клиента локально

```bash
cd client
npm install
npm run dev
```

Клиент откроется на `http://localhost:5173`

### Быстрый старт (локальная разработка)

1. Запустите сервер: `npm start` (в корневой папке)
2. Запустите клиент: `cd client && npm run dev`
3. Откройте `http://localhost:5173` в браузере
4. Введите ID комнаты (например, "room-1") и нажмите "Присоединиться"
5. Откройте ту же комнату в другом окне/браузере для тестирования видеочата

### Деплой клиента

#### Вариант 1: Vercel (рекомендуется - бесплатный HTTPS)

Подробные инструкции см. в файле [VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md)

**Быстрый старт:**

```bash
npm i -g vercel
vercel login
vercel
# Добавьте переменные окружения через CLI или Dashboard
vercel env add VITE_WS_URL production
vercel --prod
```

#### Вариант 2: GitHub Pages

Подробные инструкции по деплою см. в файле [DEPLOY.md](./DEPLOY.md)

**Краткая инструкция:**

1. Залейте код на GitHub
2. Настройте GitHub Pages в Settings → Pages (выберите GitHub Actions)
3. Укажите ваш WebSocket URL в GitHub Secrets: `VITE_WS_URL=wss://YOUR_TUNNEL_URL/ws` (нужен SSL/туннель)
4. После push в main ветку клиент автоматически задеплоится

### Запуск сервера локально

Сервер предназначен для локального запуска:

```bash
npm install
npm start
```

Сервер будет доступен по IP адресу вашего компьютера в локальной сети.

**Определение IP адреса:**

- macOS/Linux: `ifconfig | grep "inet " | grep -v 127.0.0.1`
- Windows: `ipconfig`

Ищите IP адрес в локальной сети (обычно начинается с 192.168.x.x или 10.x.x.x)
