// Minimal local "Hues and Cues" implementation (pass-and-play)

/**
 * Simplified rules implemented:
 * - Any number of local players on one device
 * - Each round one player is the cue giver (rotates)
 * - Cue giver sees the secret target color and enters a single-word cue
 * - Other players each make one guess by clicking a color cell
 * - Scoring: lower Manhattan distance on the board → more points
 *   - distance 0: 3 pts, 1: 2 pts, 2: 1 pt, else: 0
 * - After all players guessed, reveal target, compute points, allow next round
 */

(function init() {
  /** @type {HTMLDivElement} */
  const boardEl = document.getElementById('board');
  const playersListEl = document.getElementById('playersList');
  const addPlayerSectionEl = document.getElementById('addPlayerSection');
  const playerNameInput = document.getElementById('playerNameInput');
  const addPlayerBtn = document.getElementById('addPlayerBtn');
  // Элементы UI, включая онлайн-управление
  const FIXED_WS_URL = 'ws://185.177.219.234:8765/ws';
  // Desktop: try to auto-connect and integrate with hub's waiting room
  let hasPassedWaitingRoom = false;
  // roomInput убран из UI; комната не используется
  const selfNameInput = document.getElementById('selfName');
  const connectBtn = document.getElementById('connectBtn');
  const startGameBtn = document.getElementById('startGameBtn');
  const nextRoundBtn = document.getElementById('nextRoundBtn');
  // удалены тестовые кнопки: forceEndRound/debugState/regenerateBoard
  const roundInfoEl = document.getElementById('roundInfo');
  const cueArea1El = document.getElementById('cueArea1');
  const cueInput1El = document.getElementById('cueInput1');
  const lockCueBtn1 = document.getElementById('lockCueBtn1');
  const cueArea2El = document.getElementById('cueArea2');
  const cueInput2El = document.getElementById('cueInput2');
  const lockCueBtn2 = document.getElementById('lockCueBtn2');
  const currentCueEl = document.getElementById('currentCue');
  const logEl = document.getElementById('log');
  // Модалка победителя
  const winnerModalEl = document.getElementById('winnerModal');
  const winnerTitleEl = document.getElementById('winnerTitle');
  const winnerTextEl = document.getElementById('winnerText');
  const newGameBtn = document.getElementById('newGameBtn');
  // Prefer the button inside the game container to avoid clashing with hub header button
  const backToHubBtn = document.querySelector('#gameContainer #backToHubBtn') || document.getElementById('backToHubBtn');
  const backToHubFromWinnerBtn = document.querySelector('#gameContainer #backToHubFromWinnerBtn') || document.getElementById('backToHubFromWinnerBtn');
  // Логотип: подстраховка — если не загрузится файл иконки, покажем SVG-иконку
  const logoImg = document.querySelector('.app-logo');
  const logoFallback = document.querySelector('.app-logo-fallback');
  if (logoImg && logoFallback) {
    const showFallback = () => { logoImg.style.display = 'none'; logoFallback.style.display = 'inline-block'; };
    logoImg.addEventListener('error', showFallback, { once: true });
    if (logoImg.complete && logoImg.naturalWidth === 0) showFallback();
  }
  // Всегда прячем локальную секцию добавления игроков (онлайн-режим только)
  if (addPlayerSectionEl) addPlayerSectionEl.style.display = 'none';

  // Configurable board size via CSS variables
  const COLS = 30;
  const ROWS = 18;
  const WIN_SCORE = 15; // победа при достижении этого количества очков

  /** @typedef {{ id:string, name:string, score:number }} Player */
  /** @typedef {{ round:number, cueGiverIndex:number, targetIndex:number|null, cue:string|null, guesses:Record<string, number|null>, phase:'setup'|'cue'|'guess'|'reveal' }} GameState */

  /** @type {Player[]} */
  let players = [];
  let currentPlayerId = null; // для офлайн режима - кто сейчас играет
  let selectedColorIndex = null; // выбранный цвет для подсказки
  let availableColors = []; // массив из 4 случайных цветов
  let selfId = null;
  let ws = null;
  // Всегда онлайн
  let offline = false;
  // Чтобы не показывать модалку выбора цвета много раз за один и тот же раунд (в онлайне)
  let modalShownRound = null;
  // Предыдущее серверное состояние для логов
  let prevServerPhase = null;
  let prevServerRound = null;
  let prevServerCue1 = null;
  let prevServerTarget = null;
  // Локальная подсветка выбранного индекса до того, как сервер пришлёт target (только для дающего)
  let localSelectedIdx = null;
  let localSelectedRound = null;
  let winnerShown = false;
  let modalBlockedUntilStart = true;
  let suppressWinnerModal = false; // не показывать модалку, пока ждём reset после start_game
  /** @type {GameState} */
  let state = {
    round: 0,
    cueGiverIndex: 0,
    targetIndex: null,
    cue: null,
    guesses: {},
    phase: 'setup',
  };

  // Build coordinates
  function createCoordinates() {
    // Верхние и нижние цифры (1-30)
    const coordNumbersTop = document.querySelector('.coordinates-top .coord-numbers');
    const coordNumbersBottom = document.querySelector('.coordinates-bottom .coord-numbers');
    
    for (let c = 0; c < COLS; c++) {
      const number = document.createElement('div');
      number.className = 'coord-number';
      number.textContent = String(c + 1);
      coordNumbersTop.appendChild(number.cloneNode(true));
      coordNumbersBottom.appendChild(number);
    }
    
    // Левые и правые буквы (A-R)
    const coordLettersLeft = document.querySelector('.coordinates-left .coord-letters');
    const coordLettersRight = document.querySelector('.coordinates-right .coord-letters');
    
    for (let r = 0; r < ROWS; r++) {
      const letter = document.createElement('div');
      letter.className = 'coord-letter';
      letter.textContent = String.fromCharCode(65 + r); // A, B, C, ...
      coordLettersLeft.appendChild(letter.cloneNode(true));
      coordLettersRight.appendChild(letter);
    }
  }

  // Build color board: HSL grid for good coverage
  function generateBoard() {
    console.log('=== GENERATING BOARD ===');
    console.log('Board element found:', !!boardEl);
    console.log('ROWS:', ROWS, 'COLS:', COLS);
    
    if (!boardEl) {
      console.error('Board element not found!');
      return;
    }
    
    // Очищаем доску перед генерацией
    boardEl.innerHTML = '';
    cells.length = 0; // Очищаем массив ячеек
    
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const hue = Math.round((c / COLS) * 360);
        const sat = 100; // насыщенные цвета
        const topL = 72; // светлее сверху
        const bottomL = 22; // темнее снизу
        const tRow = r / (ROWS - 1);
        const light = Math.round(topL + (bottomL - topL) * tRow);
        const color = `hsl(${hue}deg ${sat}% ${light}%)`;

        const idx = r * COLS + c;
        const cell = document.createElement('button');
        cell.className = 'cell';
        cell.style.background = color;
        cell.setAttribute('data-idx', String(idx));
        cell.setAttribute('role', 'gridcell');
        const rowLetter = String.fromCharCode(65 + r);
        const colNumber = c + 1;
        cell.setAttribute('aria-label', `Цвет ${rowLetter}${colNumber}`);
        cell.title = `${rowLetter}${colNumber}`; // Показываем координаты при наведении
        const marker = document.createElement('div');
        marker.className = 'marker';
        cell.appendChild(marker);
        cell.addEventListener('click', () => onCellClick(idx));
        boardEl.appendChild(cell);
        cells.push(cell);
      }
    }
    
    console.log('Board generated with', cells.length, 'cells');
    console.log('=== BOARD GENERATION COMPLETE ===');
    // Если уже есть состояние сервера, повторно применим его, чтобы восстановить подсветки
    if (window.__serverState) {
      try {
        applyServerState(window.__serverState);
      } catch (e) {
        console.warn('Reapply server state after board generation failed:', e);
      }
    }
  }
  
  const cells = [];

  // Создаем координаты
  createCoordinates();
  // Сразу генерируем доску (не ждём DOMContentLoaded, так как скрипт внизу body)
  try {
    generateBoard();
  } catch (e) {
    console.warn('Initial board generation failed:', e);
  }

  // Функции для модального окна выбора цвета
  function generateRandomColors() {
    availableColors = [];
    const usedIndices = new Set();
    
    // Генерируем 4 случайных индекса ячеек с доски
    while (availableColors.length < 4) {
      const randomIndex = Math.floor(Math.random() * cells.length);
      if (!usedIndices.has(randomIndex)) {
        usedIndices.add(randomIndex);
        const cell = cells[randomIndex];
        const rowLetter = String.fromCharCode(65 + Math.floor(randomIndex / COLS));
        const colNumber = (randomIndex % COLS) + 1;
        
        availableColors.push({
          color: cell.style.background,
          name: `${rowLetter}${colNumber}`,
          index: randomIndex
        });
      }
    }
  }

  function getColorName(hue, sat, light) {
    // Возвращаем координаты вместо названий цветов
    return `${String.fromCharCode(65 + Math.floor(Math.random() * 18))}${Math.floor(Math.random() * 30) + 1}`;
  }

  function showColorSelectionModal() {
    console.log('=== showColorSelectionModal() START ===');
    try {
      const modal = document.getElementById('colorSelectionModal');
      console.log('Modal element found:', !!modal);
      
      if (!modal) {
        throw new Error('Modal element not found');
      }
      
      const colorOptions = modal.querySelectorAll('.color-option');
      console.log('Color options found:', colorOptions.length);
      
      // Источник опций: онлайн берём с сервера, офлайн — генерируем локально
      let opts = [];
      if (isOnline() && window.__serverState?.select_options) {
        const indices = window.__serverState.select_options;
        opts = indices.map(idx => {
          const r = Math.floor(idx / COLS);
          const c = idx % COLS;
          const rowLetter = String.fromCharCode(65 + r);
          const colNumber = c + 1;
          const cell = cells[idx];
          return { index: idx, name: `${rowLetter}${colNumber}`, color: cell?.style.background || '#000' };
        });
        availableColors = opts;
      } else {
        generateRandomColors();
        opts = availableColors;
      }

      colorOptions.forEach((option, index) => {
        const preview = option.querySelector('.color-preview');
        const name = option.querySelector('.color-name');
        const data = opts[index];
        if (preview && name && data) {
          preview.style.background = data.color;
          name.textContent = data.name;
          option.onclick = () => selectColor(index);
        } else {
          option.onclick = null;
        }
      });
      
      modal.classList.remove('hidden');
      console.log('✅ Modal shown successfully');
      
      console.log('=== showColorSelectionModal() END ===');
    } catch (error) {
      console.error('❌ Error in showColorSelectionModal():', error);
      throw error;
    }
  }

  function selectColor(colorIndex) {
    console.log('Color selected:', colorIndex);
    selectedColorIndex = colorIndex;
    const modal = document.getElementById('colorSelectionModal');
    const colorOptions = modal.querySelectorAll('.color-option');
    
    // Убираем выделение с всех опций
    colorOptions.forEach(option => option.classList.remove('selected'));
    
    // Выделяем выбранную опцию
    colorOptions[colorIndex].classList.add('selected');
    
    // Сразу фиксируем локальный выбор и подсвечиваем без ожидания, чтобы не было мерцания
    if (isOnline()) {
      const chosen = availableColors[colorIndex];
      if (chosen) {
        try {
          const s = window.__serverState || {};
          localSelectedIdx = chosen.index;
          localSelectedRound = typeof s.round === 'number' ? s.round : null;
        } catch {}
        // Мягкая подсветка сразу (без resetMarkers, чтобы не убирать другие метки)
        cells[chosen.index]?.classList.add('selected');
      }
    }
    // Закрываем модальное окно через небольшую задержку и отправляем выбор
    setTimeout(() => {
      modal.classList.add('hidden');
      console.log('Modal closed');
      if (isOnline()) {
        const chosen = availableColors[colorIndex];
        if (chosen) wsSend({ type: 'choose_target', index: chosen.index });
      } else {
        showSelectedColorForCueGiver();
        currentPlayerId = players[state.cueGiverIndex].id;
        updateUIState();
      }
    }, 300);
  }

  function showSelectedColorForCueGiver() {
    console.log('showSelectedColorForCueGiver called, selectedColorIndex:', selectedColorIndex);
    if (selectedColorIndex !== null && availableColors[selectedColorIndex]) {
      resetMarkers();
      
      // Используем сохраненный индекс ячейки
      const selectedColorData = availableColors[selectedColorIndex];
      const cellIndex = selectedColorData.index;
      
      console.log('Highlighting cell at index:', cellIndex);
      console.log('Setting state.targetIndex to:', cellIndex);
      
      // Подсвечиваем выбранную ячейку белой рамкой
      cells[cellIndex].classList.add('selected');
      state.targetIndex = cellIndex; // Сохраняем индекс для подсчета очков
    }
  }

  function resetMarkers() {
    cells.forEach((el) => {
      // не трогаем .guess и .selected здесь, чтобы не стирать актуальные клики и подсветку дающего
      el.classList.remove('target', 'best');
    });
  }

  function clearSelectedMarkers() {
    cells.forEach((el) => {
      el.classList.remove('selected');
    });
  }

  function rerenderPlayers() {
    playersListEl.innerHTML = '';
    players.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'player-row';
      if (currentPlayerId === p.id) {
        row.classList.add('current-player');
      }
      const left = document.createElement('div');
      left.textContent = p.name + (i === state.cueGiverIndex && state.phase !== 'setup' ? ' (даёт подсказку)' : '');
      const right = document.createElement('div');
      right.className = 'score';
      right.textContent = String(p.score);
      row.appendChild(left);
      row.appendChild(right);
      playersListEl.appendChild(row);
    });
  }

  function isOnline() {
    return !offline && ws && ws.readyState === WebSocket.OPEN;
  }

  function updateUIState() {
    const online = isOnline();
    const s = window.__serverState;
    const phase = online ? (s?.phase || 'lobby') : state.phase;
    console.log('updateUIState called, phase:', phase);
    
    if (phase === 'lobby' || phase === 'setup') {
      roundInfoEl.textContent = online ? 'Ожидание игроков. Нажмите Старт.' : 'Добавьте игроков и нажмите Старт.';
      cueArea1El.classList.add('hidden');
      cueArea2El.classList.add('hidden');
      currentCueEl.classList.add('hidden');
      nextRoundBtn.disabled = true;
      // онлайн-режим только: локальное добавление игроков скрыто
      addPlayerSectionEl.style.display = 'none';
      startGameBtn.disabled = online ? false : false;
    } else if (phase === 'cue1') {
      const giverIdx = online ? players.findIndex(p => p.id === s?.cue_giver) : state.cueGiverIndex;
      const giver = players[giverIdx];
      const roundNum = online ? (s?.round ?? 0) : state.round;
      roundInfoEl.textContent = `Раунд ${roundNum}. Подсказку #1 даёт: ${giver?.name ?? ''}`;
      const isGiver = online ? (giver && selfId && giver.id === selfId) : (giver && currentPlayerId === giver.id);
      cueArea1El.classList.toggle('hidden', !isGiver);
      cueArea2El.classList.add('hidden');
      currentCueEl.classList.add('hidden');
      nextRoundBtn.disabled = true;
      if (isGiver) { cueInput1El.value = ''; cueInput1El.focus(); }

      // Онлайновая модалка выбора цвета только у дающего, один раз на раунд
      if (online) {
        const hasOptions = Array.isArray(s?.select_options) && s.select_options.length > 0;
        const targetNotChosen = !s?.target;
        if (!modalBlockedUntilStart && isGiver && hasOptions && targetNotChosen && s.round !== modalShownRound) {
          try {
            showColorSelectionModal();
            modalShownRound = s.round;
          } catch (e) {
            console.error('Failed to show color selection modal:', e);
          }
        }
      }
    } else if (phase === 'guess1') {
      const giverIdx = online ? players.findIndex(p => p.id === s?.cue_giver) : state.cueGiverIndex;
      const giver = players[giverIdx];
      const roundNum = online ? (s?.round ?? 0) : state.round;
      roundInfoEl.textContent = `Раунд ${roundNum}. Подсказка #1 от ${giver?.name ?? ''}. Первая волна догадок.`;
      cueArea1El.classList.add('hidden');
      cueArea2El.classList.add('hidden');
      currentCueEl.classList.remove('hidden');
      nextRoundBtn.disabled = true;
    } else if (phase === 'cue2') {
      const giverIdx = online ? players.findIndex(p => p.id === s?.cue_giver) : state.cueGiverIndex;
      const giver = players[giverIdx];
      const roundNum = online ? (s?.round ?? 0) : state.round;
      roundInfoEl.textContent = `Раунд ${roundNum}. Подсказку #2 даёт: ${giver?.name ?? ''}`;
      const isGiver = online ? (giver && selfId && giver.id === selfId) : (giver && currentPlayerId === giver.id);
      cueArea1El.classList.add('hidden');
      cueArea2El.classList.toggle('hidden', !isGiver);
      currentCueEl.classList.remove('hidden');
      nextRoundBtn.disabled = true;
      if (isGiver) { cueInput2El.value = ''; cueInput2El.focus(); }
    } else if (phase === 'guess2') {
      const giverIdx = online ? players.findIndex(p => p.id === s?.cue_giver) : state.cueGiverIndex;
      const giver = players[giverIdx];
      const roundNum = online ? (s?.round ?? 0) : state.round;
      roundInfoEl.textContent = `Раунд ${roundNum}. Подсказка #2 от ${giver?.name ?? ''}. Вторая волна догадок.`;
      cueArea1El.classList.add('hidden');
      cueArea2El.classList.add('hidden');
      currentCueEl.classList.remove('hidden');
      nextRoundBtn.disabled = true;
    } else if (phase === 'reveal') {
      const roundNum = online ? (s?.round ?? 0) : state.round;
      roundInfoEl.textContent = `Раунд ${roundNum} завершён.`;
      cueArea1El.classList.add('hidden');
      cueArea2El.classList.add('hidden');
      currentCueEl.classList.remove('hidden');
      nextRoundBtn.disabled = false;
      console.log('Reveal phase: nextRoundBtn enabled');
    }
    rerenderPlayers();
  }

  function log(message) {
    const el = document.createElement('div');
    el.className = 'log-entry';
    el.textContent = message;
    logEl.prepend(el);
  }

  function startGame() {
    if (isOnline()) {
      wsSend({ type: 'start_game' });
    } else {
      startOfflineGame();
    }
    // при старте новой игры скрываем модалку победителя и сбрасываем флаг
    if (winnerModalEl) winnerModalEl.classList.add('hidden');
    winnerShown = false;
    modalBlockedUntilStart = false;
    suppressWinnerModal = false;
  }

  function startOfflineGame() {
    if (players.length < 2) { alert('Нужно минимум 2 игрока.'); return; }
    players = players.map((p)=>({ ...p, score: 0 }));
    state.round = 1;
    state.cueGiverIndex = 0;
    state.phase = 'cue1';
    state.cue = null;
    state.targetIndex = pickTarget();
    state.guesses = Object.fromEntries(players.map((p)=>[p.id, null]));
    state.guesses2 = Object.fromEntries(players.map((p)=>[p.id, null]));
    
    // Выбор цвета делает второй игрок (не тот, кто будет давать подсказки)
    const colorSelectorIndex = (state.cueGiverIndex + 1) % players.length;
    currentPlayerId = players[colorSelectorIndex].id;
    selectedColorIndex = null; // сбрасываем выбранный цвет
    resetMarkers();
    currentCueEl.textContent = '';
    logEl.innerHTML = '';
    
    console.log('Game started - color selection by:', players[colorSelectorIndex].name);
    console.log('Cue will be given by:', players[state.cueGiverIndex].name);
    
    // Показываем модальное окно выбора цвета
    showColorSelectionModal();
    
    updateUIState();
  }

  function showTargetForCueGiver(show) {
    resetMarkers();
    if (show && selectedColorIndex !== null) {
      // Показываем выбранный цвет вместо случайного
      showSelectedColorForCueGiver();
    }
    // Если show = false, просто сбрасываем маркеры (подсветка скрыта)
  }

  function pickTarget() {
    return Math.floor(Math.random() * ROWS * COLS);
  }

  function lockCue1() {
    const cue = (cueInput1El.value || '').trim();
    if (!cue || cue.split(/\s+/).length !== 1) { alert('Подсказка #1 — одно слово.'); return; }
    if (isOnline()) {
      wsSend({ type: 'lock_cue1', cue });
    } else {
      state.cue1 = cue;
      currentCueEl.textContent = cue;
      showTargetForCueGiver(false); // Скрываем подсветку после дачи подсказки
      state.phase = 'guess1';
      const nextPlayerIndex = (state.cueGiverIndex + 1) % players.length;
      currentPlayerId = players[nextPlayerIndex].id;
      updateUIState();
    }
  }
  function lockCue2() {
    const cue2 = (cueInput2El.value || '').trim();
    if (!cue2 || cue2.split(/\s+/).length > 2) { alert('Подсказка #2 — до двух слов.'); return; }
    if (isOnline()) {
      wsSend({ type: 'lock_cue2', cue2 });
    } else {
      state.cue2 = cue2;
      currentCueEl.textContent = [state.cue1, cue2].filter(Boolean).join(' / ');
      state.phase = 'guess2';
      const nextPlayerIndex = (state.cueGiverIndex + 1) % players.length;
      currentPlayerId = players[nextPlayerIndex].id;
      updateUIState();
    }
  }

  function idxToRC(idx) {
    return { r: Math.floor(idx / COLS), c: idx % COLS };
  }

  function manhattan(aIdx, bIdx) {
    const a = idxToRC(aIdx);
    const b = idxToRC(bIdx);
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
  }

  function scoreByDistance(d) {
    if (d === 0) return 3;
    if (d === 1) return 2;
    if (d === 2) return 1;
    return 0;
  }

  function nextPlayer() {
    if (!offline) return;
    const activePlayers = players.filter((_, i) => i !== state.cueGiverIndex);
    const currentIndex = activePlayers.findIndex(p => p.id === currentPlayerId);
    const nextIndex = (currentIndex + 1) % activePlayers.length;
    currentPlayerId = activePlayers[nextIndex].id;
    updateUIState();
  }

  function nextRound() {
    console.log('=== nextRound() FUNCTION START ===');
    console.log('nextRound() called');
    console.log('Starting next round, current phase:', state.phase);
    console.log('Players:', players.length);
    console.log('Current cue giver index:', state.cueGiverIndex);
    
    resetMarkers();
    state.round += 1;
    state.cueGiverIndex = (state.cueGiverIndex + 1) % players.length;
    state.cue = null;
    state.targetIndex = pickTarget();
    state.guesses = Object.fromEntries(players.map((p) => [p.id, null]));
    state.guesses2 = Object.fromEntries(players.map((p) => [p.id, null]));
    
    // Выбор цвета делает следующий игрок по списку (не тот, кто будет давать подсказки)
    const nextPlayerIndex = (state.cueGiverIndex + 1) % players.length;
    currentPlayerId = players[nextPlayerIndex].id;
    selectedColorIndex = null; // сбрасываем выбранный цвет
    currentCueEl.textContent = '';
    log(`— Раунд ${state.round} —`);
    
    console.log('About to show color selection modal');
    console.log('Color selection by player:', players[nextPlayerIndex].name);
    console.log('Cue will be given by player:', players[state.cueGiverIndex].name);
    
    try {
      // Показываем модальное окно выбора цвета для следующего игрока
      showColorSelectionModal();
      console.log('✅ Color selection modal shown');
    } catch (error) {
      console.error('❌ Error showing color selection modal:', error);
      throw error;
    }
    
    state.phase = 'cue1';
    updateUIState();
    console.log('Next round started, phase set to cue1');
    console.log('=== nextRound() FUNCTION END ===');
  }

  // UI events
  addPlayerBtn.addEventListener('click', () => {
    const name = (playerNameInput.value || '').trim();
    if (!name) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    players.push({ id, name, score: 0 });
    playerNameInput.value = '';
    rerenderPlayers();
    updateUIState();
  });
  playerNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addPlayerBtn.click();
  });

  startGameBtn.addEventListener('click', startGame);
  lockCueBtn1.addEventListener('click', lockCue1);
  lockCueBtn2.addEventListener('click', lockCue2);
  // Добавляем обработчик для кнопки "Следующий раунд" с дополнительной отладкой
  nextRoundBtn.addEventListener('click', (e) => {
    console.log('=== NEXT ROUND BUTTON CLICKED ===');
    console.log('Button disabled:', nextRoundBtn.disabled);
    console.log('Current phase:', state.phase);
    console.log('Offline mode:', offline);
    console.log('Players count:', players.length);
    console.log('Current cue giver index:', state.cueGiverIndex);
    console.log('Current player ID:', currentPlayerId);
    
    if (nextRoundBtn.disabled) {
      console.log('❌ Button is disabled, ignoring click');
      alert('Кнопка "Следующий раунд" заблокирована. Игра должна быть в фазе "reveal".');
      return;
    }
    
    console.log('✅ Button is enabled, calling nextRound()');
    try {
      if (isOnline()) wsSend({ type: 'next_round' }); else nextRound();
      console.log('✅ nextRound() completed successfully');
    } catch (error) {
      console.error('❌ Error in nextRound():', error);
      alert('Ошибка при запуске следующего раунда: ' + error.message);
    }
  });
  
  // удалены обработчики тестовых кнопок


  // Добавляем проверку состояния при загрузке страницы
  document.addEventListener('DOMContentLoaded', () => {
    console.log('=== PAGE LOADED ===');
    console.log('Offline mode:', offline);
    console.log('Players count:', players.length);
    console.log('Current phase:', state.phase);
    console.log('Next round button found:', !!nextRoundBtn);
    console.log('Modal found:', !!document.getElementById('colorSelectionModal'));
    console.log('=== PAGE LOAD COMPLETE ===');
  });

  // ONLINE: WebSocket client (optional)
  function wsConnect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    const url = FIXED_WS_URL;
    ws = new WebSocket(url);
    ws.onopen = () => {
      let uname = 'Игрок';
      try {
        const cu = JSON.parse(localStorage.getItem('currentUser') || 'null');
        if (cu && cu.username) uname = cu.username;
      } catch {}
      wsSend({ type: 'join', name: (selfNameInput?.value || uname).trim(), room: 'default' });
      connectBtn.textContent = 'Отключиться';
      connectBtn.onclick = wsDisconnect;
      startGameBtn.disabled = false;
      modalBlockedUntilStart = true;
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'welcome') { selfId = msg.id; }
        if (msg.type === 'state') { applyServerState(msg.state); }
        if (msg.type === 'error') { alert(msg.message); }
      } catch (e) {
        console.error(e);
      }
    };
    ws.onerror = () => { alert('Не удалось подключиться к серверу.'); };
    ws.onclose = () => {
      connectBtn.textContent = 'Подключиться';
      connectBtn.onclick = wsConnect;
      startGameBtn.disabled = true;
      ws = null;
      modalBlockedUntilStart = true;
    };
  }
  function wsDisconnect() { if (ws) ws.close(); }
  function wsSend(obj) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

  // Expose minimal helpers for hub waiting room integration
  window.addPlayerToGame = function(username) {
    try {
      wsConnect();
    } catch {}
    const stub = { id: `${Date.now()}-stub`, name: username || 'Игрок', score: 0 };
    // reflect locally in sidebar list until server state arrives
    try {
      players = [stub];
      rerenderPlayers();
    } catch {}
    return stub;
  };

  window.updateWaitingRoomPlayers = function(playerList) {
    try {
      const listEl = document.getElementById('waiting-players-list');
      if (!listEl) return;
      listEl.innerHTML = '';
      (playerList || []).forEach(p => {
        const item = document.createElement('div');
        item.className = 'waiting-player-item';
        item.textContent = p && p.name ? p.name : 'Игрок';
        listEl.appendChild(item);
      });
    } catch {}
  };

  window.setHasPassedWaitingRoom = function(v) { hasPassedWaitingRoom = !!v; };

  function applyServerState(s) {
    window.__serverState = s;
    // Не показывать модалку при самом первом подключении (только если это лобби):
    if (prevServerRound == null && (s.phase === 'lobby' || s.phase === 'setup' || s.round === 0)) {
      modalShownRound = s.round;
    }
    // Разрешаем модалку выбора только после фактического повышения номера раунда
    if (prevServerRound != null && s.round > prevServerRound) {
      modalBlockedUntilStart = false;
    }
    players = s.players || [];
    state.round = s.round;
    state.cueGiverIndex = s.cue_giver ? players.findIndex(p => p.id === s.cue_giver) : 0;
    currentCueEl.textContent = [s.cue1, s.cue2].filter(Boolean).join(' / ');
    resetMarkers();
    // очищаем прошлые бейджи очков
    cells.forEach((el)=> el.removeAttribute('data-points'));
    clearSelectedMarkers();
    // Подсветка выбранного цвета у дающего (все фазы раунда)
    const isGiver = selfId && s.cue_giver && selfId === s.cue_giver;
    const inRoundPhases = s.phase === 'cue1' || s.phase === 'guess1' || s.phase === 'cue2' || s.phase === 'guess2' || s.phase === 'reveal';
    if (isGiver && inRoundPhases) {
      if (typeof s.target === 'number') {
        cells[s.target]?.classList.add('selected');
      } else if (localSelectedIdx != null && (localSelectedRound == null || localSelectedRound === s.round)) {
        // Сервер пока не прислал target, удерживаем локальную подсветку
        cells[localSelectedIdx]?.classList.add('selected');
      }
    }
    // Отмечаем догадки игроков в течение всего раунда, если сервер присылает last_guesses
    // Отображаем догадки по фазам, поддерживая разные форматы от сервера:
    // guesses1/guesses2/last_guesses могут быть:
    // - массивом пар [playerId, idx]
    // - объектом { playerId: idx }
    // - массивом индексов
    const toIndices = (data) => {
      if (!data) return [];
      if (Array.isArray(data)) {
        const out = [];
        for (const item of data) {
          if (Array.isArray(item)) out.push(item[1]);
          else if (typeof item === 'number') out.push(item);
        }
        return out.filter((x)=> typeof x === 'number');
      }
      if (typeof data === 'object') {
        return Object.values(data).filter((x)=> typeof x === 'number');
      }
      return [];
    };
    const toMap = (data) => {
      const map = new Map();
      if (!data) return map;
      if (Array.isArray(data)) {
        for (const item of data) {
          if (Array.isArray(item) && item.length >= 2) {
            map.set(String(item[0]), item[1]);
          }
        }
      } else if (typeof data === 'object') {
        for (const [k, v] of Object.entries(data)) {
          if (typeof v === 'number') map.set(String(k), v);
        }
      }
      return map;
    };
    // Всегда пересобираем guess-маркеры на основе серверных данных, чтобы видеть одинаковое у всех
    cells.forEach((el)=> el.classList.remove('guess'));
    let indices = [];
    if (s.phase === 'guess1' || s.phase === 'cue2') {
      // показываем первые догадки
      const g1 = toMap(s.guesses1);
      if (g1.size > 0) indices = Array.from(g1.values());
      else indices = toIndices(s.guesses) || toIndices(s.last_guesses);
    } else if (s.phase === 'guess2' || s.phase === 'reveal') {
      // показываем вторые догадки, а для не сделавших второй — первые
      const g1 = toMap(s.guesses1);
      const g2 = toMap(s.guesses2);
      if (g1.size > 0 || g2.size > 0) {
        const set = new Set();
        for (const [, idx] of g2) if (typeof idx === 'number') set.add(idx);
        for (const [pid, idx] of g1) if (!g2.has(pid) && typeof idx === 'number') set.add(idx);
        indices = Array.from(set.values());
      } else {
        indices = toIndices(s.last_guesses) || toIndices(s.guesses2) || [];
      }
    }
    for (const idx of indices) if (typeof idx === 'number') cells[idx]?.classList.add('guess');
    // В фазе reveal дополнительно подсветим цель и покажем очки вокруг цели (зоны 3/2/1)
    if (s.phase === 'reveal' && typeof s.target === 'number') {
      const targetIdx = s.target;
      cells[targetIdx]?.classList.add('target');
      // Показать очки для всех клеток в радиусе Манхэттена <= 2 (3/2/1)
      for (let i = 0; i < cells.length; i++) {
        const d = manhattan(i, targetIdx);
        const pts = scoreByDistance(d);
        if (pts > 0) cells[i]?.setAttribute('data-points', String(pts));
      }
    }
    // Логи по изменениям состояния
    if (prevServerRound !== s.round && prevServerRound != null) {
      log(`— Раунд ${s.round} —`);
      modalShownRound = null; // сбрасываем флаг показа модалки на новый раунд
      localSelectedIdx = null;
      localSelectedRound = null;
      clearSelectedMarkers();
      // очищаем все догадки с прошлого раунда
      cells.forEach((el)=> el.classList.remove('guess'));
    }
    if (!prevServerCue1 && s.cue1) {
      log(`Подсказка #1: ${s.cue1}`);
    }
    if (prevServerPhase !== s.phase) {
      const phaseName = { lobby: 'Лобби', cue1: 'Подсказка #1', guess1: 'Первая волна догадок', cue2: 'Подсказка #2', guess2: 'Вторая волна догадок', reveal: 'Результаты' }[s.phase] || s.phase;
      log(`Фаза: ${phaseName}`);
    }
    if (!prevServerTarget && s.target && s.phase !== 'reveal' && selfId && s.cue_giver === selfId) {
      // дающий выбрал цвет
      const idx = s.target;
      const rowLetter = String.fromCharCode(65 + Math.floor(idx / COLS));
      const colNumber = (idx % COLS) + 1;
      log(`Вы выбрали цвет ${rowLetter}${colNumber}`);
    }
    prevServerRound = s.round;
    prevServerPhase = s.phase;
    prevServerCue1 = s.cue1;
    prevServerTarget = s.target;
    updateUIState();

    // Выявление победителя (>= WIN_SCORE) и показ модалки один раз
    try {
      const winner = Array.isArray(players) ? players.find(p => (p.score || 0) >= WIN_SCORE) : null;
      if (winner && !winnerShown && !suppressWinnerModal) {
        if (winnerTitleEl) winnerTitleEl.textContent = 'Победитель';
        if (winnerTextEl) winnerTextEl.textContent = `${winner.name} набрал ${WIN_SCORE} очков и победил!`;
        if (winnerModalEl) winnerModalEl.classList.remove('hidden');
        winnerShown = true;
      }
      // Сброс флага, если началась новая игра (все очки обнулены)
      if (!winner && players.length > 0 && players.every(p => (p.score || 0) === 0) && (s.round === 0 || s.round === 1) && (s.phase === 'lobby' || s.phase === 'cue1' || s.phase === 'setup')) {
        winnerShown = false;
        if (winnerModalEl) winnerModalEl.classList.add('hidden');
        suppressWinnerModal = false; // сервер подтвердил reset
      }
      // Дополнительно: если пришла фаза cue1 (новый раунд/новая игра), гарантированно прячем модалку у всех
      if (s.phase === 'cue1' && winnerShown) {
        if (winnerModalEl) winnerModalEl.classList.add('hidden');
        winnerShown = false;
        suppressWinnerModal = false;
      }
    } catch {}

    // Если начался новый раунд (номер раунда вырос) — это сигнал, что кто-то перезапустил игру.
    // Закрываем окно победителя у всех клиентов и сбрасываем подавление.
    if (prevServerRound != null && s.round > prevServerRound) {
      if (winnerModalEl) winnerModalEl.classList.add('hidden');
      winnerShown = false;
      suppressWinnerModal = false;
    }
  }

  // Подключение по фиксированному адресу
  if (connectBtn) connectBtn.addEventListener('click', wsConnect);

  // Кнопка "Начать новую игру" в модалке победителя
  if (newGameBtn) {
    newGameBtn.addEventListener('click', () => {
      // Делаем то же, что и кнопка Старт: запускаем новую игру через сервер
      // Мгновенно чистим локальные маркеры, чтобы прошлые догадки и подсветки исчезли сразу
      try {
        cells.forEach((el) => {
          el.classList.remove('guess', 'target', 'best', 'selected');
          el.removeAttribute('data-points');
        });
        logEl.innerHTML = '';
        prevServerRound = null;
        prevServerPhase = null;
        prevServerCue1 = null;
        prevServerTarget = null;
        localSelectedIdx = null;
        localSelectedRound = null;
        modalShownRound = null;
      } catch {}

      modalBlockedUntilStart = false; // разрешаем модалку выбора после явного старта
      suppressWinnerModal = true; // не показывать победителя, пока ждём подтверждение от сервера
      if (isOnline()) {
        wsSend({ type: 'start_game' });
      } else {
        // Если не подключены — подключаемся и после открытия сокета шлём start_game
        wsConnect();
        const tryStart = () => { if (isOnline()) { wsSend({ type: 'start_game' }); clearInterval(t); } };
        const t = setInterval(tryStart, 200);
        setTimeout(() => clearInterval(t), 6000);
      }
      if (winnerModalEl) winnerModalEl.classList.add('hidden');
      winnerShown = false;
    });
  }

  // Кнопка "Назад в хаб" в заголовке
  if (backToHubBtn) {
    backToHubBtn.addEventListener('click', () => {
      if (window.returnToHub) {
        window.returnToHub();
      } else if (window.parent && window.parent.returnToHub) {
        window.parent.returnToHub();
      } else {
        // Fallback для случая, если игра запущена не из хаба
        window.location.href = '../../index.html';
      }
    });
  }

  // Кнопка "Вернуться в хаб" в модалке победителя
  if (backToHubFromWinnerBtn) {
    backToHubFromWinnerBtn.addEventListener('click', () => {
      if (window.returnToHub) {
        window.returnToHub();
      } else if (window.parent && window.parent.returnToHub) {
        window.parent.returnToHub();
      } else {
        // Fallback для случая, если игра запущена не из хаба
        window.location.href = '../../index.html';
      }
    });
  }

  function onCellClick(idx) {
    console.log('Cell clicked:', idx);
    if (isOnline()) {
      const s = window.__serverState || {};
      if (s.phase === 'guess1' || s.phase === 'guess2') {
        // блокируем клики у дающего подсказку
        if (selfId && s.cue_giver && selfId === s.cue_giver) return;
        wsSend({ type: 'guess', cell: idx });
        // Немедленно показать выбор этому клиенту (только если это первая волна)
        if (s.phase === 'guess1') cells[idx]?.classList.add('guess');
      }
      return;
    }
    if (state.phase === 'guess1' || state.phase === 'guess2') {
      const active = players.filter((_, i)=> i !== state.cueGiverIndex);
      const map = state.phase === 'guess1' ? state.guesses : state.guesses2;
      
      // Проверяем, что кликнул именно текущий игрок
      if (currentPlayerId && map[currentPlayerId] != null) {
        alert('Вы уже сделали догадку в этом раунде!');
        return;
      }
      
      if (currentPlayerId) {
        map[currentPlayerId] = idx;
        cells[idx].classList.add('guess');
        const player = players.find(p => p.id === currentPlayerId);
        const rowLetter = String.fromCharCode(65 + Math.floor(idx / COLS));
        const colNumber = (idx % COLS) + 1;
        log(`${player?.name || 'Игрок'} сделал догадку на ${rowLetter}${colNumber}.`);
        
        // Передаем ход следующему игроку
        const currentIndex = active.findIndex(p => p.id === currentPlayerId);
        const nextIndex = (currentIndex + 1) % active.length;
        currentPlayerId = active[nextIndex].id;
        
        const remaining = active.filter((p)=> map[p.id] == null);
        console.log('Remaining players without guesses:', remaining.length);
        if (remaining.length === 0) {
          console.log('All players have guessed, phase:', state.phase);
          if (state.phase === 'guess1') {
            state.phase = 'cue2';
            currentPlayerId = players[state.cueGiverIndex].id; // возвращаем ход дающему подсказку
            console.log('Moving to cue2 phase');
          } else {
            console.log('Calling revealAndScoreOffline');
            revealAndScoreOffline();
          }
          updateUIState();
        } else {
          updateUIState(); // обновляем UI для следующего игрока
        }
      }
    } else {
      // Для других фаз показываем координаты
      const rowLetter = String.fromCharCode(65 + Math.floor(idx / COLS));
      const colNumber = (idx % COLS) + 1;
      console.log(`Clicked cell: ${rowLetter}${colNumber}`);
    }
  }

  function revealAndScoreOffline() {
    console.log('revealAndScoreOffline called, targetIndex:', state.targetIndex);
    console.log('Current phase before reveal:', state.phase);
    if (state.targetIndex == null) {
      console.error('targetIndex is null, cannot reveal');
      return;
    }
    cells[state.targetIndex].classList.add('target');
    const active = players.filter((_, i)=> i !== state.cueGiverIndex);
    let best = { idx: null, d: Infinity };
    for (const p of active) {
      const g = state.guesses2[p.id];
      if (g == null) continue;
      const d = manhattan(g, state.targetIndex);
      const pts = scoreByDistance(d);
      players = players.map((x)=> x.id === p.id ? { ...x, score: x.score + pts } : x);
      if (d < best.d) best = { idx: g, d };
      const rowLetter = String.fromCharCode(65 + Math.floor(g / COLS));
      const colNumber = (g % COLS) + 1;
      log(`${p.name}: расстояние ${d}, +${pts} очков (${rowLetter}${colNumber})`);
    }
    if (best.idx != null) cells[best.idx].classList.add('best');
    state.phase = 'reveal';
    console.log('Game phase changed to reveal, nextRoundBtn should be enabled');
    console.log('Calling updateUIState after phase change');
    updateUIState();
  }

  // Добавляем кнопку для принудительного завершения раунда (для тестирования)
  function forceEndRound() {
    if (offline && state.phase !== 'reveal') {
      console.log('Force ending round, current phase:', state.phase);
      revealAndScoreOffline();
      updateUIState();
    }
  }
  
  // Добавляем обработчики для тестирования
  document.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') {
      forceEndRound();
    }
    // Убираем возможность принудительно выбирать цвет клавишей S —
    // модалка должна оставаться открытой до реального выбора пользователем
  });

  // Инициализация игры
  updateUIState();

  // Auto-connect for desktop clients
  try { wsConnect(); } catch {}
})();


