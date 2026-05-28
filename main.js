class AdvancedBackroomsSimulation {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 300);
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        this.clock = new THREE.Clock();
        
        this.stats = { level: 0, sanity: 100, stamina: 100, battery: 100, isCrouching: false, height: 1.7 };
        this.input = { w: false, s: false, a: false, d: false, shift: false };
        this.remotePlayers = {};

        this.levelModule = new LevelModule(this);
        this.networkModule = new NetworkModule(this);

        this.initViewportLights();
        this.initInputs();
        
        this.levelModule.loadLevel(0, 0);
        this.renderer.setAnimationLoop(() => this.update());

        window.addEventListener('resize', () => this.resize());
    }

    initViewportLights() {
        this.scene.background = new THREE.Color(0x060604);
        this.scene.fog = new THREE.FogExp2(0x060604, 0.06);

        this.flashlight = new THREE.SpotLight(0xfff3cd, 3.5, 25, Math.PI / 5, 0.5, 1);
        this.camera.add(this.flashlight);
        this.flashlight.position.set(0, 0, 0);
        this.flashlight.target.position.set(0, 0, -1);
        this.camera.add(this.flashlight.target);
        this.scene.add(this.camera);

        document.getElementById('vr-btn-container').appendChild(THREE.VRButton.createButton(this.renderer));
    }

    initInputs() {
        this.camera.position.set(0, this.stats.height, 0);

        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyW') this.input.w = true;
            if (e.code === 'KeyS') this.input.s = true;
            if (e.code === 'KeyA') this.input.a = true;
            if (e.code === 'KeyD') this.input.d = true;
            if (e.code === 'ShiftLeft') this.input.shift = true;
            if (e.code === 'KeyC') { this.stats.isCrouching = true; this.stats.height = 0.85; }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'KeyW') this.input.w = false;
            if (e.code === 'KeyS') this.input.s = false;
            if (e.code === 'KeyA') this.input.a = false;
            if (e.code === 'KeyD') this.input.d = false;
            if (e.code === 'ShiftLeft') this.input.shift = false;
            if (e.code === 'KeyC') { this.stats.isCrouching = false; this.stats.height = 1.7; }
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

    executeEscapeSequence(methodIndex) {
        const alertEl = document.getElementById('escape-alert');
        alertEl.style.display = "block";
        
        setTimeout(() => {
            alertEl.style.display = "none";
            let nextLevel = this.stats.level + 1;
            
            // Lógica de saltos del Lore
            if (this.stats.level >= 14) nextLevel = 5000; // Mandar a los escalones de la locura
            if (this.stats.level === 5000) nextLevel = 0; // Bucle infinito de vuelta al 0
            
            this.camera.position.set(0, this.stats.height, 0);
            this.levelModule.loadLevel(nextLevel, methodIndex);
        }, 1200);
    }

    spawnRemotePlayer(id) {
        // Generar un avatar procedural (Explorador Hazmat de ASYNC) por código puro
        let playerGroup = new THREE.Group();
        let body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.5), new THREE.MeshStandardMaterial({ color: 0xebc534 }));
        body.position.y = 0.75;
        let visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.2), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        visor.position.set(0, 1.3, -0.15);
        playerGroup.add(body, visor);
        
        this.scene.add(playerGroup);
        this.remotePlayers[id] = playerGroup;
    }

    updateRemotePlayerTransform(id, data) {
        if (this.remotePlayers[id]) {
            this.remotePlayers[id].position.set(data.x, data.y - 0.75, data.z);
            this.remotePlayers[id].rotation.y = data.ry;
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
        let speed = this.input.shift && this.stats.stamina > 5 ? 0.13 : 0.06;
        if(this.stats.isCrouching) speed = 0.035;

        // Gestión de consumibles y estamina
        if(this.input.shift && (this.input.w || this.input.a)) {
            this.stats.stamina = Math.max(0, this.stats.stamina - delta * 30);
        } else {
            this.stats.stamina = Math.min(100, this.stats.stamina + delta * 15);
        }

        this.stats.battery = Math.max(0, this.stats.battery - delta * 0.4);
        this.flashlight.intensity = (this.stats.battery / 100) * 3.5;
        
        // Simulación de cordura baja (NoClip Mental si llega a cero, que es la 4ta forma de escapar)
        this.stats.sanity = Math.max(0, this.stats.sanity - delta * (this.stats.battery <= 0 ? 3 : 0.08));
        if (this.stats.sanity <= 0) {
            this.stats.sanity = 100;
            this.executeEscapeSequence(3); // Escapar por desmayo mental
            return;
        }

        // Lectura de mandos Oculus Quest (Stick de dirección)
        const session = this.renderer.xr.getSession();
        if (session && session.inputSources && session.inputSources[0] && session.inputSources[0].gamepad) {
            let axes = session.inputSources[0].gamepad.axes;
            this.camera.position.x += axes[2] * speed;
            this.camera.position.z += axes[3] * speed;
        }

        // Desplazamiento PC
        let dir = new THREE.Vector3(); this.camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
        let side = new THREE.Vector3(-dir.z, 0, dir.x);
        
        let oldPos = this.camera.position.clone();
        let newPos = this.camera.position.clone();

        if (this.input.w) newPos.addScaledVector(dir, speed);
        if (this.input.s) newPos.addScaledVector(dir, -speed);
        if (this.input.a) newPos.addScaledVector(side, -speed);
        if (this.input.d) newPos.addScaledVector(side, speed);

        newPos.y = THREE.MathUtils.lerp(this.camera.position.y, this.stats.height, 0.15);
        this.camera.position.copy(this.levelModule.checkCollisions(oldPos, newPos));

        // Transmitir telemetría de red
        this.networkModule.broadcastData({
            type: 'transform', x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z, ry: this.camera.rotation.y
        });

        // Actualizar HUD visual
        document.getElementById('stamina-bar').style.width = `${this.stats.stamina}%`;
        document.getElementById('sanity-bar').style.width = `${this.stats.sanity}%`;
        document.getElementById('battery-bar').style.width = `${this.stats.battery}%`;

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
