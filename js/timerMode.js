import { state, correctSound, wrongSound, gunSound, shotSound, explosionSound } from "./state.js";
import { dom, showCustomAlert, updateScoreDisplay, showCongrats } from "./ui.js";
 
import { getTranslation } from "./i18n/i18n.js";
import * as utils from "./utils.js";

 
const SPAWN_INTERVAL_MS = 2000;  
const PLANE_X = 100;  
const GAME_WIDTH = window.innerWidth;
const GAME_HEIGHT = window.innerHeight;
const WORD_SPEED_BASE = 1.5;
const PROJECTILE_SPEED = 15;

 
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

   
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

   
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

   
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,  
          Math.min(
            matrix[i][j - 1] + 1,  
            matrix[i - 1][j] + 1  
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

class ExplosionParticle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.element = document.createElement("div");
    this.element.classList.add("explosion-particle");
    this.element.style.backgroundColor = color;
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
    
     
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 5 + 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    
    this.life = 1.0;
    this.decay = Math.random() * 0.05 + 0.02;

    document.getElementById("timer-mode-container").appendChild(this.element);
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life -= this.decay;
    
    this.element.style.left = `${this.x}px`;
    this.element.style.top = `${this.y}px`;
    this.element.style.opacity = this.life;
    
    if (this.life <= 0) {
      this.destroy();
      return false;  
    }
    return true;  
  }

  destroy() {
    this.element.remove();
  }
}

class WindParticle {
  constructor() {
    this.x = GAME_WIDTH + Math.random() * 100;
    this.y = Math.random() * GAME_HEIGHT;
    this.speed = 15 + Math.random() * 10;
    this.length = 20 + Math.random() * 30;
    this.element = document.createElement("div");
    this.element.classList.add("wind-particle");
    this.element.style.width = `${this.length}px`;
    this.element.style.left = `${this.x}px`;
    this.element.style.top = `${this.y}px`;
    document.getElementById("timer-mode-container").appendChild(this.element);
  }

  update() {
    this.x -= this.speed;
    this.element.style.left = `${this.x}px`;
    
    if (this.x < -this.length) {
      this.destroy();
      return false;
    }
    return true;
  }

  destroy() {
    this.element.remove();
  }
}

class TrailParticle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.element = document.createElement("div");
    this.element.classList.add("trail-particle");
    this.element.style.left = `${this.x}px`;
    this.element.style.top = `${this.y}px`;
    document.getElementById("timer-mode-container").appendChild(this.element);
    this.opacity = 0.8;
  }

  update() {
    this.x -= 5;  
    this.opacity -= 0.05;
    this.element.style.left = `${this.x}px`;
    this.element.style.opacity = this.opacity;
    
    if (this.opacity <= 0) {
      this.destroy();
      return false;
    }
    return true;
  }

  destroy() {
    this.element.remove();
  }
}

class Plane {
  constructor(element) {
    this.element = element;
    this.y = GAME_HEIGHT / 2;
    this.targetY = this.y;
    this.width = 60;
    this.height = 40;
    this.x = PLANE_X;
    this.element.style.left = `${PLANE_X}px`;
    this.currentTilt = 0;
    this.updatePosition();
  }

  setTargetY(y) {
    this.targetY = y;
  }

  update() {
     
    const dy = this.targetY - this.y;
    this.y += dy * 0.1;  
    
     
     
    const distance = Math.abs(dy);
    let targetTilt = 0;
    
    if (distance > 5) {  
        targetTilt = Math.sign(dy) * 20;  
    }
    
     
    this.currentTilt += (targetTilt - this.currentTilt) * 0.1;

    this.element.style.transform = `translateY(-50%) rotate(${this.currentTilt}deg)`;
    
    this.element.style.top = `${this.y}px`;

     
    if (Math.random() < 0.5) {
        timerMode.trailParticles.push(new TrailParticle(this.x, this.y));
    }
  }

  updatePosition() {
    this.element.style.top = `${this.y}px`;
    this.element.style.transform = `translate(-50%, -50%)`;
  }
}

class FlyingWord {
  constructor(syllable, id) {
    this.syllable = syllable;
    this.id = id;
    this.x = GAME_WIDTH + 100;  
     
    const safeTop = 120;
    const safeBottom = 120;
    const safeHeight = GAME_HEIGHT - safeTop - safeBottom;
    this.y = Math.random() * safeHeight + safeTop; 
    
    this.speed = WORD_SPEED_BASE;  
    this.element = document.createElement("div");
    this.element.classList.add("flying-word");
    this.element.textContent = syllable.question;
    this.baseColor = utils.generateColor(syllable.question);
    this.element.style.color = this.baseColor;
    this.element.style.position = "absolute";
    this.element.style.whiteSpace = "nowrap";
    this.element.style.whiteSpace = "nowrap";
    this.isSolved = false;
    this.isDead = false;
    this.hitsReceived = 0;
    this.updatePosition();
    document.getElementById("timer-mode-container").appendChild(this.element);
  }

