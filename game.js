// ============================================================================
// CONFIGURAÇÃO DO MULTIPLAYER ONLINE (FIREBASE REALTIME DATABASE)
// Para deixar online para qualquer pessoa no GitHub Pages:
// 1. Crie um projeto grátis em https://console.firebase.google.com/
// 2. Ative "Realtime Database" no modo teste
// 3. Cole seu firebaseConfig abaixo:
// ============================================================================
const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

let db = null;
let isOnline = false;

if (firebaseConfig.databaseURL && typeof firebase !== "undefined") {
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    isOnline = true;
    document.getElementById("firebase-status-text").textContent = "Online (Firebase Conectado)";
    document.getElementById("firebase-status-text").className = "status-ok";
  } catch (e) {
    console.warn("Erro ao iniciar Firebase:", e);
  }
}

// ============================================================================
// ESTADO GLOBAL DO JOGADOR
// ============================================================================
const playerId = "player_" + Math.random().toString(36).substring(2, 10);
const playerState = {
  id: playerId,
  name: "Jogador_" + Math.floor(100 + Math.random() * 899),
  colors: {
    head: "#f5cd30",
    torso: "#0d69ac",
    larm: "#f5cd30",
    rarm: "#f5cd30",
    lleg: "#a4bd47",
    rleg: "#a4bd47"
  },
  x: 0,
  y: 0.5,
  z: 0,
  ry: 0,
  anim: "idle",
  emote: ""
};

const settings = {
  sensitivity: 1.0,
  walkSpeed: 16,
  jumpPower: 50
};

// ============================================================================
// LÓGICA DA TELA INICIAL (PORTAL & EDITOR DE AVATAR)
// ============================================================================
const nickInput = document.getElementById("nickname-input");
nickInput.value = playerState.name;

function syncLobbyUI() {
  document.getElementById("topbar-username").textContent = playerState.name;
  document.getElementById("welcome-name").textContent = playerState.name;
  document.getElementById("topbar-avatar-color").style.background = playerState.colors.head;

  document.getElementById("prev-head").style.background = playerState.colors.head;
  document.getElementById("prev-torso").style.background = playerState.colors.torso;
  document.getElementById("prev-larm").style.background = playerState.colors.larm;
  document.getElementById("prev-rarm").style.background = playerState.colors.rarm;
  document.getElementById("prev-lleg").style.background = playerState.colors.lleg;
  document.getElementById("prev-rleg").style.background = playerState.colors.rleg;
}
syncLobbyUI();

nickInput.addEventListener("input", () => {
  const val = nickInput.value.trim();
  playerState.name = val || "Jogador";
  syncLobbyUI();
});

// Navegação entre abas do portal
document.querySelectorAll("[data-page]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const page = btn.getAttribute("data-page");
    document.querySelectorAll("[data-page]").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(`[data-page="${page}"]`).forEach((b) => b.classList.add("active"));

    document.querySelectorAll(".portal-page").forEach((p) => p.classList.remove("active"));
    const target = page === "avatar" ? "page-avatar" : "page-home";
    document.getElementById(target).classList.add("active");
  });
});

// Cores individuais e Presets
const presets = {
  noob: { head: "#f5cd30", torso: "#0d69ac", larm: "#f5cd30", rarm: "#f5cd30", lleg: "#a4bd47", rleg: "#a4bd47" },
  guest: { head: "#f2f3f3", torso: "#1b2a35", larm: "#f2f3f3", rarm: "#f2f3f3", lleg: "#1b2a35", rleg: "#1b2a35" },
  builder: { head: "#f5cd30", torso: "#e67e22", larm: "#f5cd30", rarm: "#f5cd30", lleg: "#2c3e50", rleg: "#2c3e50" },
  ninja: { head: "#222222", torso: "#111111", larm: "#222222", rarm: "#222222", lleg: "#111111", rleg: "#111111" }
};

document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const p = presets[btn.dataset.preset];
    Object.assign(playerState.colors, p);
    ["head", "torso", "larm", "rarm", "lleg", "rleg"].forEach((part) => {
      document.getElementById("col-" + part).value = p[part];
    });
    syncLobbyUI();
  });
});

["head", "torso", "larm", "rarm", "lleg", "rleg"].forEach((part) => {
  document.getElementById("col-" + part).addEventListener("input", (e) => {
    playerState.colors[part] = e.target.value;
    syncLobbyUI();
  });
});

// ============================================================================
// MOTOR 3D (THREE.JS) + PERSONAGEM R6 + BASEPLATE
// ============================================================================
let scene, camera, renderer;
let inGame = false;
let localRig = null;
const remotePlayers = new Map(); // id -> { rig, data, bubbles, anchorEl }

