/**
 * CỜ CARO & XO - ĐA NỀN TẢNG (WEB + PWA + WEBRTC MULTIPLAYER)
 * Tính năng:
 * - Chơi cùng máy (Pass & Play) hoặc Đấu Online qua WebRTC P2P (PeerJS)
 * - Tự động đồng bộ nước đi, thời gian, biểu cảm emote
 * - Hỗ trợ tham gia nhanh bằng liên kết (?room=XXXXXX)
 * - Hoàn toàn không cần máy chủ trung gian cho trận đấu
 * - PWA Offline Caching
 */

// --- Audio Synthesizer (Web Audio API) ---
class SoundController {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playMoveSound(player) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    const freq = player === 'X' ? 520 : 392;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 0.12);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  playTickSound() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  playWinFanfare() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime + index * 0.12;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    });
  }

  playTimeoutSound() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const notes = [440, 370, 311, 261];
    notes.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime + index * 0.1;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.2);
    });
  }
}

// --- Main Game Engine ---
class CaroGame {
  constructor() {
    this.sound = new SoundController();

    // Game Config
    this.mode = 'caro15';
    this.boardSize = 15;
    this.winLength = 5;
    this.turnLimitSeconds = 30;
    this.ruleCaro = 'standard';
    this.timeoutAction = 'lose';
    this.extraSeconds = 10;
    this.extraTimeUsed = { X: false, O: false };

    // Game State
    this.board = [];
    this.currentPlayer = 'X';
    this.isGameOver = false;
    this.isPaused = false;
    this.moveHistory = [];
    this.winningCells = [];

    // Stats & Timers
    this.scores = { X: 0, O: 0 };
    this.totalTimes = { X: 0, O: 0 };
    this.turnTimeRemaining = this.turnLimitSeconds;
    this.lastSecondTicked = -1;
    this.timerInterval = null;

    // DOM Elements
    this.dom = {
      board: document.getElementById('board'),
      boardContainer: document.getElementById('boardContainer'),
      playerCardX: document.getElementById('playerCardX'),
      playerCardO: document.getElementById('playerCardO'),
      namePlayerX: document.getElementById('namePlayerX'),
      namePlayerO: document.getElementById('namePlayerO'),
      turnTimerX: document.getElementById('turnTimerX'),
      turnTimerO: document.getElementById('turnTimerO'),
      totalTimeX: document.getElementById('totalTimeX'),
      totalTimeO: document.getElementById('totalTimeO'),
      scoreX: document.getElementById('scoreX'),
      scoreO: document.getElementById('scoreO'),
      turnIndicator: document.getElementById('turnIndicator'),
      currentTurnName: document.getElementById('currentTurnName'),
      timerFill: document.getElementById('timerFill'),
      moveCount: document.getElementById('moveCount'),
      turnLimitSelect: document.getElementById('turnLimitSelect'),
      soundToggleBtn: document.getElementById('soundToggleBtn'),
      soundIcon: document.getElementById('soundIcon'),
      rulesBtn: document.getElementById('rulesBtn'),
      undoBtn: document.getElementById('undoBtn'),
      pauseBtn: document.getElementById('pauseBtn'),
      pauseIcon: document.getElementById('pauseIcon'),
      restartBtn: document.getElementById('restartBtn'),
      // Network & Online DOM
      tabLocal: document.getElementById('tabLocal'),
      tabOnline: document.getElementById('tabOnline'),
      onlinePanel: document.getElementById('onlinePanel'),
      onlineSetup: document.getElementById('onlineSetup'),
      onlineWaiting: document.getElementById('onlineWaiting'),
      onlineActiveBar: document.getElementById('onlineActiveBar'),
      onlineEmoteBar: document.getElementById('onlineEmoteBar'),
      btnCreateRoom: document.getElementById('btnCreateRoom'),
      btnJoinRoom: document.getElementById('btnJoinRoom'),
      joinRoomInput: document.getElementById('joinRoomInput'),
      displayRoomCode: document.getElementById('displayRoomCode'),
      btnCopyInviteLink: document.getElementById('btnCopyInviteLink'),
      btnCancelRoom: document.getElementById('btnCancelRoom'),
      btnLeaveRoom: document.getElementById('btnLeaveRoom'),
      activeRoomCode: document.getElementById('activeRoomCode'),
      myRoleTag: document.getElementById('myRoleTag'),
      emoteLayer: document.getElementById('emoteLayer'),
      toastNotification: document.getElementById('toastNotification'),
      // Modals
      settingsModal: document.getElementById('settingsModal'),
      closeSettingsBtn: document.getElementById('closeSettingsBtn'),
      applySettingsBtn: document.getElementById('applySettingsBtn'),
      soundSettingCheckbox: document.getElementById('soundSettingCheckbox'),
      gameOverModal: document.getElementById('gameOverModal'),
      winnerTrophy: document.getElementById('winnerTrophy'),
      winnerTitle: document.getElementById('winnerTitle'),
      winnerDesc: document.getElementById('winnerDesc'),
      summaryMoves: document.getElementById('summaryMoves'),
      summaryTimeX: document.getElementById('summaryTimeX'),
      summaryTimeO: document.getElementById('summaryTimeO'),
      reviewBoardBtn: document.getElementById('reviewBoardBtn'),
      playAgainBtn: document.getElementById('playAgainBtn'),
      modeChips: document.querySelectorAll('.chip-group .chip'),
      emoteBtns: document.querySelectorAll('.emote-btn')
    };

    // Network State
    this.network = {
      isOnline: false,
      isConnected: false,
      isHost: false,
      mySymbol: null, // 'X' or 'O'
      peer: null,
      conn: null,
      roomCode: null
    };

    this.bindEvents();
    this.initGame();
    this.checkUrlParams();
  }