  update() {
    this.x -= this.speed;
    this.updatePosition();
    
    if (this.x < 0 && !this.isDead && !this.isSolved) {
        if (state.wrongSoundEnabled) {
            explosionSound.currentTime = 0;
            explosionSound.play().catch(() => {});
            
            wrongSound.volume = 0.4;
            wrongSound.currentTime = 0;
            setTimeout(() => {
                wrongSound.play().then(() => {
                    setTimeout(() => { wrongSound.volume = 1.0; }, 1000);
                }).catch(() => {});
            }, 300);
        }
        this.explode(false); 
         
        setTimeout(() => {
            timerMode.gameOver();
        }, 500);
        return true;
    }

    return this.x < -100 || this.isDead;  
  }

  updatePosition() {
    const bounce = Math.sin(Date.now() / 500 + this.id) * 5;
    this.element.style.left = `${this.x}px`;
    this.element.style.top = `${this.y + bounce}px`;
  }

  destroy() {
    this.element.remove();
  }
  
  explode(isSuccess = false) {
      if (isSuccess) {
          timerMode.score++;
          state.score = timerMode.score;
          updateScoreDisplay();
          if (state.correctSoundEnabled) {
              explosionSound.currentTime = 0;
              explosionSound.play().catch(() => {});

              correctSound.volume = 0.4;
              correctSound.currentTime = 0;
              setTimeout(() => {
                  correctSound.play().then(() => {
                      setTimeout(() => { correctSound.volume = 1.0; }, 1000);
                  }).catch(() => {});
              }, 300);
          }
      }

       
      const rect = this.element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const color = this.element.style.color;

      for (let i = 0; i < 20; i++) {
          const p = new ExplosionParticle(centerX, centerY, color);
          timerMode.particles.push(p);
      }

      this.destroy();
      this.isDead = true;
  }
}

class Projectile {
  constructor(startX, startY, targetWord, char) {
    this.x = startX;
    this.y = startY;
    this.targetWord = targetWord;
    this.element = document.createElement("div");
    this.element.classList.add("projectile");
    this.element.textContent = char;
    this.element.style.position = "absolute";
    this.element.style.left = `${this.x}px`;
    this.element.style.top = `${this.y}px`;
    document.getElementById("timer-mode-container").appendChild(this.element);
  }

  update() {
    if (!this.targetWord || !this.targetWord.element.isConnected) {
        this.destroy();
        return true;  
    }

    const dx = this.targetWord.x - this.x;
    const dy = this.targetWord.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < PROJECTILE_SPEED) {
         
        this.destroy();
        this.targetWord.hitsReceived++;
        
         
        const particle = new ExplosionParticle(this.x, this.y, this.targetWord.element.style.color);
        timerMode.particles.push(particle);
        
         
        const flashColor = state.darkModeEnabled ? "#ffffff" : "#000000";
        this.targetWord.element.style.color = flashColor;
        setTimeout(() => {
            if (this.targetWord && this.targetWord.element.isConnected) {
                 this.targetWord.element.style.color = this.targetWord.baseColor;
            }
        }, 60);

        if (state.correctSoundEnabled) {
            shotSound.currentTime = 0;
            shotSound.play().catch(() => {});
        }
        
        if (this.targetWord.isSolved && this.targetWord.hitsReceived >= this.targetWord.syllable.answer.length) {
            this.targetWord.explode(true);
        }
        return true;
    }

    const vx = (dx / dist) * PROJECTILE_SPEED;
    const vy = (dy / dist) * PROJECTILE_SPEED;

    this.x += vx;
    this.y += vy;
    
    this.element.style.left = `${this.x}px`;
    this.element.style.top = `${this.y}px`;
    return false;
  }

  destroy() {
    this.element.remove();
  }
}

export class TimerMode {
  constructor() {
    this.isActive = false;
    this.words = [];
    this.projectiles = [];
    this.particles = [];
    this.plane = null;
    this.lastSpawnTime = 0;
    this.animationFrameId = null;
    this.userInput = "";
    this.score = 0;
    this.container = null;
    this.lastSpawnedWord = null;
    this.lastRandomMoveTime = 0;
    this.wordIndex = 0;
    this.wordIndex = 0;
    this.windParticles = [];
    this.isPaused = false;
  }