// Física e Controles
const keys = {};
let velocityY = 0;
let isGrounded = true;
let camYaw = 0;
let camPitch = 0.25;
let camDist = 14;
let isRightMouseDown = false;
let shiftLock = false;
let animTime = 0;

function createStudTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#6c717a";
  ctx.fillRect(0, 0, 128, 128);

  // 4x4 studs por tile
  for (let gx = 0; gx < 4; gx++) {
    for (let gy = 0; gy < 4; gy++) {
      const cx = gx * 32 + 16;
      const cy = gy * 32 + 16;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fillStyle = "#585c64";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx - 1, cy - 1, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = "#797e88";
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(128, 128);
  return tex;
}

function createFaceTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);

  // Olhos clássicos
  ctx.fillStyle = "#141414";
  ctx.beginPath();
  ctx.ellipse(44, 48, 7, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(84, 48, 7, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sorriso clássico
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#141414";
  ctx.beginPath();
  ctx.arc(64, 62, 24, 0.22 * Math.PI, 0.78 * Math.PI);
  ctx.stroke();

  return new THREE.CanvasTexture(c);
}

const classicFaceTex = createFaceTexture();

function buildR6Character(colors) {
  const root = new THREE.Group();

  const mat = (hex) => new THREE.MeshLambertMaterial({ color: hex });

  // Torso (2 x 2 x 1 studs)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), mat(colors.torso));
  torso.position.y = 3;
  torso.castShadow = true;
  root.add(torso);

  // Cabeça (1.2 x 1.2 x 1.2)
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mat(colors.head));
  head.position.y = 4.65;
  head.castShadow = true;
  root.add(head);

  // Rosto na frente (-Z)
  const facePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({ map: classicFaceTex, transparent: true })
  );
  facePlane.position.set(0, 0, -0.61);
  facePlane.rotation.y = Math.PI;
  head.add(facePlane);

  // Pivôs dos membros para rotação articulada
  const makeLimb = (x, y, hex) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), mat(hex));
    mesh.position.y = -1;
    mesh.castShadow = true;
    pivot.add(mesh);
    root.add(pivot);
    return pivot;
  };

  const leftArm = makeLimb(-1.5, 4, colors.larm);
  const rightArm = makeLimb(1.5, 4, colors.rarm);
  const leftLeg = makeLimb(-0.5, 2, colors.lleg);
  const rightLeg = makeLimb(0.5, 2, colors.rleg);

  return { root, head, torso, leftArm, rightArm, leftLeg, rightLeg };
}

function animateR6(rig, state, dt) {
  const t = state.t || 0;

  if (state.emote === "dance") {
    rig.leftArm.rotation.x = Math.sin(t * 8) * 1.2;
    rig.rightArm.rotation.x = -Math.sin(t * 8) * 1.2;
    rig.leftArm.rotation.z = -0.4;
    rig.rightArm.rotation.z = 0.4;
    rig.torso.rotation.y = Math.sin(t * 4) * 0.3;
    return;
  }
  if (state.emote === "wave") {
    rig.rightArm.rotation.x = Math.PI;
    rig.rightArm.rotation.z = Math.sin(t * 10) * 0.4;
    return;
  }

  rig.torso.rotation.y = 0;
  rig.leftArm.rotation.z = 0;
  rig.rightArm.rotation.z = 0;

  if (state.anim === "jump") {
    rig.leftArm.rotation.x = Math.PI;
    rig.rightArm.rotation.x = Math.PI;
    rig.leftLeg.rotation.x = 0.2;
    rig.rightLeg.rotation.x = -0.2;
  } else if (state.anim === "walk") {
    const swing = Math.sin(t * 10) * 0.85;
    rig.leftArm.rotation.x = swing;
    rig.rightArm.rotation.x = -swing;
    rig.leftLeg.rotation.x = -swing;
    rig.rightLeg.rotation.x = swing;
  } else {
    const idle = Math.sin(t * 2) * 0.04;
    rig.leftArm.rotation.x = idle;
    rig.rightArm.rotation.x = -idle;
    rig.leftLeg.rotation.x = 0;
    rig.rightLeg.rotation.x = 0;
  }
}

