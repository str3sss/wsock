import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';

const fastify = Fastify({
  logger: true,
});

// Регистрируем плагины
await fastify.register(cors, {
  origin: true,
});

await fastify.register(websocket);

// Хранилище комнат и подключений
const rooms = new Map(); // roomId -> Set of connection IDs
const connections = new Map(); // connectionId -> { socket, roomId, userId }

/**
 * Генерирует уникальный ID для подключения
 * @returns {string}
 */
function generateConnectionId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Генерирует уникальный ID пользователя
 * @returns {string}
 */
function generateUserId() {
  return 'user_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Отправляет сообщение всем участникам комнаты кроме отправителя
 * @param {string} roomId - ID комнаты
 * @param {string} excludeConnectionId - ID подключения для исключения
 * @param {object} message - Сообщение для отправки
 */
function broadcastToRoom(roomId, excludeConnectionId, message) {
  const roomConnections = rooms.get(roomId);
  if (!roomConnections) return;

  roomConnections.forEach((connectionId) => {
    if (connectionId !== excludeConnectionId) {
      const connection = connections.get(connectionId);
      if (connection && connection.socket.readyState === 1) {
        // WebSocket.OPEN
        connection.socket.send(JSON.stringify(message));
      }
    }
  });
}

/**
 * Добавляет подключение в комнату
 * @param {string} connectionId - ID подключения
 * @param {string} roomId - ID комнаты
 */
function joinRoom(connectionId, roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId).add(connectionId);

  const connection = connections.get(connectionId);
  if (connection) {
    connection.roomId = roomId;
  }
}

/**
 * Удаляет подключение из комнаты
 * @param {string} connectionId - ID подключения
 */
function leaveRoom(connectionId) {
  const connection = connections.get(connectionId);
  if (!connection || !connection.roomId) return;

  const roomId = connection.roomId;
  const roomConnections = rooms.get(roomId);

  if (roomConnections) {
    roomConnections.delete(connectionId);

    // Уведомляем остальных участников о выходе
    broadcastToRoom(roomId, connectionId, {
      type: 'user-left',
      userId: connection.userId,
    });

    // Удаляем комнату если она пустая
    if (roomConnections.size === 0) {
      rooms.delete(roomId);
    }
  }

  connection.roomId = null;
}