  pause() {
    this.isPaused = true;
    cancelAnimationFrame(this.animationFrameId);
  }

  resume() {
    if (!this.isActive || !this.isPaused) return;
    this.isPaused = false;
    this.lastSpawnTime = Date.now();  
    this.lastRandomMoveTime = Date.now();
    this.loop();
  }

  loadGroup(index) {
      const start = index * 5;  
       
      if (start >= state.syllableList.length) {
          return false;  
      }
      state.currentGroup = state.syllableList.slice(start, start + 5);
      return state.currentGroup.length > 0;
  }

  start(restartCallback) {
    if (this.isActive) return;
    if (restartCallback) this.restartCallback = restartCallback;
    this.isActive = true;
    this.userInput = "";
    this.score = 0;
    state.score = 0;  
    updateScoreDisplay();
    this.words = [];
    this.projectiles = [];
    this.windParticles = [];
    this.trailParticles = [];
    
     
    state.currentGroupIndex = 0;
    if (!this.loadGroup(state.currentGroupIndex)) {
         
        this.gameOver();
        return;
    }

     
    this.container = document.getElementById("timer-mode-container");
    this.container.innerHTML = "";  
    this.container.style.display = "block";
    document.getElementById("game-area").style.display = "none";  

     
    const planeEl = document.createElement("div");
    planeEl.id = "plane";
    this.container.appendChild(planeEl);
    this.plane = new Plane(planeEl);

     
    this.inputDisplay = document.createElement("div");
    this.inputDisplay.id = "timer-mode-input";
    this.container.appendChild(this.inputDisplay);

     
    this.lastSpawnTime = Date.now();
    this.loop();
    
     
    document.addEventListener("keydown", this.handleInput);
    document.addEventListener("keypress", this.handleKeyPress);
  }

  stop() {
    this.isActive = false;
    this.score = 0;
    state.score = 0;
    updateScoreDisplay();
    cancelAnimationFrame(this.animationFrameId);
    
    if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
    }

    if (this.container) {
        this.container.style.display = "none";
        this.container.innerHTML = "";
    }
    
    const gameArea = document.getElementById("game-area");
    if (gameArea) gameArea.style.display = "flex";  
    
    document.removeEventListener("keydown", this.handleInput);
    document.removeEventListener("keypress", this.handleKeyPress);