  // --- Bind Event Listeners ---
  bindEvents() {
    // Mode Switcher
    this.dom.modeChips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        if (this.network.isConnected && !this.network.isHost) {
          this.showToast('Chỉ chủ phòng mới có thể đổi chế độ bàn cờ!');
          return;
        }
        const mode = e.target.dataset.mode;
        if (mode === this.mode) return;
        this.dom.modeChips.forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        this.setMode(mode);

        if (this.network.isConnected && this.network.isHost) {
          this.sendNetworkMessage({
            type: 'CONFIG_SYNC',
            mode: this.mode,
            turnLimit: this.turnLimitSeconds,
            ruleCaro: this.ruleCaro
          });
        }
      });
    });

    // Timer Selector
    this.dom.turnLimitSelect.addEventListener('change', (e) => {
      if (this.network.isConnected && !this.network.isHost) {
        this.showToast('Chỉ chủ phòng mới có thể đổi thời gian!');
        this.dom.turnLimitSelect.value = this.turnLimitSeconds;
        return;
      }
      this.turnLimitSeconds = parseInt(e.target.value, 10);
      this.resetTurnTimer();

      if (this.network.isConnected && this.network.isHost) {
        this.sendNetworkMessage({
          type: 'CONFIG_SYNC',
          mode: this.mode,
          turnLimit: this.turnLimitSeconds,
          ruleCaro: this.ruleCaro
        });
      }
    });

    // Sound Toggle
    this.dom.soundToggleBtn.addEventListener('click', () => {
      this.sound.enabled = !this.sound.enabled;
      this.dom.soundIcon.textContent = this.sound.enabled ? '🔊' : '🔇';
      this.dom.soundSettingCheckbox.checked = this.sound.enabled;
    });

    // Controls
    this.dom.restartBtn.addEventListener('click', () => {
      if (this.network.isConnected) {
        this.sendNetworkMessage({ type: 'RESTART' });
      }
      this.initGame();
    });

    this.dom.undoBtn.addEventListener('click', () => {
      if (this.network.isConnected) {
        this.showToast('Không hỗ trợ đi lại trong trận đấu Online!');
        return;
      }
      this.undoMove();
    });

    this.dom.pauseBtn.addEventListener('click', () => {
      if (this.network.isConnected) {
        this.showToast('Không thể tạm dừng trong trận đấu Online!');
        return;
      }
      this.togglePause();
    });

    // Settings Modal & Extra time slider
    const extraTimeConfig = document.getElementById('extraTimeConfig');
    const extraTimeRange = document.getElementById('extraTimeRange');
    const extraSecondsVal = document.getElementById('extraSecondsVal');

    document.querySelectorAll('input[name="timeoutAction"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (extraTimeConfig) {
          extraTimeConfig.style.display = e.target.value === 'extra' ? 'block' : 'none';
        }
      });
    });

    if (extraTimeRange && extraSecondsVal) {
      extraTimeRange.addEventListener('input', (e) => {
        extraSecondsVal.textContent = `${e.target.value}s`;
      });
    }

    this.dom.rulesBtn.addEventListener('click', () => {
      // Sync UI with current settings
      const currentRadio = document.querySelector(`input[name="timeoutAction"][value="${this.timeoutAction}"]`);
      if (currentRadio) currentRadio.checked = true;
      if (extraTimeConfig) {
        extraTimeConfig.style.display = this.timeoutAction === 'extra' ? 'block' : 'none';
      }
      if (extraTimeRange && extraSecondsVal) {
        extraTimeRange.value = this.extraSeconds;
        extraSecondsVal.textContent = `${this.extraSeconds}s`;
      }
      this.dom.settingsModal.classList.add('open');
    });

    this.dom.closeSettingsBtn.addEventListener('click', () => {
      this.dom.settingsModal.classList.remove('open');
    });

    this.dom.applySettingsBtn.addEventListener('click', () => {
      const selectedRule = document.querySelector('input[name="ruleCaro"]:checked').value;
      const selectedTimeout = document.querySelector('input[name="timeoutAction"]:checked').value;
      this.ruleCaro = selectedRule;
      this.timeoutAction = selectedTimeout;
      if (extraTimeRange) {
        this.extraSeconds = parseInt(extraTimeRange.value, 10) || 10;
      }
      this.sound.enabled = this.dom.soundSettingCheckbox.checked;
      this.dom.soundIcon.textContent = this.sound.enabled ? '🔊' : '🔇';
      this.dom.settingsModal.classList.remove('open');
    });

    // Game Over Modal
    this.dom.reviewBoardBtn.addEventListener('click', () => {
      this.dom.gameOverModal.classList.remove('open');
    });
    this.dom.playAgainBtn.addEventListener('click', () => {
      this.dom.gameOverModal.classList.remove('open');
      if (this.network.isConnected) {
        this.sendNetworkMessage({ type: 'RESTART' });
      }
      this.initGame();
    });

    // Network Tabs
    this.dom.tabLocal.addEventListener('click', () => this.switchNetworkMode('local'));
    this.dom.tabOnline.addEventListener('click', () => this.switchNetworkMode('online'));

    // Online Lobby Buttons
    this.dom.btnCreateRoom.addEventListener('click', () => this.createOnlineRoom());
    this.dom.btnJoinRoom.addEventListener('click', () => {
      const code = this.dom.joinRoomInput.value.trim();
      if (!code || code.length < 3) {
        this.showToast('Vui lòng nhập mã phòng (3 chữ số)!');
        return;
      }
      this.joinOnlineRoom(code);
    });

    this.dom.btnCopyInviteLink.addEventListener('click', () => {
      const link = `${window.location.origin}${window.location.pathname}?room=${this.network.roomCode}`;
      navigator.clipboard.writeText(link).then(() => {
        this.showToast('📋 Đã sao chép liên kết mời bạn bè!');
      }).catch(() => {
        prompt('Sao chép liên kết dưới đây gửi cho bạn:', link);
      });
    });

    this.dom.btnCancelRoom.addEventListener('click', () => this.leaveOnlineRoom());
    this.dom.btnLeaveRoom.addEventListener('click', () => this.leaveOnlineRoom());

    window.addEventListener('resize', () => {
      clearTimeout(this._resizeTimeout);
      this._resizeTimeout = setTimeout(() => this.adjustBoardScale(), 100);
    });

    // Emotes
    this.dom.emoteBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        this.triggerEmote(emoji, true);
        if (this.network.isConnected) {
          this.sendNetworkMessage({ type: 'EMOTE', emoji });
        }
      });
    });
  }

  // --- Network Multiplayer (WebRTC / PeerJS) ---
  switchNetworkMode(mode) {
    if (mode === 'local') {
      this.leaveOnlineRoom();
      this.network.isOnline = false;
      this.dom.tabLocal.classList.add('active');
      this.dom.tabOnline.classList.remove('active');
      this.dom.onlinePanel.style.display = 'none';
      this.dom.onlineEmoteBar.style.display = 'none';
      this.dom.namePlayerX.textContent = 'Người chơi 1';
      this.dom.namePlayerO.textContent = 'Người chơi 2';
      this.dom.board.classList.remove('opponent-turn');
      this.initGame();
    } else {
      this.network.isOnline = true;
      this.dom.tabOnline.classList.add('active');
      this.dom.tabLocal.classList.remove('active');
      this.dom.onlinePanel.style.display = 'block';
    }
  }

  createOnlineRoom() {
    if (typeof Peer === 'undefined') {
      this.showToast('Đang tải thư viện kết nối, vui lòng thử lại sau 2 giây...');
      return;
    }

    const roomCode = Math.floor(100 + Math.random() * 900).toString();
    const peerId = `caroxovn_${roomCode}`;

    this.showToast('Đang tạo phòng đấu...');
    this.network.peer = new Peer(peerId, { debug: 1 });

    this.network.peer.on('open', () => {
      this.network.roomCode = roomCode;
      this.network.isHost = true;
      this.network.mySymbol = 'X';

      this.dom.onlineSetup.style.display = 'none';
      this.dom.onlineWaiting.style.display = 'flex';
      this.dom.displayRoomCode.textContent = roomCode;
      this.showToast(`Đã tạo phòng #${roomCode}! Đang chờ đối thủ...`);
    });

    this.network.peer.on('connection', (conn) => {
      this.network.conn = conn;
      this.setupConnectionHandlers();
    });

    this.network.peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'unavailable-id') {
        this.createOnlineRoom(); // Retry with another code
      } else {
        this.showToast('Lỗi kết nối phòng: ' + err.type);
        this.leaveOnlineRoom();
      }
    });
  }

  joinOnlineRoom(code) {
    if (typeof Peer === 'undefined') {
      this.showToast('Đang tải thư viện kết nối, vui lòng thử lại...');
      return;
    }

    const cleanCode = code.trim();
    const hostPeerId = `caroxovn_${cleanCode}`;
    this.showToast(`Đang kết nối vào phòng #${cleanCode}...`);

    this.network.peer = new Peer(null, { debug: 1 });

    this.network.peer.on('open', () => {
      const conn = this.network.peer.connect(hostPeerId, { reliable: true });
      this.network.conn = conn;
      this.network.roomCode = cleanCode;
      this.network.isHost = false;
      this.network.mySymbol = 'O';

      this.setupConnectionHandlers();
    });

    this.network.peer.on('error', (err) => {
      console.error('Join error:', err);
      this.showToast('Không tìm thấy phòng hoặc phòng đã đầy!');
      this.leaveOnlineRoom();
    });
  }

  setupConnectionHandlers() {
    const conn = this.network.conn;

    conn.on('open', () => {
      this.network.isConnected = true;
      this.dom.onlineSetup.style.display = 'none';
      this.dom.onlineWaiting.style.display = 'none';
      this.dom.onlineActiveBar.style.display = 'flex';
      this.dom.onlineEmoteBar.style.display = 'flex';

      this.dom.activeRoomCode.textContent = `#${this.network.roomCode}`;
      if (this.network.isHost) {
        this.dom.myRoleTag.textContent = 'Bạn: X (Đi trước)';
        this.dom.myRoleTag.className = 'role-tag';
        this.dom.namePlayerX.textContent = 'Bạn (X)';
        this.dom.namePlayerO.textContent = 'Đối thủ (O)';

        // Send Initial Game Config to Guest
        this.sendNetworkMessage({
          type: 'INIT_SYNC',
          mode: this.mode,
          turnLimit: this.turnLimitSeconds,
          ruleCaro: this.ruleCaro
        });
      } else {
        this.dom.myRoleTag.textContent = 'Bạn: O (Đi sau)';
        this.dom.myRoleTag.className = 'role-tag o-role';
        this.dom.namePlayerX.textContent = 'Đối thủ (X)';
        this.dom.namePlayerO.textContent = 'Bạn (O)';
      }

      this.showToast('🟢 Đối thủ đã kết nối! Trận đấu bắt đầu.');
      this.initGame();
    });

    conn.on('data', (data) => {
      this.handleNetworkMessage(data);
    });

    conn.on('close', () => {
      this.showToast('🔴 Đối thủ đã ngắt kết nối!');
      this.leaveOnlineRoom();
    });
  }

  sendNetworkMessage(payload) {
    if (this.network.conn && this.network.conn.open) {
      this.network.conn.send(payload);
    }
  }

  handleNetworkMessage(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'INIT_SYNC':
      case 'CONFIG_SYNC':
        this.setMode(data.mode);
        this.turnLimitSeconds = data.turnLimit;
        this.dom.turnLimitSelect.value = data.turnLimit;
        this.ruleCaro = data.ruleCaro;
        this.dom.modeChips.forEach(c => {
          c.classList.toggle('active', c.dataset.mode === data.mode);
        });
        this.initGame();
        break;

      case 'MOVE':
        this.executeMove(data.r, data.c, data.player);
        break;

      case 'EMOTE':
        this.triggerEmote(data.emoji, false);
        break;

      case 'RESTART':
        this.showToast('Đối thủ đã bắt đầu ván mới!');
        this.dom.gameOverModal.classList.remove('open');
        this.initGame();
        break;
    }
  }

  leaveOnlineRoom() {
    if (this.network.conn) {
      try { this.network.conn.close(); } catch (e) {}
      this.network.conn = null;
    }
    if (this.network.peer) {
      try { this.network.peer.destroy(); } catch (e) {}
      this.network.peer = null;
    }

    this.network.isConnected = false;
    this.network.isHost = false;
    this.network.mySymbol = null;
    this.network.roomCode = null;

    this.dom.onlineSetup.style.display = 'flex';
    this.dom.onlineWaiting.style.display = 'none';
    this.dom.onlineActiveBar.style.display = 'none';
    this.dom.onlineEmoteBar.style.display = 'none';
    this.dom.joinRoomInput.value = '';

    if (this.network.isOnline) {
      this.showToast('Đã rời khỏi phòng.');
    }
  }

  triggerEmote(emoji, isLocal = false) {
    const el = document.createElement('div');
    el.className = 'floating-emote';
    el.textContent = emoji;
    el.style.left = `${Math.floor(20 + Math.random() * 60)}%`;
    el.style.bottom = isLocal ? '20px' : '40%';
    this.dom.emoteLayer.appendChild(el);

    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 2000);
  }

  showToast(msg) {
    this.dom.toastNotification.textContent = msg;
    this.dom.toastNotification.classList.add('show');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      this.dom.toastNotification.classList.remove('show');
    }, 2500);
  }

  checkUrlParams() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const roomParam = urlParams.get('room');
      if (roomParam) {
        this.switchNetworkMode('online');
        this.dom.joinRoomInput.value = roomParam;
        setTimeout(() => {
          this.joinOnlineRoom(roomParam);
        }, 600);
      }
    } catch (e) {}
  }

  // --- Switch Mode ---
  setMode(mode) {
    this.mode = mode;
    if (mode === 'caro15') {
      this.boardSize = 15;
      this.winLength = 5;
    } else if (mode === 'caro19') {
      this.boardSize = 19;
      this.winLength = 5;
    } else if (mode === 'xo3') {
      this.boardSize = 3;
      this.winLength = 3;
    }
    this.scores = { X: 0, O: 0 };
    this.updateScoreDisplay();
    this.initGame();
  }

  // --- Initialize / Reset Match ---
  initGame() {
    this.stopTimer();
    this.board = Array(this.boardSize).fill(null).map(() => Array(this.boardSize).fill(null));
    this.currentPlayer = 'X';
    this.isGameOver = false;
    this.isPaused = false;
    this.moveHistory = [];
    this.winningCells = [];
    this.totalTimes = { X: 0, O: 0 };
    this.extraTimeUsed = { X: false, O: false };
    this.dom.pauseIcon.textContent = '⏸️';

    this.renderBoard();
    this.updateTurnUI();
    this.updateStatsUI();
    this.resetTurnTimer();
    this.startTimer();
  }

  // --- Render Board DOM ---
  renderBoard() {
    this.dom.board.innerHTML = '';
    this.dom.board.className = `board mode-${this.mode}`;
    this.dom.board.style.gridTemplateColumns = `repeat(${this.boardSize}, 1fr)`;
    this.dom.board.style.gridTemplateRows = `repeat(${this.boardSize}, 1fr)`;

    for (let r = 0; r < this.boardSize; r++) {
      for (let c = 0; c < this.boardSize; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        cell.addEventListener('click', () => this.handleCellClick(r, c));
        this.dom.board.appendChild(cell);
      }
    }

    this.adjustBoardScale();
  }

  // --- Dynamic Board Sizing & Responsive Scaling ---
  adjustBoardScale() {
    if (!this.dom.boardContainer || !this.dom.board) return;
    
    // Reset any previous inline sizing to measure natural fit
    const container = this.dom.boardWrapper || document.querySelector('.board-wrapper');
    if (!container) return;

    const availableWidth = container.clientWidth - 16;
    const availableHeight = container.clientHeight - 16;
    const size = Math.floor(Math.min(availableWidth, availableHeight));

    if (size > 0) {
      if (this.mode === 'xo3') {
        const xoSize = Math.min(size, 420);
        this.dom.board.style.width = `${xoSize}px`;
        this.dom.board.style.height = `${xoSize}px`;
        const cellSize = Math.floor(xoSize / 3);
        document.documentElement.style.setProperty('--dynamic-cell-size', `${cellSize}px`);
        document.documentElement.style.setProperty('--dynamic-font-size', `${Math.floor(cellSize * 0.65)}px`);
      } else {
        // Caro 15x15 or 19x19: Fit screen nicely or scale appropriately
        const cellSize = Math.floor(size / this.boardSize);
        // Minimum comfortable tap size for mobile
        const minCellSize = this.boardSize === 19 ? 25 : 28;
        const targetCellSize = Math.max(cellSize, minCellSize);
        const boardDim = targetCellSize * this.boardSize;

        this.dom.board.style.width = `${boardDim}px`;
        this.dom.board.style.height = `${boardDim}px`;
        document.documentElement.style.setProperty('--dynamic-cell-size', `${targetCellSize}px`);
        document.documentElement.style.setProperty('--dynamic-font-size', `${Math.max(12, Math.floor(targetCellSize * 0.62))}px`);
      }
    }
  }

  // --- Handle Cell Click (Local & Network) ---
  handleCellClick(r, c) {
    if (this.isGameOver || this.isPaused) return;

    // Online verification: Only allow move if it is MY turn
    if (this.network.isConnected) {
      if (this.currentPlayer !== this.network.mySymbol) {
        this.showToast('⏳ Chưa tới lượt của bạn!');
        return;
      }
    }

    if (this.board[r][c] !== null) return;

    // Send Move to Opponent if in Online Mode
    if (this.network.isConnected) {
      this.sendNetworkMessage({
        type: 'MOVE',
        r,
        c,
        player: this.currentPlayer
      });
    }

    this.executeMove(r, c, this.currentPlayer);
  }

  // --- Execute Move Logic ---
  executeMove(r, c, player) {
    if (this.isGameOver || this.board[r][c] !== null) return;

    this.board[r][c] = player;
    this.moveHistory.push({ row: r, col: c, player });

    this.sound.playMoveSound(player);

    const cellElement = this.getCellElement(r, c);
    if (cellElement) {
      cellElement.classList.add('occupied');
      const markSpan = document.createElement('span');
      markSpan.className = player === 'X' ? 'mark-x' : 'mark-o';
      markSpan.textContent = player;
      cellElement.appendChild(markSpan);

      document.querySelectorAll('.cell.last-move').forEach(el => el.classList.remove('last-move'));
      cellElement.classList.add('last-move');
    }

    // Check Win or Draw
    const winResult = this.checkWin(r, c, player);
    if (winResult.won) {
      this.handleGameWin(player, winResult.winningCells, 'line');
      return;
    }

    if (this.checkDraw()) {
      this.handleGameDraw();
      return;
    }

    // Switch Turn
    this.currentPlayer = player === 'X' ? 'O' : 'X';
    this.extraTimeUsed[this.currentPlayer] = false;
    this.updateTurnUI();
    this.resetTurnTimer();
  }

  // --- Check Win Logic ---
  checkWin(r, c, player) {
    const directions = [
      { dr: 0, dc: 1 },  // Horizontal (-)
      { dr: 1, dc: 0 },  // Vertical (|)
      { dr: 1, dc: 1 },  // Diagonal (\)
      { dr: 1, dc: -1 }  // Anti-diagonal (/)
    ];

    const opponent = player === 'X' ? 'O' : 'X';

    for (const { dr, dc } of directions) {
      let cells = [{ r, c }];

      let step = 1;
      while (true) {
        const nr = r + dr * step;
        const nc = c + dc * step;
        if (this.isInBounds(nr, nc) && this.board[nr][nc] === player) {
          cells.push({ r: nr, c: nc });
          step++;
        } else {
          break;
        }
      }

      step = 1;
      while (true) {
        const nr = r - dr * step;
        const nc = c - dc * step;
        if (this.isInBounds(nr, nc) && this.board[nr][nc] === player) {
          cells.unshift({ r: nr, c: nc });
          step++;
        } else {
          break;
        }
      }

      if (cells.length >= this.winLength) {
        if (this.mode === 'xo3' || this.ruleCaro === 'freestyle') {
          return { won: true, winningCells: cells };
        }

        // Standard VN Caro Rule: Check blocked at both ends
        const first = cells[0];
        const last = cells[cells.length - 1];

        const frontR = first.r - dr;
        const frontC = first.c - dc;
        const backR = last.r + dr;
        const backC = last.c + dc;

        const isFrontBlocked = this.isInBounds(frontR, frontC) && this.board[frontR][frontC] === opponent;
        const isBackBlocked = this.isInBounds(backR, backC) && this.board[backR][backC] === opponent;

        if (isFrontBlocked && isBackBlocked) {
          continue;
        }

        return { won: true, winningCells: cells };
      }
    }

    return { won: false, winningCells: [] };
  }

  checkDraw() {
    return this.moveHistory.length === this.boardSize * this.boardSize;
  }

  isInBounds(r, c) {
    return r >= 0 && r < this.boardSize && c >= 0 && c < this.boardSize;
  }

  getCellElement(r, c) {
    return this.dom.board.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
  }

  // --- Win / Draw Handlers ---
  handleGameWin(winner, winningCells = [], reason = 'line') {
    this.isGameOver = true;
    this.stopTimer();
    this.scores[winner]++;
    this.updateScoreDisplay();

    winningCells.forEach(({ r, c }) => {
      const el = this.getCellElement(r, c);
      if (el) el.classList.add('winning-cell');
    });

    this.sound.playWinFanfare();

    this.dom.winnerTrophy.textContent = '🏆';
    if (this.network.isConnected) {
      const isMe = winner === this.network.mySymbol;
      this.dom.winnerTitle.textContent = isMe ? 'Bạn Đã Thắng!' : 'Đối Thủ Đã Thắng!';
    } else {
      this.dom.winnerTitle.textContent = `Người chơi ${winner} Thắng!`;
    }

    if (reason === 'timeout') {
      const loser = winner === 'X' ? 'O' : 'X';
      this.dom.winnerDesc.textContent = `Người chơi ${loser} đã hết thời gian thi đấu.`;
    } else {
      const count = this.mode === 'xo3' ? '3' : '5';
      this.dom.winnerDesc.textContent = `Chiến thắng với đường ${count} quân thẳng hàng!`;
    }

    this.dom.summaryMoves.textContent = this.moveHistory.length;
    this.dom.summaryTimeX.textContent = this.formatTime(Math.round(this.totalTimes.X));
    this.dom.summaryTimeO.textContent = this.formatTime(Math.round(this.totalTimes.O));

    setTimeout(() => {
      this.dom.gameOverModal.classList.add('open');
    }, 600);
  }

  handleGameDraw() {
    this.isGameOver = true;
    this.stopTimer();

    this.dom.winnerTrophy.textContent = '🤝';
    this.dom.winnerTitle.textContent = 'Hòa Cờ!';
    this.dom.winnerDesc.textContent = 'Toàn bộ bàn cờ đã được lấp đầy.';
    this.dom.summaryMoves.textContent = this.moveHistory.length;
    this.dom.summaryTimeX.textContent = this.formatTime(Math.round(this.totalTimes.X));
    this.dom.summaryTimeO.textContent = this.formatTime(Math.round(this.totalTimes.O));

    setTimeout(() => {
      this.dom.gameOverModal.classList.add('open');
    }, 400);
  }

  // --- Timer Engine ---
  startTimer() {
    this.stopTimer();
    const intervalMs = 100;

    this.timerInterval = setInterval(() => {
      if (this.isGameOver || this.isPaused) return;

      const dt = intervalMs / 1000;
      this.totalTimes[this.currentPlayer] += dt;
      this.updateStatsUI();

      if (this.turnLimitSeconds > 0) {
        this.turnTimeRemaining -= dt;
        if (this.turnTimeRemaining < 0) this.turnTimeRemaining = 0;

        const currentSec = Math.ceil(this.turnTimeRemaining);
        if (currentSec <= 5 && currentSec > 0 && currentSec !== this.lastSecondTicked) {
          this.lastSecondTicked = currentSec;
          this.sound.playTickSound();
        }

        this.updateTurnTimerUI();

        if (this.turnTimeRemaining <= 0) {
          this.handleTimeout();
        }
      }
    }, intervalMs);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  resetTurnTimer() {
    this.turnTimeRemaining = this.turnLimitSeconds;
    this.lastSecondTicked = -1;
    this.updateTurnTimerUI();
  }

  handleTimeout() {
    if (this.timeoutAction === 'extra' && !this.extraTimeUsed[this.currentPlayer]) {
      this.extraTimeUsed[this.currentPlayer] = true;
      this.turnTimeRemaining = this.extraSeconds;
      this.lastSecondTicked = -1;
      this.sound.playTickSound();
      this.showToast(`⏱️ Người chơi ${this.currentPlayer} được cộng thêm ${this.extraSeconds}s!`);
      this.updateTurnTimerUI();
      return;
    }

    this.sound.playTimeoutSound();
    if (this.timeoutAction === 'lose' || (this.timeoutAction === 'extra' && this.extraTimeUsed[this.currentPlayer])) {
      const winner = this.currentPlayer === 'X' ? 'O' : 'X';
      this.handleGameWin(winner, [], 'timeout');
    } else {
      this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
      this.extraTimeUsed[this.currentPlayer] = false;
      this.updateTurnUI();
      this.resetTurnTimer();
    }
  }

  togglePause() {
    if (this.isGameOver) return;
    this.isPaused = !this.isPaused;
    this.dom.pauseIcon.textContent = this.isPaused ? '▶️' : '⏸️';
  }

  undoMove() {
    if (this.isGameOver || this.moveHistory.length === 0) return;

    const last = this.moveHistory.pop();
    this.board[last.row][last.col] = null;

    const cell = this.getCellElement(last.row, last.col);
    if (cell) {
      cell.innerHTML = '';
      cell.classList.remove('occupied', 'last-move');
    }

    if (this.moveHistory.length > 0) {
      const prev = this.moveHistory[this.moveHistory.length - 1];
      const prevCell = this.getCellElement(prev.row, prev.col);
      if (prevCell) prevCell.classList.add('last-move');
    }

    this.currentPlayer = last.player;
    this.resetTurnTimer();
    this.updateTurnUI();
    this.updateStatsUI();
  }

  updateTurnUI() {
    const isX = this.currentPlayer === 'X';
    this.dom.playerCardX.classList.toggle('active-turn', isX);
    this.dom.playerCardO.classList.toggle('active-turn', !isX);

    this.dom.currentTurnName.textContent = this.currentPlayer;
    this.dom.currentTurnName.className = isX ? 'x-color' : 'o-color';

    // If online: disable interaction cursor when not my turn
    if (this.network.isConnected) {
      const isMyTurn = this.currentPlayer === this.network.mySymbol;
      this.dom.board.classList.toggle('opponent-turn', !isMyTurn);
    } else {
      this.dom.board.classList.remove('opponent-turn');
    }
  }

  updateTurnTimerUI() {
    const activeTimerEl = this.currentPlayer === 'X' ? this.dom.turnTimerX : this.dom.turnTimerO;
    const inactiveTimerEl = this.currentPlayer === 'X' ? this.dom.turnTimerO : this.dom.turnTimerX;

    if (this.turnLimitSeconds <= 0) {
      activeTimerEl.textContent = '∞';
      inactiveTimerEl.textContent = '∞';
      this.dom.timerFill.style.width = '100%';
      this.dom.timerFill.style.backgroundColor = this.currentPlayer === 'X' ? 'var(--x-color)' : 'var(--o-color)';
      return;
    }

    const sec = Math.ceil(this.turnTimeRemaining);
    activeTimerEl.textContent = `${sec}s`;

    const percent = Math.max(0, (this.turnTimeRemaining / this.turnLimitSeconds) * 100);
    this.dom.timerFill.style.width = `${percent}%`;

    activeTimerEl.classList.remove('warning', 'danger');
    if (this.turnTimeRemaining <= 5) {
      activeTimerEl.classList.add('danger');
      this.dom.timerFill.style.backgroundColor = 'var(--danger)';
    } else if (this.turnTimeRemaining <= 10) {
      activeTimerEl.classList.add('warning');
      this.dom.timerFill.style.backgroundColor = 'var(--warning)';
    } else {
      this.dom.timerFill.style.backgroundColor = this.currentPlayer === 'X' ? 'var(--x-color)' : 'var(--o-color)';
    }
  }

  updateStatsUI() {
    this.dom.totalTimeX.textContent = this.formatTime(Math.round(this.totalTimes.X));
    this.dom.totalTimeO.textContent = this.formatTime(Math.round(this.totalTimes.O));
    this.dom.moveCount.textContent = `Nước đi: ${this.moveHistory.length}`;
  }

  updateScoreDisplay() {
    this.dom.scoreX.textContent = `${this.scores.X} thắng`;
    this.dom.scoreO.textContent = `${this.scores.O} thắng`;
  }

  formatTime(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}

// Bootstrap game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  window.game = new CaroGame();
  initPWA();
});

// --- PWA Service Worker & Install Prompt ---
function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registered:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  }

  let deferredPrompt = null;
  const installBtn = document.getElementById('pwaInstallBtn');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) {
      installBtn.style.display = 'flex';
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('[PWA] Install choice:', outcome);
        deferredPrompt = null;
        installBtn.style.display = 'none';
      });
    }
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed successfully');
    if (installBtn) installBtn.style.display = 'none';
  });
}
