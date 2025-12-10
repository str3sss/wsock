/**
 * Генерирует UUID v4
 * @returns {string}
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Получает значение куки по имени
 * @param {string} name - Имя куки
 * @returns {string|null}
 */
export function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

/**
 * Устанавливает куку
 * @param {string} name - Имя куки
 * @param {string} value - Значение куки
 * @param {number} days - Количество дней до истечения
 */
export function setCookie(name, value, days = 365) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

/**
 * Получает или создает userId из куки
 * Формат: timestamp_uuid
 * @returns {string}
 */
export function getOrCreateUserId() {
  let userId = getCookie('userId');

  if (!userId) {
    const timestamp = Date.now();
    const uuid = generateUUID();
    userId = `${timestamp}_${uuid}`;
    setCookie('userId', userId);
  }

  return userId;
}