// WebSocket endpoint
fastify.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    const connectionId = generateConnectionId();
    let userId = null; // Будет установлен клиентом

    // Сохраняем подключение
    connections.set(connectionId, {
      socket: connection.socket,
      roomId: null,
      userId: null,
    });

    fastify.log.info(`New connection: ${connectionId}`);

    // Отправляем приветственное сообщение
    connection.socket.send(
      JSON.stringify({
        type: 'connected',
        connectionId: connectionId,
      })
    );

    // Обработка входящих сообщений
    connection.socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        fastify.log.debug(`Received message from ${connectionId}:`, data.type);

        switch (data.type) {
          case 'set-user-id':
            {
              userId = data.userId;
              const conn = connections.get(connectionId);
              if (conn) {
                conn.userId = userId;
              }
              fastify.log.info(`User ID set: ${connectionId} -> ${userId}`);
              connection.socket.send(
                JSON.stringify({
                  type: 'user-id-set',
                  userId: userId,
                })
              );
            }
            break;

          case 'join-room':
            {
              const { roomId } = data;
              if (!roomId) {
                connection.socket.send(
                  JSON.stringify({
                    type: 'error',
                    message: 'Room ID is required',
                  })
                );
                return;
              }

              const connection = connections.get(connectionId);
              if (!connection.userId) {
                connection.socket.send(
                  JSON.stringify({
                    type: 'error',
                    message: 'User ID not set. Please set user ID first.',
                  })
                );
                return;
              }

              joinRoom(connectionId, roomId);

              // Уведомляем текущего пользователя об успешном присоединении
              connection.socket.send(
                JSON.stringify({
                  type: 'room-joined',
                  roomId: roomId,
                  userId: connection.userId,
                })
              );

              // Уведомляем остальных участников комнаты о новом пользователе
              broadcastToRoom(roomId, connectionId, {
                type: 'user-joined',
                userId: connection.userId,
                connectionId: connectionId,
              });

              // Отправляем список текущих участников новому пользователю
              const roomConnections = rooms.get(roomId);
              const otherUsers = Array.from(roomConnections)
                .filter((id) => id !== connectionId)
                .map((id) => ({
                  userId: connections.get(id)?.userId,
                  connectionId: id,
                }));

              if (otherUsers.length > 0) {
                connection.socket.send(
                  JSON.stringify({
                    type: 'existing-users',
                    users: otherUsers,
                  })
                );
              }

              fastify.log.info(`User ${connection.userId} joined room ${roomId}`);
            }
            break;

          case 'leave-room':
            {
              leaveRoom(connectionId);
              const connection = connections.get(connectionId);
              connection.socket.send(
                JSON.stringify({
                  type: 'room-left',
                  roomId: connection.roomId,
                })
              );
              fastify.log.info(`User ${connection.userId} left room`);
            }
            break;

          case 'offer':
          case 'answer':
          case 'ice-candidate':
            {
              // Пересылаем WebRTC сигналы между клиентами
              const connection = connections.get(connectionId);
              if (!connection || !connection.roomId) {
                connection.socket.send(
                  JSON.stringify({
                    type: 'error',
                    message: 'Not in a room',
                  })
                );
                return;
              }

              // Пересылаем сигнал целевому пользователю
              const targetConnectionId = data.targetConnectionId;
              const targetConnection = connections.get(targetConnectionId);

              if (targetConnection && targetConnection.socket.readyState === 1) {
                targetConnection.socket.send(
                  JSON.stringify({
                    type: data.type,
                    fromConnectionId: connectionId,
                    fromUserId: connection.userId,
                    data: data.data,
                  })
                );
              } else {
                connection.socket.send(
                  JSON.stringify({
                    type: 'error',
                    message: 'Target user not found or disconnected',
                  })
                );
              }
            }
            break;

          case 'chat-message':
            {
              // Отправляем сообщение всем участникам комнаты
              const connection = connections.get(connectionId);
              if (!connection || !connection.roomId || !connection.userId) {
                connection.socket.send(
                  JSON.stringify({
                    type: 'error',
                    message: 'Not in a room',
                  })
                );
                return;
              }

              const { text } = data;
              if (!text || !text.trim()) {
                return;
              }

              const chatMessage = {
                type: 'chat-message',
                userId: connection.userId,
                text: text.trim(),
                timestamp: Date.now(),
              };

              // Отправляем сообщение всем участникам комнаты, включая отправителя
              const roomConnections = rooms.get(connection.roomId);
              if (roomConnections) {
                roomConnections.forEach((connId) => {
                  const conn = connections.get(connId);
                  if (conn && conn.socket.readyState === 1) {
                    // WebSocket.OPEN
                    conn.socket.send(JSON.stringify(chatMessage));
                  }
                });
              }
            }
            break;

          default:
            fastify.log.warn(`Unknown message type: ${data.type}`);
        }
      } catch (error) {
        fastify.log.error(`Error processing message from ${connectionId}:`, error);
        try {
          connection.socket.send(
            JSON.stringify({
              type: 'error',
              message: 'Invalid message format: ' + error.message,
            })
          );
        } catch (sendError) {
          fastify.log.error('Error sending error message:', sendError);
        }
      }
    });

    // Обработка закрытия подключения
    connection.socket.on('close', (code, reason) => {
      fastify.log.info(`Connection closed: ${connectionId}`, { code, reason: reason?.toString() });
      leaveRoom(connectionId);
      connections.delete(connectionId);
    });

    connection.socket.on('error', (error) => {
      fastify.log.error(`WebSocket error for ${connectionId}:`, error);
      try {
        leaveRoom(connectionId);
        connections.delete(connectionId);
      } catch (err) {
        fastify.log.error('Error during cleanup:', err);
      }
    });
  });
});

// REST API endpoints
fastify.get('/health', async (request, reply) => {
  return {
    status: 'ok',
    rooms: rooms.size,
    connections: connections.size,
  };
});

fastify.get('/rooms/:roomId', async (request, reply) => {
  const { roomId } = request.params;
  const roomConnections = rooms.get(roomId);

  if (!roomConnections) {
    return reply.code(404).send({ error: 'Room not found' });
  }

  const users = Array.from(roomConnections).map((id) => ({
    userId: connections.get(id)?.userId,
    connectionId: id,
  }));

  return {
    roomId: roomId,
    users: users,
    userCount: users.length,
  };
});

// Запуск сервера
const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    fastify.log.info(`Server listening on http://${host}:${port}`);
    fastify.log.info(`WebSocket endpoint: ws://${host}:${port}/ws`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
