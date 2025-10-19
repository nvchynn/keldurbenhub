class KeldurbenStickersGame {
    constructor() {
        this.players = [];
        this.characters = new Map(); // player -> character
        this.currentGuesserIndex = 0;
        this.gameState = 'setup'; // setup, guessing, playing, results
        this.currentQuestion = null;
        this.votes = new Map(); // player -> vote
        this.guessedPlayers = new Set();
        
        this.initializeElements();
        this.attachEventListeners();
        this.initializeWithCurrentUser();
    }

    initializeElements() {
        // Экраны
        this.screens = {
            setup: document.getElementById('setup-screen'),
            guessing: document.getElementById('guessing-screen'),
            game: document.getElementById('game-screen'),
            results: document.getElementById('results-screen')
        };

        // Элементы настройки
        this.playersList = document.getElementById('players-list');
        this.startGameBtn = document.getElementById('start-game-btn');

        // Элементы загадывания
        this.currentGuesserSpan = document.getElementById('current-guesser');
        this.targetPlayerSpan = document.getElementById('target-player');
        this.characterNameInput = document.getElementById('character-name');
        this.submitCharacterBtn = document.getElementById('submit-character-btn');
        this.progressFill = document.getElementById('progress-fill');
        this.progressText = document.getElementById('progress-text');

        // Элементы игры
        this.playerCardsContainer = document.getElementById('player-cards-container');

        // Элементы результатов
        this.resultsList = document.getElementById('results-list');
    }

    // Функции для работы с профилями (копируем из hub.js)
    getCurrentUser() {
        try { 
            return JSON.parse(localStorage.getItem('currentUser') || 'null'); 
        } catch { 
            return null; 
        }
    }

    initializeWithCurrentUser() {
        const currentUser = this.getCurrentUser();
        if (currentUser && currentUser.username) {
            // Автоматически добавляем текущего пользователя
            this.players.push(currentUser.username);
            this.updatePlayersList();
            this.updateStartButton();
            
            // Скрываем информационное сообщение, так как пользователь авторизован
            const playersInfo = document.querySelector('.players-info');
            if (playersInfo) {
                playersInfo.style.display = 'none';
            }
        } else {
            // Показываем информационное сообщение, если пользователь не авторизован
            const playersInfo = document.querySelector('.players-info');
            if (playersInfo) {
                playersInfo.textContent = 'Войдите в аккаунт, чтобы автоматически добавиться в игру';
                playersInfo.style.display = 'block';
            }
        }
    }

    attachEventListeners() {
        // Настройка игры
        this.startGameBtn.addEventListener('click', () => this.startGuessing());

        // Загадывание
        this.submitCharacterBtn.addEventListener('click', () => this.submitCharacter());
        this.characterNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.submitCharacter();
        });



        // Навигация
        document.getElementById('play-again-btn').addEventListener('click', () => this.playAgain());
    }


    updatePlayersList() {
        this.playersList.innerHTML = '';
        const currentUser = this.getCurrentUser();
        
        this.players.forEach((player, index) => {
            const playerItem = document.createElement('div');
            playerItem.className = 'player-item';
            
            // Проверяем, является ли игрок текущим пользователем
            const isCurrentUser = currentUser && currentUser.username === player;
            const playerName = isCurrentUser ? `${player} (Вы)` : player;
            
            playerItem.innerHTML = `
                <span class="player-name">${playerName}</span>
            `;
            
            this.playersList.appendChild(playerItem);
        });
    }


    updateStartButton() {
        this.startGameBtn.disabled = this.players.length < 1;
    }

    startGuessing() {
        if (this.players.length < 1) {
            alert('Нужно минимум 1 игрок!');
            return;
        }

        this.gameState = 'guessing';
        this.currentGuesserIndex = 0;
        this.characters.clear();
        this.showScreen('guessing');
        this.updateGuessingUI();
    }

    updateGuessingUI() {
        const currentGuesser = this.players[this.currentGuesserIndex];
        
        // Для одного игрока загадываем персонажа для себя
        const targetPlayer = currentGuesser;

        this.currentGuesserSpan.textContent = currentGuesser;
        this.targetPlayerSpan.textContent = targetPlayer;
        this.characterNameInput.value = '';
        this.characterNameInput.focus();

        const progress = (this.currentGuesserIndex / this.players.length) * 100;
        this.progressFill.style.width = `${progress}%`;
        this.progressText.textContent = `${this.currentGuesserIndex} из ${this.players.length} загадано`;
    }

    submitCharacter() {
        const character = this.characterNameInput.value.trim();
        if (!character) return;

        const currentGuesser = this.players[this.currentGuesserIndex];
        
        // Для одного игрока загадываем персонажа для себя
        this.characters.set(currentGuesser, character);
        this.currentGuesserIndex++;

        if (this.currentGuesserIndex >= this.players.length) {
            this.startGame();
        } else {
            this.updateGuessingUI();
        }
    }

    startGame() {
        this.gameState = 'playing';
        this.guessedPlayers.clear();
        this.showScreen('game');
        this.updateGameUI();
    }

    updateGameUI() {
        this.updatePlayerCards();
    }

    updatePlayerCards() {
        this.playerCardsContainer.innerHTML = '';
        this.players.forEach((player, index) => {
            // Создаем контейнер для карточки игрока и заметок
            const playerContainer = document.createElement('div');
            playerContainer.className = 'player-container';
            
            // Создаем карточку игрока
            const card = document.createElement('div');
            card.className = 'player-card';
            
            const character = this.characters.get(player);
            card.innerHTML = `
                <div class="player-name">${player}</div>
                <div class="character-name">${character || 'Загадывается...'}</div>
            `;
            
            // Создаем контейнер для заметок
            const notesContainer = document.createElement('div');
            notesContainer.className = 'notes-container';
            notesContainer.innerHTML = `
                <textarea id="notes-${index}" class="notes-textarea" placeholder="Ваши заметки о персонаже..." rows="3"></textarea>
            `;
            
            // Добавляем карточку и заметки в контейнер
            playerContainer.appendChild(card);
            playerContainer.appendChild(notesContainer);
            
            this.playerCardsContainer.appendChild(playerContainer);
        });
    }


    showMessage(message, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: ${type === 'success' ? '#d4edda' : '#f8d7da'};
            color: ${type === 'success' ? '#155724' : '#721c24'};
            padding: 20px;
            border-radius: 10px;
            border: 2px solid ${type === 'success' ? '#c3e6cb' : '#f5c6cb'};
            z-index: 1000;
            font-weight: 600;
            font-size: 1.1rem;
        `;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            document.body.removeChild(messageDiv);
        }, 3000);
    }

    endGame() {
        this.gameState = 'results';
        this.showScreen('results');
        this.showResults();
    }

    showResults() {
        this.resultsList.innerHTML = '';
        this.players.forEach(player => {
            const resultItem = document.createElement('div');
            resultItem.className = 'result-item';
            resultItem.innerHTML = `
                <span class="result-player">${player}</span>
                <span class="result-character">${this.characters.get(player)}</span>
            `;
            this.resultsList.appendChild(resultItem);
        });
    }

    playAgain() {
        this.players = [];
        this.characters.clear();
        this.currentGuesserIndex = 0;
        this.gameState = 'setup';
        this.currentQuestion = null;
        this.votes.clear();
        this.guessedPlayers.clear();
        
        this.showScreen('setup');
        // Снова добавляем текущего пользователя
        this.initializeWithCurrentUser();
    }


    showScreen(screenName) {
        Object.values(this.screens).forEach(screen => {
            screen.classList.remove('active');
        });
        this.screens[screenName].classList.add('active');
    }
}

// Инициализация игры
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new KeldurbenStickersGame();
});
