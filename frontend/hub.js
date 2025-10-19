// Игровой хаб - главное меню и управление играми

(function initHub() {
  const hubMenu = document.getElementById('hubMenu');
  const gameContainer = document.getElementById('gameContainer');
  const accountBtn = document.getElementById('accountBtn');
  // Auth modal elems
  const authModal = document.getElementById('authModal');
  const authTitle = document.getElementById('authTitle');
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const authUsername = document.getElementById('authUsername');
  const authPassword = document.getElementById('authPassword');
  const authSubmit = document.getElementById('authSubmit');
  const authCancel = document.getElementById('authCancel');
  const authError = document.getElementById('authError');
  
  let currentGame = null;
  let gameScript = null;
  let isGameActive = false;
  let waitingPrevNames = new Set();

  function showToast(text) {
    try {
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = 'position:fixed;right:16px;top:16px;background:rgba(0,0,0,.78);color:#fff;padding:10px 14px;border-radius:10px;z-index:99999;box-shadow:0 6px 20px rgba(0,0,0,.35);pointer-events:none;font-weight:600';
      document.body.appendChild(el);
      setTimeout(()=>{ try{ document.body.removeChild(el); } catch{} }, 2200);
    } catch {}
  }

  // Инициализация хаба
  function initHub() {
    console.log('Инициализация игрового хаба...');
    
    // Включаем анимации появления
    try {
      const hubContent = document.querySelector('#hubMenu .hub-content');
      if (hubContent) {
        hubContent.classList.remove('animate');
        // force reflow to restart animation
        // eslint-disable-next-line no-unused-expressions
        hubContent.offsetHeight;
        hubContent.classList.add('animate');
      }
    } catch {}

    // Обработчики для навигации в сайдбаре
    const navItems = document.querySelectorAll('.nav-item');
    console.log('Найдено элементов навигации:', navItems.length);
    navItems.forEach((item, index) => {
      console.log(`Элемент ${index}:`, item.dataset.game);
      item.addEventListener('click', () => {
        const gameId = item.dataset.game;
        console.log('Клик по элементу навигации:', gameId);
        if (gameId && gameId !== 'coming-soon') {
          loadGame(gameId);
        }
      });
    });
    
    // Обработчик для большой кнопки "Играть"
    const playButtonLarge = document.querySelector('.play-button-large');
    if (playButtonLarge) {
      playButtonLarge.addEventListener('click', () => {
        loadGame('hues-and-cues');
      });
    }
    
    // Обработчик кнопки "Назад в хаб" в боковой панели
    // Убрано - теперь доступно через dropdown профиля

    // Аккаунт
    if (accountBtn) {
      accountBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = document.getElementById('profileDropdown');
        const user = getCurrentUser();
        
        if (user && user.username) {
          // Если пользователь залогинен, показываем/скрываем dropdown
          toggleDropdown();
        } else {
          // Если не залогинен, открываем модальное окно
          openAuthModal();
        }
      });
    }
    
    // Обработчики для dropdown
    const dropdownItems = document.querySelectorAll('.dropdown-item');
    dropdownItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = item.dataset.action;
        handleDropdownAction(action);
      });
    });
    
    // Закрытие dropdown при клике вне его
    document.addEventListener('click', (e) => {
      const profileContainer = document.querySelector('.profile-container');
      if (!profileContainer) return;
      
      if (!profileContainer.contains(e.target)) {
        closeDropdown();
      }
    });
    if (authCancel) authCancel.addEventListener('click', closeAuthModal);
    if (tabLogin) tabLogin.addEventListener('click', () => setAuthMode('login'));
    if (tabRegister) tabRegister.addEventListener('click', () => setAuthMode('register'));
    if (authSubmit) authSubmit.addEventListener('click', submitAuth);
    updateAccountUI();
    
    // Скрываем кнопку "Назад в хаб" при инициализации хаба
    hideBackToHubButton();
    
    console.log('Хаб инициализирован успешно');
  }

  // Загрузка игры
  function loadGame(gameId) {
    console.log('Загрузка игры:', gameId);
    console.log('Текущая игра:', currentGame);
    
    if (currentGame === gameId) {
      console.log('Игра уже загружена');
      return;
    }
    
    // Устанавливаем флаг активности игры
    isGameActive = true;
    
    // Плавно скрываем хаб
    try {
      hubMenu.classList.add('fade-out');
      setTimeout(() => {
        hubMenu.classList.add('hidden');
        hubMenu.classList.remove('fade-out');
      }, 360);
    } catch {}

    // Плавно показываем контейнер игры
    gameContainer.classList.remove('hidden');
    // force reflow
    gameContainer.offsetHeight;
    gameContainer.classList.add('active');
    
    // Показываем кнопку "Назад в хаб" в dropdown
    showBackToHubButton();
    
    // Очищаем предыдущую игру
    if (gameScript) {
      gameScript.remove();
      gameScript = null;
    }
    
    gameContainer.innerHTML = '';
    
    // Загружаем соответствующую игру
    console.log('Выбираем игру для загрузки:', gameId);
    switch (gameId) {
      case 'hues-and-cues':
        console.log('Загружаем KELDURBENCOLORS');
        loadHuesAndCues();
        break;
      case 'keldurbenstickers':
        console.log('Загружаем KELDURBENSTICKERS');
        loadKeldurbenStickers();
        break;
      default:
        console.error('Неизвестная игра:', gameId);
        returnToHub();
        return;
    }
    
    currentGame = gameId;
  }

  // Загрузка игры "KELDURBENCOLORS"
  function loadHuesAndCues() {
    console.log('Загрузка игры "KELDURBENCOLORS"...');
    
    // Дадим хабу плавно скрыться и игровому контейнеру плавно появиться,
    // затем подгрузим тяжёлый скрипт игры с небольшой задержкой
    setTimeout(() => {
      // Плавный старт загрузки DOM игры
      loadHuesAndCuesDirect({ deferScriptMs: 120 });
    }, 420);
  }

  // Прямая загрузка игры "KELDURBENCOLORS"
  function loadHuesAndCuesDirect(opts = {}) {
    console.log('Прямая загрузка игры "KELDURBENCOLORS"...');
    
    // Создаем HTML игры напрямую
    gameContainer.innerHTML = `
      <div class="game-brand">
        <picture>
          <source srcset="icon.png" type="image/png" />
          <img src="icon.ico" alt="Логотип" class="game-logo" />
        </picture>
        <span class="game-title">KELDURBENCOLORS</span>
      </div>
      <div class="game-topbar">
        <button id="startGameBtn" class="primary">Старт</button>
        <button id="backToHubBtn" class="secondary">Назад в хаб</button>
      </div>
      
      <!-- Комната ожидания -->
      <div id="waiting-room" class="waiting-room active">
        <div class="waiting-content">
          <h2>Комната ожидания</h2>
          <div class="players-section">
            <h3>Участники</h3>
            <div id="waiting-players-list" class="waiting-players-list">
              <!-- Игроки будут добавлены динамически -->
            </div>
            <p class="waiting-info">Игра для одного игрока. Вы автоматически добавлены в игру как текущий пользователь</p>
          </div>
          <div class="waiting-controls">
            <button id="waiting-start-btn" class="primary-btn" disabled>Начать игру</button>
          </div>
        </div>
      </div>
      
      <main class="layout hidden">
        <section class="sidebar">
          
          <div class="panel">
            <h2>Текущий раунд</h2>
            <div id="roundInfo" class="round-info"></div>
            <button id="nextRoundBtn" class="primary" disabled>Следующий раунд</button>
          </div>
          <div class="panel">
            <h2>Подсказки</h2>
            <div id="cueArea1" class="cue-area hidden">
              <input id="cueInput1" type="text" maxlength="20" placeholder="Подсказка 1 (1 слово)" />
              <button id="lockCueBtn1" class="primary">Дать подсказку</button>
            </div>
            <div id="cueArea2" class="cue-area hidden">
              <input id="cueInput2" type="text" maxlength="40" placeholder="Подсказка 2 (до 2 слов)" />
              <button id="lockCueBtn2" class="primary">Дать подсказку</button>
            </div>
            <div id="currentCue" class="current-cue hidden"></div>
          </div>
          <div class="panel">
            <h2>Игроки</h2>
            <div id="playersList" class="players-list"></div>
            <div id="addPlayerSection" class="add-player">
              <input id="playerNameInput" type="text" placeholder="Имя игрока" />
              <button id="addPlayerBtn">Добавить</button>
            </div>
          </div>
        </section>
        <section class="board-wrap">
          <div class="board-container">
            <div class="coordinates-top">
              <div class="coord-spacer"></div>
              <div class="coord-numbers"></div>
              <div class="coord-spacer"></div>
            </div>
            <div class="board-row">
              <div class="coordinates-left">
                <div class="coord-letters"></div>
              </div>
              <div id="board" class="board" aria-label="Палитра цветов" role="grid"></div>
              <div class="coordinates-right">
                <div class="coord-letters"></div>
              </div>
            </div>
            <div class="coordinates-bottom">
              <div class="coord-spacer"></div>
              <div class="coord-numbers"></div>
              <div class="coord-spacer"></div>
            </div>
          </div>
        </section>
      </main>
      <div id="colorSelectionModal" class="modal hidden">
        <div class="modal-content">
          <h3>Выберите цвет для подсказки</h3>
          <p>Выберите один из четырех случайных цветов. По этому цвету вы будете давать подсказки в этом раунде.</p>
          <div class="color-options">
            <div class="color-option" data-color-index="0">
              <div class="color-preview"></div>
              <span class="color-name"></span>
            </div>
            <div class="color-option" data-color-index="1">
              <div class="color-preview"></div>
              <span class="color-name"></span>
            </div>
            <div class="color-option" data-color-index="2">
              <div class="color-preview"></div>
              <span class="color-name"></span>
            </div>
            <div class="color-option" data-color-index="3">
              <div class="color-preview"></div>
              <span class="color-name"></span>
            </div>
          </div>
        </div>
      </div>
      <div id="winnerModal" class="modal hidden">
        <div class="modal-content">
          <h3 id="winnerTitle">Победитель</h3>
          <p id="winnerText">Игрок набрал 15 очков и победил!</p>
          <button id="newGameBtn" class="primary" style="margin-top:12px">Начать новую игру</button>
          <button id="backToHubFromWinnerBtn" class="secondary" style="margin-top:8px">Вернуться в хаб</button>
        </div>
      </div>
    `;
    
    // Загружаем CSS игры
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'games/hues-and-cues/styles.css';
    link.id = 'game-styles';
    document.head.appendChild(link);
    
    const deferMs = typeof opts.deferScriptMs === 'number' ? opts.deferScriptMs : 0;
    setTimeout(() => {
      // Загружаем JS игры (после небольшого тайм-аута для плавности анимации)
      gameScript = document.createElement('script');
      gameScript.src = 'games/hues-and-cues/script.js';
      gameScript.onload = () => {
        console.log('Игра "KELDURBENCOLORS" загружена напрямую');
        
        // Инициализируем комнату ожидания
        initializeWaitingRoomForColors();
      };
      gameScript.onerror = () => {
        console.error('Ошибка загрузки JS игры');
      };
      document.head.appendChild(gameScript);
    }, deferMs);
  }

  // Функции для комнаты ожидания KELDURBENCOLORS
  function initializeWaitingRoomForColors() {
    const waitingRoom = document.getElementById('waiting-room');
    const waitingPlayersList = document.getElementById('waiting-players-list');
    const waitingStartBtn = document.getElementById('waiting-start-btn');
    const waitingInfo = document.querySelector('.waiting-info');
    
    if (!waitingRoom || !waitingPlayersList || !waitingStartBtn) {
      console.error('Элементы комнаты ожидания не найдены');
      return;
    }
    
    // Получаем текущего пользователя
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.username) {
      console.log('Adding user to game:', currentUser.username);
      
      // Используем глобальную функцию игры для добавления игрока
      if (typeof window.addPlayerToGame === 'function') {
        const playerObj = window.addPlayerToGame(currentUser.username);
        console.log('Player added to game:', playerObj);
        
        // Обновляем список в комнате ожидания
        if (typeof window.updateWaitingRoomPlayers === 'function') {
          window.updateWaitingRoomPlayers([playerObj]);
        }
      } else {
        console.error('addPlayerToGame function not found');
      }
      
      updateWaitingStartButtonForColors(true);
      
      // Скрываем информационное сообщение
      if (waitingInfo) {
        waitingInfo.style.display = 'none';
      }
    } else {
      console.log('No user found or no username');
      // Показываем информационное сообщение
      if (waitingInfo) {
        waitingInfo.textContent = 'Войдите в аккаунт, чтобы автоматически добавиться в игру';
        waitingInfo.style.display = 'block';
      }
    }
    
    // Добавляем обработчик для кнопки "Начать игру"
    waitingStartBtn.addEventListener('click', () => {
      console.log('Waiting room start button clicked');
      
      // Устанавливаем флаг в игре, что пользователь прошел через комнату ожидания
      if (typeof window.setHasPassedWaitingRoom === 'function') {
        window.setHasPassedWaitingRoom(true);
      }
      
      // Скрываем комнату ожидания
      waitingRoom.classList.remove('active');
      
      // Показываем основную игру
      const mainLayout = document.querySelector('.layout');
      if (mainLayout) {
        mainLayout.classList.remove('hidden');
      }
      // Форс-рендер списка игроков после переключения экранов
      try { if (typeof window.forcePlayersRerender === 'function') window.forcePlayersRerender(); } catch {}
      
      // НЕ запускаем игру автоматически - только переключаем экраны
      // Игра должна начаться только после нажатия кнопки "Старт"
      console.log('Switched to main game screen, waiting for Start button');
    });
  }
  
  function updateWaitingPlayersListForColors(players) {
    const waitingPlayersList = document.getElementById('waiting-players-list');
    if (!waitingPlayersList) return;
    
    // diff for toast
    try {
      const cur = new Set((players || []).map(p => p && p.name ? p.name : 'Игрок'));
      for (const name of waitingPrevNames) if (!cur.has(name)) showToast(`${name} покинул игру`);
      for (const name of cur) if (!waitingPrevNames.has(name)) showToast(`${name} присоединился`);
      waitingPrevNames = cur;
    } catch {}

    waitingPlayersList.innerHTML = '';
    const currentUser = getCurrentUser();
    
    players.forEach((player, index) => {
      const playerItem = document.createElement('div');
      playerItem.className = 'waiting-player-item';
      
      // player теперь объект с полями id, name, score
      const playerName = currentUser && currentUser.username === player.name ? `${player.name} (Вы)` : player.name;
      playerItem.textContent = playerName;
      
      waitingPlayersList.appendChild(playerItem);
    });
  }
  
  function updateWaitingStartButtonForColors(enabled) {
    const waitingStartBtn = document.getElementById('waiting-start-btn');
    if (!waitingStartBtn) return;
    
    waitingStartBtn.disabled = !enabled;
  }

  // Загрузка игры "KELDURBENSTICKERS"
  function loadKeldurbenStickers() {
    console.log('Загрузка игры "KELDURBENSTICKERS"...');
    
    // Дадим хабу плавно скрыться и игровому контейнеру плавно появиться,
    // затем подгрузим тяжёлый скрипт игры с небольшой задержкой
    setTimeout(() => {
      // Плавный старт загрузки DOM игры
      loadKeldurbenStickersDirect({ deferScriptMs: 120 });
    }, 420);
  }

  // Прямая загрузка игры "KELDURBENSTICKERS"
  function loadKeldurbenStickersDirect(opts = {}) {
    console.log('Прямая загрузка игры "KELDURBENSTICKERS"...');
    
    // Создаем iframe для игры
    const iframe = document.createElement('iframe');
    iframe.src = 'games/keldurbenstickers/index.html';
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: white;
    `;
    
    gameContainer.appendChild(iframe);
    
    const deferMs = typeof opts.deferScriptMs === 'number' ? opts.deferScriptMs : 0;
    setTimeout(() => {
      console.log('Игра "KELDURBENSTICKERS" загружена через iframe');
    }, deferMs);
  }

  // Возврат в хаб
  function returnToHub() {
    console.log('Возврат в хаб...');
    
    // Сбрасываем флаг активности игры
    isGameActive = false;

    // Корректно отключаемся от активной игры (WS закрыть и т.п.)
    try { if (typeof window.disconnectActiveGame === 'function') window.disconnectActiveGame(); } catch {}
    
    // Очищаем текущую игру
    if (gameScript) {
      gameScript.remove();
      gameScript = null;
    }
    
    // Удаляем CSS стили игры
    const gameStyles = document.getElementById('game-styles');
    if (gameStyles) {
      gameStyles.remove();
    }
    
    // Плавно скрываем игру и очищаем контейнер после анимации
    gameContainer.classList.remove('active');
    setTimeout(() => {
      gameContainer.innerHTML = '';
      gameContainer.classList.add('hidden');
    }, 360);
    
    // Плавно показываем хаб
    hubMenu.classList.add('fade-out');
    hubMenu.classList.remove('hidden');
    // force reflow
    hubMenu.offsetHeight;
    hubMenu.classList.remove('fade-out');
    
    // Скрываем кнопку "Назад в хаб" в dropdown
    hideBackToHubButton();
    
    // Перезапуск анимации появления элементов хаба
    try {
      const hubContent = document.querySelector('#hubMenu .hub-content');
      if (hubContent) {
        hubContent.classList.remove('animate');
        hubContent.offsetHeight;
        hubContent.classList.add('animate');
      }
    } catch {}

    currentGame = null;
    
    console.log('Возврат в хаб завершен');
  }

  // Функции для управления видимостью кнопки "Назад в хаб"
  function showBackToHubButton() {
    const backToHubBtn = document.getElementById('back-to-hub-dropdown');
    if (backToHubBtn) {
      backToHubBtn.classList.add('show');
    }
  }

  function hideBackToHubButton() {
    const backToHubBtn = document.getElementById('back-to-hub-dropdown');
    if (backToHubBtn) {
      backToHubBtn.classList.remove('show');
    }
  }

  // Глобальные функции для доступа из iframe
  window.returnToHub = returnToHub;
  window.loadGame = loadGame;

  // ====== Accounts (localStorage based) ======
  function getAccounts() {
    try { return JSON.parse(localStorage.getItem('accounts') || '[]'); } catch { return []; }
  }
  function setAccounts(list) {
    localStorage.setItem('accounts', JSON.stringify(list));
  }
  // API base URL — fixed for desktop client
  const API_BASE_URL = 'http://185.177.219.234:8765/api';
  
  function getCurrentUser() {
    const token = localStorage.getItem('authToken');
    if (!token) return null;
    
    const userData = localStorage.getItem('currentUser');
    if (!userData) return null;
    
    try {
      return JSON.parse(userData);
    } catch (e) {
      console.error('Error parsing user data:', e);
      return null;
    }
  }
  
  function setCurrentUser(user) {
    if (user) {
      localStorage.setItem('currentUser', JSON.stringify({ 
        id: user.id,
        username: user.username, 
        avatar: user.avatar 
      }));
    } else {
      localStorage.removeItem('currentUser');
      localStorage.removeItem('authToken');
    }
    updateAccountUI();
  }
  async function sha256(text) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // Avatar system
  const avatarOptions = [
    { id: 'default', name: 'По умолчанию', emoji: '👤' },
    { id: 'gamer', name: 'Геймер', emoji: '🎮' },
    { id: 'wizard', name: 'Маг', emoji: '🧙' },
    { id: 'robot', name: 'Робот', emoji: '🤖' },
    { id: 'ninja', name: 'Ниндзя', emoji: '🥷' },
    { id: 'pirate', name: 'Пират', emoji: '🏴‍☠️' },
    { id: 'alien', name: 'Пришелец', emoji: '👽' },
    { id: 'ghost', name: 'Призрак', emoji: '👻' },
    { id: 'cat', name: 'Кот', emoji: '🐱' },
    { id: 'dog', name: 'Собака', emoji: '🐶' },
    { id: 'dragon', name: 'Дракон', emoji: '🐉' },
    { id: 'unicorn', name: 'Единорог', emoji: '🦄' }
  ];
  
  function generateAvatarFromUsername(username) {
    if (!username) return avatarOptions[0];
    const hash = username.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    const index = Math.abs(hash) % avatarOptions.length;
    return avatarOptions[index];
  }
  
  function updateProfileAvatar(user) {
    const profileBtn = document.getElementById('accountBtn');
    const dropdown = document.getElementById('profileDropdown');
    if (!profileBtn || !dropdown) return;
    
    const avatarElement = profileBtn.querySelector('.profile-avatar');
    const textElement = profileBtn.querySelector('.profile-text');
    const dropdownAvatar = dropdown.querySelector('.dropdown-avatar');
    const dropdownUsername = dropdown.querySelector('.dropdown-username');
    const dropdownStatus = dropdown.querySelector('.dropdown-status');
    
    if (user && user.username) {
      const avatar = user.avatar ? avatarOptions.find(a => a.id === user.avatar) : generateAvatarFromUsername(user.username);
      avatarElement.innerHTML = `<div class="avatar-emoji">${avatar.emoji}</div>`;
      textElement.textContent = user.username;
      profileBtn.classList.add('logged-in');
      
      // Обновляем dropdown
      dropdownAvatar.innerHTML = `<div class="avatar-emoji">${avatar.emoji}</div>`;
      dropdownUsername.textContent = user.username;
      dropdownStatus.textContent = 'Онлайн';
      dropdownStatus.classList.remove('offline');
    } else {
      avatarElement.innerHTML = '<div class="avatar-placeholder">?</div>';
      textElement.textContent = 'Войти';
      profileBtn.classList.remove('logged-in');
      
      // Обновляем dropdown
      dropdownAvatar.innerHTML = '<div class="avatar-placeholder">?</div>';
      dropdownUsername.textContent = 'Гость';
      dropdownStatus.textContent = 'Не авторизован';
      dropdownStatus.classList.add('offline');
    }
  }
  function openAuthModal() {
    setAuthMode('login');
    authUsername.value = '';
    authPassword.value = '';
    authError.textContent = '';
    authModal.classList.remove('hidden');
  }
  function closeAuthModal() { authModal.classList.add('hidden'); }
  function setAuthMode(mode) {
    authModal.dataset.mode = mode;
    authTitle.textContent = mode === 'register' ? 'Регистрация' : 'Вход';
    authSubmit.textContent = mode === 'register' ? 'Зарегистрироваться' : 'Войти';
    
    // Обновляем активную вкладку
    tabLogin.classList.toggle('active', mode === 'login');
    tabRegister.classList.toggle('active', mode === 'register');
  }
  async function submitAuth() {
    const mode = authModal.dataset.mode || 'login';
    const username = (authUsername.value || '').trim();
    const password = (authPassword.value || '').trim();
    
    if (!username || !password) { 
      authError.textContent = 'Введите имя и пароль'; 
      return; 
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/auth/${mode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        authError.textContent = data.error || 'Ошибка аутентификации';
        return;
      }
      
      // Сохраняем токен и данные пользователя
      localStorage.setItem('authToken', data.token);
      setCurrentUser(data.user);
      closeAuthModal();
      
    } catch (error) {
      console.error('Auth error:', error);
      authError.textContent = 'Ошибка соединения с сервером';
    }
  }
  function updateAccountUI() {
    const user = getCurrentUser();
    updateProfileAvatar(user);
  }
  
  // Dropdown functions
  function toggleDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    
    if (!dropdown) return;
    
    if (dropdown.classList.contains('active')) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }
  
  function openDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    const profileBtn = document.getElementById('accountBtn');
    
    if (!dropdown || !profileBtn) return;
    
    dropdown.classList.remove('hidden');
    dropdown.classList.add('active');
    profileBtn.classList.add('active');
  }
  
  function closeDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    const profileBtn = document.getElementById('accountBtn');
    
    if (!dropdown || !profileBtn) return;
    
    dropdown.classList.remove('active');
    profileBtn.classList.remove('active');
    
    setTimeout(() => {
      if (!dropdown.classList.contains('active')) {
        dropdown.classList.add('hidden');
      }
    }, 200);
  }
  
  function handleDropdownAction(action) {
    closeDropdown();
    
    switch (action) {
      case 'back-to-hub':
        returnToHub();
        break;
      case 'profile':
        // TODO: Открыть страницу профиля
        console.log('Открыть профиль');
        break;
      case 'settings':
        // TODO: Открыть настройки
        console.log('Открыть настройки');
        break;
      case 'friends':
        // TODO: Открыть список друзей
        console.log('Открыть друзей');
        break;
      case 'logout':
        const user = getCurrentUser();
        if (user && user.username) {
          if (confirm(`Выйти из аккаунта ${user.username}?`)) {
            setCurrentUser(null);
          }
        }
        break;
    }
  }

  // Инициализация при загрузке страницы
  document.addEventListener('DOMContentLoaded', initHub);
  
  // Если страница уже загружена
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHub);
  } else {
    initHub();
  }
})();