function initThreeWorld() {
  const canvas = document.getElementById("game-canvas");
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 180, 520);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;

  // Luzes
  const hemi = new THREE.HemisphereLight(0xffffff, 0x555566, 0.75);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(120, 220, 100);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  scene.add(sun);

  // Baseplate 512x512 studs
  const baseplate = new THREE.Mesh(
    new THREE.BoxGeometry(512, 1, 512),
    new THREE.MeshLambertMaterial({ map: createStudTexture() })
  );
  baseplate.position.y = 0;
  baseplate.receiveShadow = true;
  scene.add(baseplate);

  // SpawnLocation Central
  const spawnPad = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.25, 12),
    new THREE.MeshLambertMaterial({ color: 0xa3a7ae })
  );
  spawnPad.position.set(0, 0.62, 0);
  spawnPad.receiveShadow = true;
  scene.add(spawnPad);

  // Personagem Local
  localRig = buildR6Character(playerState.colors);
  scene.add(localRig.root);
  registerOverhead(playerId, playerState.name, localRig.root);
}

// ============================================================================
// SISTEMA DE BALÕES DE CHAT ACIMA DA CABEÇA (BUBBLE CHAT)
// ============================================================================
const overheadLayer = document.getElementById("overhead-layer");
const overheadRegistry = new Map(); // id -> { root, anchorEl, stackEl }

function registerOverhead(id, name, rootObj) {
  if (overheadRegistry.has(id)) return;
  const anchorEl = document.createElement("div");
  anchorEl.className = "overhead-anchor";

  const stackEl = document.createElement("div");
  stackEl.className = "bubble-stack";

  const nameEl = document.createElement("div");
  nameEl.className = "nametag-label";
  nameEl.textContent = name;

  anchorEl.appendChild(stackEl);
  anchorEl.appendChild(nameEl);
  overheadLayer.appendChild(anchorEl);

  overheadRegistry.set(id, { root: rootObj, anchorEl, stackEl, nameEl });
}

function removeOverhead(id) {
  const entry = overheadRegistry.get(id);
  if (entry) {
    entry.anchorEl.remove();
    overheadRegistry.delete(id);
  }
}

function showBubbleAboveHead(id, text) {
  const entry = overheadRegistry.get(id);
  if (!entry) return;

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.textContent = text;
  entry.stackEl.appendChild(bubble);

  // Máximo 3 balões empilhados acima da cabeça
  while (entry.stackEl.children.length > 3) {
    entry.stackEl.firstChild.remove();
  }

  setTimeout(() => {
    bubble.remove();
  }, 7000);
}

function updateOverheadPositions() {
  const tempV = new THREE.Vector3();
  overheadRegistry.forEach((entry) => {
    tempV.copy(entry.root.position);
    tempV.y += 6.1;
    tempV.project(camera);

    if (tempV.z > 1) {
      entry.anchorEl.style.display = "none";
      return;
    }

    const x = (tempV.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-tempV.y * 0.5 + 0.5) * window.innerHeight;
    entry.anchorEl.style.display = "flex";
    entry.anchorEl.style.left = `${x}px`;
    entry.anchorEl.style.top = `${y}px`;
  });
}

// ============================================================================
// CHAT & MULTIPLAYER EM TEMPO REAL
// ============================================================================
const chatMessagesEl = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");

