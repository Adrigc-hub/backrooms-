class AdvancedBackroomsSimulation {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 500);
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        this.clock = new THREE.Clock();
        
        this.stats = { level: 0, sanity: 100, stamina: 100, battery: 100, isCrouching: false, isRunning: false, height: 1.7 };
        this.input = { w: false, s: false, a: false, d: false, shift: false };
        this.remotePlayers = {};
        this.stepTimer = 0;

        // Iniciar módulos
        this.levelModule = new LevelModule(this);
        this.networkModule = new NetworkModule(this);

        this.initGraphics();
        this.initControls();
        this.initAudioEngine();
        
        this.levelModule.loadLevel(0);
        this.renderer.setAnimationLoop(() => this.update());

        window.addEventListener('resize', () => this.resize());
    }

    initGraphics() {
        this.scene.background = new THREE.Color(0x0a0a07);
        this.scene.fog = new THREE.FogExp2(0x0a0a07, 0.05);

        this.flashlight = new THREE.SpotLight(0xfff5db, 4, 30, Math.PI / 5, 0.5, 1);
        this.camera.add(this.flashlight);
        this.flashlight.position.set(0, 0, 0);
        this.flashlight.target.position.set(0, 0, -1);
        this.camera.add(this.flashlight.target);
        this.scene.add(this.camera);

        document.getElementById('vr-btn-container').appendChild(THREE.VRButton.createButton(this.renderer));
    }

    initAudioEngine() {
        this.audioCtx = null;
        const startAudio = () => {
            if(!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                // Zumbido eléctrico sutil de fondo
                let osc = this.audioCtx.createOscillator();
                let gain = this.audioCtx.createGain();
                osc.frequency.setValueAtTime(60, this.audioCtx.currentTime);
                gain.gain.setValueAtTime(0.003, this.audioCtx.currentTime);
                osc.connect(gain); gain.connect(this.audioCtx.destination);
                osc.start(0);
            }
        };
        document.addEventListener('click', startAudio, { once: true });
    }

    playStepSound() {
        if(!this.audioCtx) return;
        let osc = this.audioCtx.createOscillator();
        let gain = this.audioCtx.createGain();
        osc.frequency.setValueAtTime(this.stats.isCrouching ? 45 : 60, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(this.stats.isRunning ? 0.2 : 0.1, this.audioCtx.currentTime);
        osc.connect(gain); gain.connect(this.audioCtx.destination);
        osc.start(); osc.stop(this.audioCtx.currentTime + 0.1);
    }

    initControls() {
        this.camera.position.set(0, this.stats.height, 0);

        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyW') this.input.w = true;
            if (e.code === 'KeyS') this.input.s = true;
            if (e.code === 'KeyA') this.input.a = true;
            if (e.code === 'KeyD') this.input.d = true;
            if (e.code === 'ShiftLeft') this.input.shift = true;
            if (e.code === 'KeyC') this.toggleCrouch(true);
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'KeyW') this.input.w = false;
            if (e.code === 'KeyS') this.input.s = false;
            if (e.code === 'KeyA') this.input.a = false;
            if (e.code === 'KeyD') this.input.d = false;
            if (e.code === 'ShiftLeft') this.input.shift = false;
            if (e.code === 'KeyC') this.toggleCrouch(false);
        });

        this.renderer.domElement.addEventListener('click', () => {
            if (!this.renderer.xr.isPresenting) this.renderer.domElement.requestPointerLock();
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.renderer.domElement && !this.renderer.xr.isPresenting) {
                this.camera.rotation.y -= e.movementX * 0.0025;
                this.camera.rotation.x -= e.movementY * 0.0025;
                this.camera.rotation.x = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, this.camera.rotation.x));
            }
        });
    }

    toggleCrouch(active) {
        this.stats.isCrouching = active;
        this.stats.height = active ? 0.85 : 1.7;
    }

    triggerNoClip() {
        let next = this.stats.level + 1;
        if(this.stats.level === 1) next = 5000; // Salto secreto a escaleras
        if(this.stats.level === 5000) next = 0;
        this.levelModule.loadLevel(next);
    }

    spawnRemotePlayer(id) {
        let mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.6), new THREE.MeshStandardMaterial({ color: 0xffcc00 }));
        this.scene.add(mesh);
        this.remotePlayers[id] = mesh;
    }

    updateRemotePlayerTransform(id, data) {
        if (this.remotePlayers[id]) {
            this.remotePlayers[id].position.set(data.x, data.y - 0.8, data.z);
        }
    }

    removeRemotePlayer(id) {
        if (this.remotePlayers[id]) {
            this.scene.remove(this.remotePlayers[id]);
            delete this.remotePlayers[id];
        }
    }

    update() {
        let delta = this.clock.getDelta();
        let currentSpeed = this.input.shift && this.stats.stamina > 5 ? 0.12 : 0.06;
        if(this.stats.isCrouching) currentSpeed = 0.03;

        // Gestión de barras físicas
        if(this.input.shift && (this.input.w || this.input.a)) {
            this.stats.stamina = Math.max(0, this.stats.stamina - delta * 35);
        } else {
            this.stats.stamina = Math.min(100, this.stats.stamina + delta * 18);
        }

        this.stats.battery = Math.max(0, this.stats.battery - delta * 0.5);
        this.flashlight.intensity = (this.stats.battery / 100) * 4;
        this.stats.sanity = Math.max(0, this.stats.sanity - delta * (this.stats.battery <= 0 ? 2 : 0.1));

        let dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
        let side = new THREE.Vector3(-dir.z, 0, dir.x);

        let oldPos = this.camera.position.clone();
        let newPos = this.camera.position.clone();

        if (this.input.w) newPos.addScaledVector(dir, currentSpeed);
        if (this.input.s) newPos.addScaledVector(dir, -currentSpeed);
        if (this.input.a) newPos.addScaledVector(side, -currentSpeed);
        if (this.input.d) newPos.addScaledVector(side, currentSpeed);

        newPos.y = THREE.MathUtils.lerp(this.camera.position.y, this.stats.height, 0.15);
        this.camera.position.copy(this.levelModule.checkCollisions(oldPos, newPos));

        // Sonidos de pasos rítmicos
        if(this.input.w || this.input.s || this.input.a || this.input.d) {
            this.stepTimer += delta * (this.input.shift ? 2.5 : this.stats.isCrouching ? 1 : 1.6);
            if(this.stepTimer > 1.0) { this.playStepSound(); this.stepTimer = 0; }
        }

        // Enviar datos de red
        this.networkModule.broadcastData({
            type: 'transform', x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z
        });

        // Reflejar en HUD
        document.getElementById('stamina-bar').style.width = `${this.stats.stamina}%`;
        document.getElementById('sanity-bar').style.width = `${this.stats.sanity}%`;
        document.getElementById('battery-bar').style.width = `${this.stats.battery}%`;

        if(this.stats.sanity <= 0) { alert("Perdiste la cordura."); this.stats.sanity = 100; this.levelModule.loadLevel(0); }

        this.renderer.render(this.scene, this.camera);
    }

    resize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

let game;
window.addEventListener('DOMContentLoaded', () => { game = new AdvancedBackroomsSimulation(); });
