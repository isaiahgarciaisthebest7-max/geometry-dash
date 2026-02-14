const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const progressFill = document.getElementById('progress-fill');
const levelNumSpan = document.getElementById('level-num');

canvas.width = 800;
canvas.height = 450;

// --- PHYSICS CONSTANTS (Tuned for 60Hz) ---
const PHY = {
    GRAVITY: 0.65,        // Precise gravity
    JUMP_FORCE: -10.5,    // Sharp jump
    SHIP_LIFT: -0.35,     // Ship thrust
    SHIP_GRAVITY: 0.25,   // Ship weight
    TERMINAL_VEL: 12,     // Max fall speed
    SPEED: 6,             // Scrolling speed
    GROUND: 380           // Floor Y position
};

// --- LEVEL DATA ---
// 1 = Block, 2 = Spike, 3 = Ship Portal, 4 = Cube Portal
// Distances are in "Grid Units" (40px)
const LEVELS = [
    // Level 1: Stereo Madness Style
    [
        {x: 15, t: 2}, {x: 25, t: 2}, {x: 40, t: 2}, 
        {x: 41, t: 2}, // Double spike
        {x: 60, t: 3}, // Ship Portal
        {x: 80, t: 1}, {x: 85, t: 1}, {x: 100, t: 1}, // Blocks to fly around
        {x: 130, t: 4}, // Cube Portal
        {x: 140, t: 2}, {x: 141, t: 2}, {x: 142, t: 2} // Triple spike
    ],
    // Level 2: Back on Track Style
    [
        {x: 10, t: 2}, {x: 20, t: 1}, {x: 21, t: 2}, // Jump on block then spike
        {x: 35, t: 1}, {x: 36, t: 1}, {x: 37, t: 1}, 
        {x: 50, t: 3}, // Ship
        {x: 70, t: 1, y: 200}, {x: 90, t: 1, y: 300}, // Columns
        {x: 120, t: 4}, // Cube
        {x: 130, t: 2}, {x: 135, t: 2}, {x: 140, t: 2}
    ],
    // Level 3: Hard
    [
        {x: 15, t: 2}, {x: 16, t: 2}, {x: 17, t: 2}, // Immediate Triple
        {x: 30, t: 3}, // Ship
        {x: 50, t: 1, y: 100}, {x: 50, t: 1, y: 300}, // Tight squeeze
        {x: 70, t: 1, y: 150}, {x: 70, t: 1, y: 350},
        {x: 100, t: 4}, // Cube
        {x: 110, t: 2}, {x: 120, t: 2}, {x: 130, t: 2}, {x: 140, t: 2}
    ]
];

let gameState = {
    running: false,
    levelIndex: 0,
    objects: [],
    cameraX: 0,
    attempt: 1
};

let player = {
    x: 200,
    y: 0,
    dy: 0,
    width: 30,
    height: 30,
    mode: 'CUBE', // CUBE or SHIP
    rotation: 0,
    onGround: false,
    dead: false
};

let input = { hold: false, jumpPressed: false };

// --- INPUT HANDLING ---
function bindInput() {
    ['mousedown', 'touchstart', 'keydown'].forEach(evt => 
        window.addEventListener(evt, (e) => {
            if (e.type === 'keydown' && e.code !== 'Space' && e.code !== 'ArrowUp') return;
            if (!gameState.running) startGame();
            input.hold = true;
            input.jumpPressed = true;
        })
    );
    ['mouseup', 'touchend', 'keyup'].forEach(evt => 
        window.addEventListener(evt, () => input.hold = false)
    );
}

// --- CORE FUNCTIONS ---
function loadLevel(index) {
    if (index >= LEVELS.length) index = 0; // Loop back to lvl 1
    gameState.levelIndex = index;
    gameState.cameraX = 0;
    gameState.objects = LEVELS[index].map(obj => ({
        x: obj.x * 40,
        y: obj.y || PHY.GROUND, // Default to floor if no Y provided
        type: obj.t,
        w: 40, h: 40
    }));
    levelNumSpan.innerText = index + 1;
    resetPlayer();
}

function resetPlayer() {
    player.x = 200;
    player.y = PHY.GROUND - player.height;
    player.dy = 0;
    player.mode = 'CUBE';
    player.rotation = 0;
    player.dead = false;
    gameState.cameraX = 0;
}

function startGame() {
    if (gameState.running) return;
    overlay.style.display = 'none';
    gameState.running = true;
    loadLevel(gameState.levelIndex);
    requestAnimationFrame(loop);
}