function appendChatLine(sender, text, isSystem = false) {
  const div = document.createElement("div");
  div.className = "chat-line" + (isSystem ? " system" : "");
  if (isSystem) {
    div.textContent = text;
  } else {
    div.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(text)}`;
  }
  chatMessagesEl.appendChild(div);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function sendChatMessage(rawText) {
  const msg = rawText.trim();
  if (!msg) return;

  // Comandos /e
  if (msg.startsWith("/e ")) {
    const emoteName = msg.slice(3).trim().toLowerCase();
    if (emoteName === "dance" || emoteName === "wave") {
      playerState.emote = emoteName;
      appendChatLine("", `* ${playerState.name} está fazendo /e ${emoteName}`, true);
      return;
    }
  }

  appendChatLine(playerState.name, msg);
  showBubbleAboveHead(playerId, msg);

  if (isOnline && db) {
    db.ref("chat").push({
      senderId: playerId,
      senderName: playerState.name,
      text: msg,
      ts: Date.now()
    });
  }
}

document.getElementById("chat-send-btn").addEventListener("click", () => {
  sendChatMessage(chatInput.value);
  chatInput.value = "";
});

chatInput.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter") {
    sendChatMessage(chatInput.value);
    chatInput.value = "";
    chatInput.blur();
  }
});

function setupMultiplayerSync() {
  if (!isOnline || !db) {
    updateLeaderboard();
    return;
  }

  const myRef = db.ref("players/" + playerId);
  myRef.set(playerState);
  myRef.onDisconnect().remove();

  // Escuta outros jogadores entrando, movendo ou saindo
  db.ref("players").on("value", (snap) => {
    const all = snap.val() || {};
    const activeIds = new Set(Object.keys(all));

    // Remove quem saiu
    remotePlayers.forEach((rp, id) => {
      if (!activeIds.has(id)) {
        scene.remove(rp.rig.root);
        removeOverhead(id);
        remotePlayers.delete(id);
      }
    });

    // Adiciona ou atualiza jogadores remotos
    Object.values(all).forEach((p) => {
      if (p.id === playerId) return;
      if (!remotePlayers.has(p.id)) {
        const rig = buildR6Character(p.colors || presets.noob);
        scene.add(rig.root);
        registerOverhead(p.id, p.name, rig.root);
        remotePlayers.set(p.id, { rig, data: p, t: 0 });
        appendChatLine("", `${p.name} entrou na experiência.`, true);
      } else {
        remotePlayers.get(p.id).data = p;
      }
    });

    updateLeaderboard();
  });

  // Escuta mensagens de chat online
  const startTime = Date.now();
  db.ref("chat").limitToLast(15).on("child_added", (snap) => {
    const data = snap.val();
    if (!data || data.ts < startTime || data.senderId === playerId) return;
    appendChatLine(data.senderName, data.text);
    showBubbleAboveHead(data.senderId, data.text);
  });
}

function updateLeaderboard() {
  const list = document.getElementById("leaderboard-list");
  list.innerHTML = "";
  const names = [playerState.name];
  remotePlayers.forEach((rp) => names.push(rp.data.name));

  names.forEach((n) => {
    const li = document.createElement("li");
    li.textContent = "🟢 " + n;
    list.appendChild(li);
  });

  const total = names.length;
  document.getElementById("ingame-player-count").textContent = total;
  document.getElementById("lobby-online-count").textContent = `${total} online`;
  document.getElementById("card-players-count").textContent = total;
}

// ============================================================================
// LOOP PRINCIPAL DE JOGO E MOVIMENTAÇÃO
// ============================================================================
let lastSyncTime = 0;
let prevClock = performance.now();

function gameLoop(now) {
  requestAnimationFrame(gameLoop);
  if (!inGame) return;

  const dt = Math.min((now - prevClock) / 1000, 0.05);
  prevClock = now;
  animTime += dt;

  // Movimento local
  let moveX = 0;
  let moveZ = 0;
  if (document.activeElement !== chatInput) {
    if (keys["KeyW"] || keys["ArrowUp"]) moveZ -= 1;
    if (keys["KeyS"] || keys["ArrowDown"]) moveZ += 1;
    if (keys["KeyA"] || keys["ArrowLeft"]) moveX -= 1;
    if (keys["KeyD"] || keys["ArrowRight"]) moveX += 1;
  }

  const isMoving = moveX !== 0 || moveZ !== 0;
  if (isMoving) {
    playerState.emote = "";
    const angle = Math.atan2(moveX, moveZ) + camYaw;
    playerState.x += Math.sin(angle) * settings.walkSpeed * dt;
    playerState.z += Math.cos(angle) * settings.walkSpeed * dt;
    playerState.ry = angle;
  } else if (shiftLock) {
    playerState.ry = camYaw;
  }

  // Limites da Baseplate
  playerState.x = Math.max(-252, Math.min(252, playerState.x));
  playerState.z = Math.max(-252, Math.min(252, playerState.z));

  // Gravidade e Pulo
  velocityY -= 135 * dt;
  playerState.y += velocityY * dt;
  if (playerState.y <= 0.5) {
    playerState.y = 0.5;
    velocityY = 0;
    isGrounded = true;
  }

  playerState.anim = !isGrounded ? "jump" : isMoving ? "walk" : "idle";

  // Atualiza rig local
  localRig.root.position.set(playerState.x, playerState.y, playerState.z);
  localRig.root.rotation.y = playerState.ry;
  animateR6(localRig, { anim: playerState.anim, emote: playerState.emote, t: animTime }, dt);

  // Atualiza jogadores remotos suavemente
  remotePlayers.forEach((rp) => {
    rp.t += dt;
    rp.rig.root.position.lerp(new THREE.Vector3(rp.data.x, rp.data.y, rp.data.z), 0.25);
    rp.rig.root.rotation.y = rp.data.ry || 0;
    animateR6(rp.rig, { anim: rp.data.anim, emote: rp.data.emote, t: rp.t }, dt);
  });

  // Câmera orbital + 1ª Pessoa
  const headCenter = new THREE.Vector3(playerState.x, playerState.y + 4.5, playerState.z);
  if (camDist <= 1.2) {
    localRig.root.visible = false;
    camera.position.copy(headCenter);
    camera.rotation.order = "YXZ";
    camera.rotation.y = camYaw;
    camera.rotation.x = -camPitch;
  } else {
    localRig.root.visible = true;
    const cx = headCenter.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist;
    const cy = headCenter.y + Math.sin(camPitch) * camDist;
    const cz = headCenter.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist;
    camera.position.set(cx, Math.max(1.2, cy), cz);
    camera.lookAt(headCenter);
  }

  // Envia posição online a cada 80ms
  if (isOnline && db && now - lastSyncTime > 80) {
    lastSyncTime = now;
    db.ref("players/" + playerId).update({
      x: Number(playerState.x.toFixed(2)),
      y: Number(playerState.y.toFixed(2)),
      z: Number(playerState.z.toFixed(2)),
      ry: Number(playerState.ry.toFixed(2)),
      anim: playerState.anim,
      emote: playerState.emote
    });
  }

  renderer.render(scene, camera);
  updateOverheadPositions();
}

// ============================================================================
// EVENTOS DE ENTRADA, CÂMERA E BOTÕES
// ============================================================================
document.getElementById("btn-play-now").addEventListener("click", () => {
  document.getElementById("portal-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");

  if (!scene) initThreeWorld();
  inGame = true;
  appendChatLine("", "Bem-vindo à Baseplate Clássica! Digite /e dance ou /e wave no chat.", true);
  setupMultiplayerSync();
  requestAnimationFrame(gameLoop);
});

window.addEventListener("keydown", (e) => {
  keys[e.code] = true;

  if (!inGame) return;

  if (e.key === "/" && document.activeElement !== chatInput) {
    e.preventDefault();
    chatInput.focus();
  }
  if (e.code === "Space" && isGrounded && document.activeElement !== chatInput) {
    velocityY = settings.jumpPower;
    isGrounded = false;
  }
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
    shiftLock = !shiftLock;
    document.getElementById("btn-shift-lock").classList.toggle("active", shiftLock);
  }
  if (e.code === "KeyR" && document.activeElement !== chatInput) {
    playerState.x = 0;
    playerState.y = 2;
    playerState.z = 0;
  }
  if (e.code === "Escape") {
    document.getElementById("esc-menu").classList.toggle("hidden");
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

window.addEventListener("mousedown", (e) => {
  if (e.button === 2) isRightMouseDown = true;
});

window.addEventListener("mouseup", (e) => {
  if (e.button === 2) isRightMouseDown = false;
});

window.addEventListener("contextmenu", (e) => {
  if (inGame) e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
  if (!inGame) return;
  if (isRightMouseDown || shiftLock) {
    camYaw -= e.movementX * 0.005 * settings.sensitivity;
    camPitch = Math.max(-1.2, Math.min(1.4, camPitch + e.movementY * 0.005 * settings.sensitivity));
  }
});

window.addEventListener("wheel", (e) => {
  if (!inGame) return;
  camDist = Math.max(0.5, Math.min(45, camDist + e.deltaY * 0.015));
});

window.addEventListener("resize", () => {
  if (!renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Botões do HUD e Menu ESC
document.getElementById("btn-menu-esc").addEventListener("click", () => {
  document.getElementById("esc-menu").classList.remove("hidden");
});
document.getElementById("btn-close-esc").addEventListener("click", () => {
  document.getElementById("esc-menu").classList.add("hidden");
});
document.getElementById("btn-resume-game").addEventListener("click", () => {
  document.getElementById("esc-menu").classList.add("hidden");
});
document.getElementById("btn-reset-char").addEventListener("click", () => {
  playerState.x = 0;
  playerState.y = 2;
  playerState.z = 0;
  document.getElementById("esc-menu").classList.add("hidden");
});
document.getElementById("btn-leave-game").addEventListener("click", () => {
  if (isOnline && db) db.ref("players/" + playerId).remove();
  location.reload();
});

document.getElementById("btn-toggle-chat").addEventListener("click", (e) => {
  e.target.classList.toggle("active");
  document.getElementById("chat-window").classList.toggle("hidden");
});

document.getElementById("btn-shift-lock").addEventListener("click", (e) => {
  shiftLock = !shiftLock;
  e.target.classList.toggle("active", shiftLock);
});

document.getElementById("set-sensitivity").addEventListener("input", (e) => {
  settings.sensitivity = parseFloat(e.target.value);
});
document.getElementById("set-walkspeed").addEventListener("input", (e) => {
  settings.walkSpeed = parseFloat(e.target.value);
});
document.getElementById("set-jumppower").addEventListener("input", (e) => {
  settings.jumpPower = parseFloat(e.target.value);
});
