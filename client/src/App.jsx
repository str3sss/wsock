import { useState, useEffect, useRef } from 'react';
import './App.css';
import { getOrCreateUserId } from './utils/cookies';

/**
 * Получает WebSocket URL с учетом протокола страницы
 * Если страница загружена по HTTPS, использует wss://, иначе ws://
 */
function getWebSocketUrl() {
  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl) {
    // Если URL из env начинается с ws://, но страница HTTPS, заменяем на wss://
    if (window.location.protocol === 'https:' && envUrl.startsWith('ws://')) {
      return envUrl.replace('ws://', 'wss://');
    }
    return envUrl;
  }

  // По умолчанию используем протокол страницы
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname === 'localhost' ? 'localhost:3000' : '192.168.0.13:3000';
  return `${protocol}//${host}/ws`;
}

const WS_URL = getWebSocketUrl();

function App() {
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [currentRoom, setCurrentRoom] = useState(null);
  const [userId, setUserId] = useState(null);
  const [connectionId, setConnectionId] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  const wsRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef({});
  const peerConnectionsRef = useRef({});
  const localStreamRef = useRef(null);
  const messagesEndRef = useRef(null);

  /**
   * Инициализация userId из куки
   */
  useEffect(() => {
    const userId = getOrCreateUserId();
    setUserId(userId);
  }, []);

  /**
   * Прокрутка к последнему сообщению
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * Инициализация WebSocket подключения
   */
  useEffect(() => {
    if (!userId) {
      console.log('Waiting for userId...');
      return; // Ждем пока userId будет установлен
    }

    console.log('Connecting to WebSocket with userId:', userId);
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
      // Отправляем userId при подключении
      ws.send(
        JSON.stringify({
          type: 'set-user-id',
          userId: userId,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        setError('Ошибка обработки сообщения от сервера');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Ошибка подключения к серверу');
    };

    ws.onclose = (event) => {
      console.log('WebSocket disconnected', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      setConnected(false);

      // Переподключение только если это не было намеренное закрытие
      if (event.code !== 1000 && userId) {
        setTimeout(() => {
          if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
            console.log('Attempting to reconnect...');
            // Просто перезапускаем эффект - userId уже установлен
            setUserId(userId);
          }
        }, 3000);
      }
    };

    wsRef.current = ws;

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [userId]);

  /**
   * Обработка сообщений от WebSocket сервера
   * @param {object} message - Сообщение от сервера
   */
  const handleWebSocketMessage = async (message) => {
    console.log('Received message:', message);

    switch (message.type) {
      case 'connected':
        setConnectionId(message.connectionId);
        break;

      case 'user-id-set':
        // userId уже установлен из куки, просто подтверждаем
        console.log('User ID confirmed:', message.userId);
        break;

      case 'room-joined':
        setCurrentRoom(message.roomId);
        await startLocalStream();
        break;

      case 'user-joined':
        setUsers((prev) => {
          // Проверяем, не добавлен ли уже этот пользователь
          if (prev.find((u) => u.connectionId === message.connectionId)) {
            return prev;
          }
          return [...prev, { userId: message.userId, connectionId: message.connectionId }];
        });
        // Создаем offer для нового пользователя с небольшой задержкой
        setTimeout(() => {
          createOffer(message.connectionId);
        }, 300);
        break;

      case 'user-left':
        setUsers((prev) => prev.filter((u) => u.userId !== message.userId));
        closePeerConnection(message.userId);
        break;

      case 'existing-users':
        setUsers(message.users);
        // Создаем offer для каждого существующего пользователя
        // Используем небольшую задержку между созданиями offer для стабильности
        for (let i = 0; i < message.users.length; i++) {
          const user = message.users[i];
          setTimeout(() => {
            createOffer(user.connectionId);
          }, i * 200); // Задержка 200ms между каждым offer
        }
        break;

      case 'offer':
        await handleOffer(message);
        break;

      case 'answer':
        await handleAnswer(message);
        break;

      case 'ice-candidate':
        await handleIceCandidate(message);
        break;

      case 'chat-message':
        setMessages((prev) => [
          ...prev,
          {
            userId: message.userId,
            text: message.text,
            timestamp: message.timestamp || Date.now(),
          },
        ]);
        break;

      case 'error':
        setError(message.message);
        break;
    }
  };

  /**
   * Запуск локального видео потока
   */
  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Не удалось получить доступ к камере/микрофону');
    }
  };

  /**
   * Создание RTCPeerConnection
   * @param {string} targetConnectionId - ID целевого подключения
   * @returns {RTCPeerConnection}
   */
  const createPeerConnection = (targetConnectionId) => {
    // Если уже есть соединение, закрываем его
    if (peerConnectionsRef.current[targetConnectionId]) {
      console.log(`Closing existing peer connection for ${targetConnectionId}`);
      peerConnectionsRef.current[targetConnectionId].close();
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // Добавляем локальный поток
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStreamRef.current);
        console.log(`Added track to peer connection for ${targetConnectionId}`);
      });
    } else {
      console.warn(`Local stream not available when creating peer connection for ${targetConnectionId}`);
    }

    // Обработка входящего потока
    peerConnection.ontrack = (event) => {
      console.log(`Received track from ${targetConnectionId}`, event);
      const [remoteStream] = event.streams;
      if (remoteStream) {
        // Используем setTimeout чтобы убедиться, что элемент в DOM
        setTimeout(() => {
          const videoElement = remoteVideosRef.current[targetConnectionId];
          if (videoElement) {
            videoElement.srcObject = remoteStream;
            console.log(`Set remote stream for ${targetConnectionId}`);
          } else {
            console.warn(`Video element not found for ${targetConnectionId}`);
          }
        }, 100);
      }
    };

    // Обработка изменения состояния соединения
    peerConnection.onconnectionstatechange = () => {
      console.log(`Peer connection state for ${targetConnectionId}:`, peerConnection.connectionState);
    };

    // Обработка ICE кандидатов
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`Sending ICE candidate to ${targetConnectionId}`);
        sendWebSocketMessage({
          type: 'ice-candidate',
          targetConnectionId: targetConnectionId,
          data: event.candidate,
        });
      } else {
        console.log(`ICE gathering complete for ${targetConnectionId}`);
      }
    };

    peerConnectionsRef.current[targetConnectionId] = peerConnection;
    return peerConnection;
  };

  /**
   * Создание и отправка offer
   * @param {string} targetConnectionId - ID целевого подключения
   */
  const createOffer = async (targetConnectionId) => {
    try {
      // Убеждаемся, что локальный поток готов
      if (!localStreamRef.current) {
        console.log(`Waiting for local stream before creating offer for ${targetConnectionId}`);
        await startLocalStream();
      }

      // Проверяем, не существует ли уже соединение с remote description
      // Если да, значит мы уже получили offer от этого пользователя, не создаем новый
      const existingConnection = peerConnectionsRef.current[targetConnectionId];
      if (existingConnection && existingConnection.remoteDescription) {
        console.log(`Peer connection already exists with remote description for ${targetConnectionId}, skipping offer creation`);
        return;
      }

      console.log(`Creating offer for ${targetConnectionId}`);
      const peerConnection = createPeerConnection(targetConnectionId);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      console.log(`Set local description (offer) for ${targetConnectionId}`);

      console.log(`Sending offer to ${targetConnectionId}`);
      sendWebSocketMessage({
        type: 'offer',
        targetConnectionId: targetConnectionId,
        data: offer,
      });
    } catch (err) {
      console.error(`Error creating offer for ${targetConnectionId}:`, err);
    }
  };

  /**
   * Обработка входящего offer
   * @param {object} message - Сообщение с offer
   */
  const handleOffer = async (message) => {
    try {
      // Убеждаемся, что локальный поток готов
      if (!localStreamRef.current) {
        console.log(`Waiting for local stream before handling offer from ${message.fromConnectionId}`);
        await startLocalStream();
      }

      console.log(`Handling offer from ${message.fromConnectionId}`);

      // Проверяем, не существует ли уже соединение
      let peerConnection = peerConnectionsRef.current[message.fromConnectionId];

      // Если соединение существует и уже имеет local description (мы создали offer),
      // это означает, что оба пользователя создали offer одновременно (ICE restart)
      if (peerConnection && peerConnection.localDescription) {
        console.log(`Peer connection already exists with local description, closing and recreating`);
        peerConnection.close();
        peerConnection = null;
      }

      if (!peerConnection) {
        peerConnection = createPeerConnection(message.fromConnectionId);
      }

      // Устанавливаем remote description
      await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
      console.log(`Set remote description for ${message.fromConnectionId}`);

      // Создаем и отправляем answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      console.log(`Set local description (answer) for ${message.fromConnectionId}`);

      console.log(`Sending answer to ${message.fromConnectionId}`);
      sendWebSocketMessage({
        type: 'answer',
        targetConnectionId: message.fromConnectionId,
        data: answer,
      });
    } catch (err) {
      console.error(`Error handling offer from ${message.fromConnectionId}:`, err);
    }
  };

  /**
   * Обработка входящего answer
   * @param {object} message - Сообщение с answer
   */
  const handleAnswer = async (message) => {
    try {
      console.log(`Handling answer from ${message.fromConnectionId}`);
      const peerConnection = peerConnectionsRef.current[message.fromConnectionId];
      if (peerConnection) {
        // Проверяем текущее состояние
        if (peerConnection.signalingState === 'have-local-offer') {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(message.data));
          console.log(`Set remote description (answer) for ${message.fromConnectionId}`);
        } else {
          console.warn(`Unexpected signaling state: ${peerConnection.signalingState} for ${message.fromConnectionId}`);
        }
      } else {
        console.error(`No peer connection found for ${message.fromConnectionId} when handling answer`);
      }
    } catch (err) {
      console.error(`Error handling answer from ${message.fromConnectionId}:`, err);
    }
  };

  /**
   * Обработка ICE кандидата
   * @param {object} message - Сообщение с ICE кандидатом
   */
  const handleIceCandidate = async (message) => {
    try {
      const peerConnection = peerConnectionsRef.current[message.fromConnectionId];
      if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(message.data));
      }
    } catch (err) {
      console.error('Error handling ICE candidate:', err);
    }
  };

  /**
   * Закрытие peer connection
   * @param {string} userId - ID пользователя
   */
  const closePeerConnection = (userId) => {
    const user = users.find((u) => u.userId === userId);
    if (user) {
      const peerConnection = peerConnectionsRef.current[user.connectionId];
      if (peerConnection) {
        peerConnection.close();
        delete peerConnectionsRef.current[user.connectionId];
      }
      if (remoteVideosRef.current[user.connectionId]) {
        remoteVideosRef.current[user.connectionId].srcObject = null;
      }
    }
  };

  /**
   * Отправка сообщения через WebSocket
   * @param {object} message - Сообщение для отправки
   */
  const sendWebSocketMessage = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  /**
   * Присоединение к комнате
   */
  const handleJoinRoom = () => {
    if (!roomId.trim()) {
      setError('Введите ID комнаты');
      return;
    }

    setError(null);
    sendWebSocketMessage({
      type: 'join-room',
      roomId: roomId.trim(),
    });
  };

  /**
   * Выход из комнаты
   */
  const handleLeaveRoom = () => {
    // Закрываем все peer connections
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};

    // Останавливаем локальный поток
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    sendWebSocketMessage({
      type: 'leave-room',
    });

    setCurrentRoom(null);
    setUsers([]);
    setMessages([]);
  };

  /**
   * Отправка сообщения в чат
   */
  const handleSendMessage = () => {
    if (!messageText.trim() || !currentRoom) return;

    sendWebSocketMessage({
      type: 'chat-message',
      text: messageText.trim(),
    });

    setMessageText('');
  };

  /**
   * Переключение видео (камеры)
   */
  const toggleVideo = () => {
    if (!localStreamRef.current) return;

    const videoTracks = localStreamRef.current.getVideoTracks();
    videoTracks.forEach((track) => {
      track.enabled = !isVideoEnabled;
    });

    setIsVideoEnabled(!isVideoEnabled);

    // Обновляем треки во всех peer connections
    Object.values(peerConnectionsRef.current).forEach((peerConnection) => {
      const senders = peerConnection.getSenders();
      senders.forEach((sender) => {
        if (sender.track && sender.track.kind === 'video') {
          sender.track.enabled = !isVideoEnabled;
        }
      });
    });
  };

  /**
   * Переключение аудио (микрофона)
   */
  const toggleAudio = () => {
    if (!localStreamRef.current) return;

    const audioTracks = localStreamRef.current.getAudioTracks();
    audioTracks.forEach((track) => {
      track.enabled = !isAudioEnabled;
    });

    setIsAudioEnabled(!isAudioEnabled);

    // Обновляем треки во всех peer connections
    Object.values(peerConnectionsRef.current).forEach((peerConnection) => {
      const senders = peerConnection.getSenders();
      senders.forEach((sender) => {
        if (sender.track && sender.track.kind === 'audio') {
          sender.track.enabled = !isAudioEnabled;
        }
      });
    });
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Video Chat</h1>
        <div className="status">
          <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>{connected ? '●' : '○'}</span>
          <span>{connected ? 'Подключено' : 'Отключено'}</span>
          {userId && <span className="user-id">ID: {userId}</span>}
        </div>
      </header>

      <main className="main">
        {!currentRoom ? (
          <div className="join-room">
            <h2>Присоединиться к комнате</h2>
            <div className="input-group">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Введите ID комнаты"
                onKeyPress={(e) => e.key === 'Enter' && handleJoinRoom()}
                disabled={!connected}
              />
              <button onClick={handleJoinRoom} disabled={!connected}>
                Присоединиться
              </button>
            </div>
            {error && <div className="error">{error}</div>}
          </div>
        ) : (
          <div className="room">
            <div className="room-header">
              <h2>Комната: {currentRoom}</h2>
              <button onClick={handleLeaveRoom} className="leave-btn">
                Выйти
              </button>
            </div>

            {error && <div className="error">{error}</div>}

            <div className="room-content">
              <div className="videos">
                <div className="video-container local">
                  <video ref={localVideoRef} autoPlay muted playsInline className="video" />
                  <div className="video-label">Вы ({userId})</div>
                  <div className="video-controls">
                    <button
                      onClick={toggleVideo}
                      className={`control-btn ${isVideoEnabled ? 'active' : 'inactive'}`}
                      title={isVideoEnabled ? 'Выключить камеру' : 'Включить камеру'}
                    >
                      {isVideoEnabled ? '📹' : '📹🚫'}
                    </button>
                    <button
                      onClick={toggleAudio}
                      className={`control-btn ${isAudioEnabled ? 'active' : 'inactive'}`}
                      title={isAudioEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
                    >
                      {isAudioEnabled ? '🎤' : '🎤🚫'}
                    </button>
                  </div>
                </div>

                {users.map((user) => (
                  <div key={user.connectionId} className="video-container remote">
                    <video
                      ref={(el) => {
                        if (el) {
                          remoteVideosRef.current[user.connectionId] = el;
                          // Если уже есть поток для этого соединения, устанавливаем его
                          const peerConnection = peerConnectionsRef.current[user.connectionId];
                          if (peerConnection) {
                            peerConnection.getReceivers().forEach((receiver) => {
                              if (receiver.track && receiver.track.readyState === 'live') {
                                const stream = new MediaStream([receiver.track]);
                                el.srcObject = stream;
                              }
                            });
                          }
                        }
                      }}
                      autoPlay
                      playsInline
                      className="video"
                    />
                    <div className="video-label">{user.userId}</div>
                  </div>
                ))}

                {users.length === 0 && <div className="empty-state">Ожидание других участников...</div>}
              </div>

              <div className="chat">
                <div className="chat-header">Чат</div>
                <div className="chat-messages">
                  {messages.map((msg, index) => (
                    <div key={index} className={`chat-message ${msg.userId === userId ? 'own' : ''}`}>
                      <div className="chat-message-user">{msg.userId === userId ? 'Вы' : msg.userId}</div>
                      <div className="chat-message-text">{msg.text}</div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <div className="chat-input">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Введите сообщение..."
                  />
                  <button onClick={handleSendMessage} disabled={!messageText.trim()}>
                    Отправить
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