// --- PHYSICS ENGINE (Fixed Time Step) ---
function updatePhysics() {
    if (player.dead) return;

    // 1. Move Camera (Player stays static on X, world moves)
    gameState.cameraX += PHY.SPEED;

    // 2. Apply Forces
    if (player.mode === 'CUBE') {
        player.dy += PHY.GRAVITY;
        
        // Floor Collision
        if (player.y + player.height >= PHY.GROUND) {
            player.y = PHY.GROUND - player.height;
            player.dy = 0;
            player.onGround = true;
            
            // Snap rotation
            player.rotation = Math.round(player.rotation / 90) * 90; 
        } else {
            player.onGround = false;
            player.rotation += 5; // Spin in air
        }

        // Jump
        if (input.hold && player.onGround) {
            player.dy = PHY.JUMP_FORCE;
            input.jumpPressed = false;
            player.onGround = false;
        }
    } 
    else if (player.mode === 'SHIP') {
        player.dy += input.hold ? PHY.SHIP_LIFT : PHY.SHIP_GRAVITY;
        player.rotation = player.dy * 3; // Tilt
        
        // Ceiling/Floor Limits
        if (player.y < 0) { player.y = 0; player.dy = 0; }
        if (player.y + player.height > PHY.GROUND) {
            player.y = PHY.GROUND - player.height;
            player.dy = 0;
        }
    }

    // Terminal Velocity
    if (player.dy > PHY.TERMINAL_VEL) player.dy = PHY.TERMINAL_VEL;

    // 3. Move Player Y
    player.y += player.dy;

    // 4. Object Collision
    let playerRect = {l: gameState.cameraX + player.x + 5, r: gameState.cameraX + player.x + player.width - 5, t: player.y + 5, b: player.y + player.height - 5};

    for (let obj of gameState.objects) {
        // Simple AABB Collision
        if (playerRect.r > obj.x && playerRect.l < obj.x + obj.w &&
            playerRect.b > obj.y - obj.h && playerRect.t < obj.y) {
            
            if (obj.type === 2) die(); // Spike
            if (obj.type === 3) player.mode = 'SHIP';
            if (obj.type === 4) player.mode = 'CUBE';
            // Type 1 (Block) logic is simplified: it just kills you in this version 
            // unless we add platforming logic. For now, blocks are obstacles.
            if (obj.type === 1) die();
        }
    }

    // Level Complete Check (End of objects + 500px)
    let lastObj = gameState.objects[gameState.objects.length-1];
    if (gameState.cameraX > lastObj.x + 500) {
        loadLevel(gameState.levelIndex + 1);
    }
}

function die() {
    player.dead = true;
    gameState.attempt++;
    setTimeout(() => {
        resetPlayer();
    }, 500); // 0.5s delay before restart
}

// --- RENDERER ---
function draw() {
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Floor
    ctx.fillStyle = '#111';
    ctx.fillRect(0, PHY.GROUND, canvas.width, canvas.height - PHY.GROUND);
    ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, PHY.GROUND); ctx.lineTo(canvas.width, PHY.GROUND); ctx.stroke();

    // Draw Objects
    gameState.objects.forEach(obj => {
        let drawX = obj.x - gameState.cameraX;
        if (drawX > -50 && drawX < 850) {
            if (obj.type === 1) { // Block
                ctx.fillStyle = '#fff';
                ctx.fillRect(drawX, obj.y - 40, 40, 40);
                ctx.strokeStyle = 'black';
                ctx.strokeRect(drawX, obj.y - 40, 40, 40);
            } else if (obj.type === 2) { // Spike
                ctx.fillStyle = 'red';
                ctx.beginPath();
                ctx.moveTo(drawX, PHY.GROUND);
                ctx.lineTo(drawX + 20, PHY.GROUND - 40);
                ctx.lineTo(drawX + 40, PHY.GROUND);
                ctx.fill();
            } else if (obj.type === 3 || obj.type === 4) { // Portals
                ctx.fillStyle = obj.type === 3 ? 'pink' : 'cyan';
                ctx.fillRect(drawX, 0, 40, 450);
            }
        }
    });

    // Draw Player
    if (!player.dead) {
        ctx.save();
        ctx.translate(player.x + player.width/2, player.y + player.height/2);
        ctx.rotate(player.rotation * Math.PI / 180);
        ctx.fillStyle = player.mode === 'SHIP' ? 'pink' : 'cyan';
        ctx.fillRect(-player.width/2, -player.height/2, player.width, player.height);
        ctx.restore();
    }

    // Progress Bar
    let maxDist = gameState.objects[gameState.objects.length-1].x;
    let pct = Math.min((gameState.cameraX / maxDist) * 100, 100);
    progressFill.style.width = pct + '%';
}

// --- GAME LOOP (Fixed Time Step) ---
let lastTime = 0;
let accumulator = 0;
const STEP = 1/60; // 60 FPS fixed physics

function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    accumulator += deltaTime;

    // Run physics as many times as needed to catch up
    while (accumulator >= STEP) {
        updatePhysics();
        accumulator -= STEP;
    }

    draw();
    if (gameState.running) requestAnimationFrame(loop);
}

bindInput();