    // Clear all active elements
    this.words = [];
    this.projectiles = [];
    this.windParticles = [];
    this.trailParticles = [];
  }

  gameOver() {
      if (!this.isActive) return;
      this.stop();
      showCustomAlert(getTranslation("WRONG_ANSWER_RESTART"), () => {
          if (this.restartCallback) {
              this.restartCallback();
          }
      });
  }

  handleInput = (e) => {
    if (!this.isActive) return;

    if (e.key === "Backspace") {
      this.userInput = this.userInput.slice(0, -1);
      this.inputDisplay.textContent = this.userInput;
      this.checkMatches();
    } else if (e.key === "Enter") {
      this.userInput = "";
      this.inputDisplay.textContent = this.userInput;
    }
  };

  handleKeyPress = (e) => {
    if (!this.isActive) return;
    if (e.key === "Enter") return;  

    const char = e.key.toLowerCase();
    this.userInput += char;
    this.inputDisplay.textContent = this.userInput;
    this.fireProjectile(char);
    this.checkMatches();
  };

  fireProjectile(char) {
       
      const target = this.findBestMatch();
      if (target) {
          const p = new Projectile(this.plane.x + 20, this.plane.y, target, char);
          this.projectiles.push(p);
          if (state.correctSoundEnabled) {
              gunSound.volume = 0.1;
              gunSound.currentTime = 0;
              gunSound.play().catch(() => {});
          }
      }
  }

  findBestMatch() {
      if (this.words.length === 0) return null;
       
      const activeWords = this.words.filter(w => !w.isSolved);
      if (activeWords.length === 0) return null;

      if (this.userInput.length === 0) return activeWords[0];  

      let bestWord = null;
      let minDist = Infinity;

      for (const word of activeWords) {
          const dist = levenshtein(this.userInput, word.syllable.answer.substring(0, this.userInput.length));
          if (dist < minDist) {
              minDist = dist;
              bestWord = word;
          }
      }
      return bestWord;
  }

  checkMatches() {
      const cleanedInput = this.userInput.trim();
      const match = this.words.find(w => !w.isSolved && (w.syllable.answer === this.userInput || w.syllable.answer === cleanedInput));
      if (match) {
           
          match.isSolved = true;
          this.userInput = "";
          this.inputDisplay.textContent = "";
          
           
          const idx = state.currentGroup.findIndex(s => s.question === match.syllable.question);
          if (idx > -1) {
              state.currentGroup.splice(idx, 1);
          }
      }
  }

  loop = () => {
    if (!this.isActive) return;

     
    if (this.isAnyModalOpen()) {
        if (!this.isPaused) {
            this.isPaused = true;
            this.pauseStartTime = Date.now();
        }
        this.animationFrameId = requestAnimationFrame(this.loop);
        return;
    }

    if (this.isPaused) {
        this.isPaused = false;
        const pauseDuration = Date.now() - this.pauseStartTime;
        this.lastSpawnTime += pauseDuration;
        this.lastRandomMoveTime += pauseDuration;
    }

    const now = Date.now();

     
     
    let val = Number(state.gameSpeed);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 10) val = 10;
    
     
    const speedMultiplier = 1 + (val - 1) * 0.11;
    
     
    let currentInterval = SPAWN_INTERVAL_MS / (speedMultiplier * 1.0); 
    if (currentInterval < 300) currentInterval = 300;

    if (now - this.lastSpawnTime > currentInterval) {
      this.spawnWord();
      this.lastSpawnTime = now;
    }

     
    if (Math.random() < 0.3) {  
        this.windParticles.push(new WindParticle());
    }
    this.windParticles = this.windParticles.filter(p => p.update());

     
    this.trailParticles = this.trailParticles.filter(p => p.update());

     
    if (this.userInput.length > 0) {
        const targetWord = this.findBestMatch();
        if (targetWord) {
            this.plane.setTargetY(targetWord.y);
        }
    } else {
         
        if (now - this.lastRandomMoveTime > 1000) {  
             
            const range = 200;  
            let randomY = this.plane.y + (Math.random() - 0.5) * (range * 2);
            
             
            const safeTop = 120;
            const safeBottom = 120;
            randomY = Math.max(safeTop, Math.min(GAME_HEIGHT - safeBottom, randomY));
            
            this.plane.setTargetY(randomY);
            this.lastRandomMoveTime = now;
        }
    }

     
    this.plane.update();

    this.words = this.words.filter(word => {
        const offScreen = word.update();
        if (offScreen) {
            word.destroy();
            return false;
        }
        return true;
    });

    this.projectiles = this.projectiles.filter(p => {
        const hit = p.update();
        return !hit;
    });

    this.particles = this.particles.filter(p => p.update());

    // Check for group completion after all words have exploded and projectiles hit
    if (this.isActive && state.currentGroup.length === 0 && this.words.length === 0 && this.projectiles.length === 0) {
        state.currentGroupIndex++;
        if (!this.loadGroup(state.currentGroupIndex)) {
            this.stop();
            // Reset score and group index for next game
            state.score = 0;
            state.currentGroupIndex = 0;
            updateScoreDisplay();
            showCongrats(false, this.restartCallback);
        } else {
            updateScoreDisplay();
        }
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  spawnWord() {
    if (!state.currentGroup || state.currentGroup.length === 0) return;

     
     
    const availableSyllables = state.currentGroup.filter(s => 
        !this.words.some(w => w.syllable.question === s.question)
    );
    
    if (availableSyllables.length === 0) return;  

    const randomIndex = Math.floor(Math.random() * availableSyllables.length);
    const syllable = availableSyllables[randomIndex];
    
     
    let val = Number(state.gameSpeed);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 10) val = 10;
    const safeGameSpeed = val;
    
    const speedMultiplier = 1 + (safeGameSpeed - 1) * 0.11;
    let speed = WORD_SPEED_BASE * speedMultiplier;

    this.lastSpawnedWord = syllable;
    
    const word = new FlyingWord(syllable, Date.now());
    word.speed = speed;  
    this.words.push(word);
  }

  isAnyModalOpen() {
       
      const modals = [
          dom.deckModal,
          dom.settingsModal,
          dom.statsModal,
          dom.jsonEditorModal,
          dom.mergeModal,
          dom.customAlertModal,
          dom.customConfirmModal,
          dom.congratsModal,
          dom.editCardModal,
          dom.generalSettingsModal
      ];
      
      return modals.some(modal => modal && modal.style.display === "flex");
  }
}

export const timerMode = new TimerMode();
