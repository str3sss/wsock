# Инструкция по деплою

## Деплой клиента на GitHub Pages

### 1. Подготовка репозитория

1. Создайте репозиторий на GitHub
2. Закоммитьте код:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Настройка GitHub Pages

1. Перейдите в Settings → Pages вашего репозитория
2. В разделе "Source" выберите "GitHub Actions"
3. После первого push workflow автоматически создастся и задеплоит приложение

### 3. Настройка WebSocket URL

#### Вариант 1: Через GitHub Secrets (рекомендуется)

1. Перейдите в Settings → Secrets and variables → Actions
2. Добавьте новый secret:
   - Name: `VITE_WS_URL`
   - Value: `ws://YOUR_IP:3000/ws` (замените YOUR_IP на ваш локальный IP)
   - Например: `ws://192.168.1.100:3000/ws`

#### Вариант 2: Через переменные окружения в workflow

Отредактируйте `.github/workflows/deploy.yml` и замените:
```yaml
VITE_WS_URL: ${{ secrets.VITE_WS_URL || 'ws://localhost:3000/ws' }}
```
на ваш IP адрес:
```yaml
VITE_WS_URL: 'ws://YOUR_IP:3000/ws'
```

### 4. Локальная сборка для тестирования

```bash
cd client
# Создайте .env файл с вашим IP
echo "VITE_WS_URL=ws://YOUR_IP:3000/ws" > .env
npm install
npm run build
npm run preview
```

## Запуск сервера локально

### 1. Установка зависимостей

```bash
npm install
```

### 2. Запуск сервера

```bash
npm start
# или с автоперезагрузкой
npm run dev
```

Сервер запустится на `http://0.0.0.0:3000` (или порт из переменной окружения `PORT`)

### 3. Определение вашего IP адреса

#### macOS/Linux:
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

#### Windows:
```bash
ipconfig
```

Ищите IP адрес в локальной сети (обычно начинается с 192.168.x.x или 10.x.x.x)

### 4. Настройка файрвола

Убедитесь, что порт 3000 открыт в файрволе:

#### macOS:
```bash
# Разрешить входящие подключения на порт 3000
sudo pfctl -f /etc/pf.conf
```

Или через System Preferences → Security & Privacy → Firewall → Firewall Options

#### Linux (ufw):
```bash
sudo ufw allow 3000/tcp
```

#### Windows:
Через Windows Defender Firewall → Advanced Settings → Inbound Rules → New Rule

## Использование

1. Откройте задеплоенное приложение на GitHub Pages
2. Убедитесь, что сервер запущен локально
3. Введите ID комнаты и присоединитесь
4. Откройте ту же комнату в другом браузере/устройстве для тестирования

## Важные замечания

- **HTTPS и WebSocket**: GitHub Pages работает по HTTPS, но WebSocket должен быть по `ws://` или `wss://`. Для локального сервера без SSL используйте `ws://`
- **CORS**: Сервер уже настроен с CORS для всех источников
- **Доступность**: Сервер должен быть доступен из сети, где находятся пользователи приложения
- **Безопасность**: Для продакшена рекомендуется использовать домен и SSL сертификат

