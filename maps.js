class LevelModule {
    constructor(gameEngine) {
        this.game = gameEngine;
        this.scene = gameEngine.scene;
        this.collidableObjects = [];
        this.escapeTriggers = [];
        this.wallSize = 4;
        this.mapSize = 24; // 24x24 bloques compactos ideales para rendimiento móvil en Oculus
        
        // Nombres basados estrictamente en el Lore Accurate
        this.levelNames = {
            0: "Nivel 0: El Laberinto de Tapiz Húmedo",
            1: "Nivel 1: Zona de Almacenamiento Industrial",
            2: "Nivel 2: Tuberías de Mantenimiento Sofocante",
            3: "Nivel 3: Estación Eléctrica Interna",
            4: "Nivel 4: Oficina del Abandono Vacío",
            5: "Nivel 5: El Hotel del Terror Clásico",
            6: "Nivel 6: Luces Fuera (Oscuridad Absoluta)",
            7: "Nivel 7: El Océano de la Talasofobia",
            8: "Nivel 8: Sistema de Cavernas Infinitas",
            9: "Nivel 9: Suburbios Sintéticos",
            10: "Nivel 10: Campos de Trigo Sin Sol",
            11: "Nivel 11: La Ciudad Infinita de Concreto",
            12: "Nivel 12: Matriz de Almacenamiento Digital",
            13: "Nivel 13: El Edificio de Apartamentos Infinitos",
            14: "Nivel 14: Hospital de la Paranoia Mental",
            5000: "Nivel Secreto: Los Escalones de la Locura"
        };

        // Las 5 formas oficiales de escape del Lore
        this.escapeMethods = [
            "Atravesar una pared de tapiz húmedo inestable.",
            "Dejarse caer a través de un sumidero oscuro en el suelo.",
            "Forzar la entrada cruzando una puerta anti-incendios sin marcar.",
            "Sufrir un desmayo por pérdida total de cordura (NoClip Mental).",
            "Caminar directamente hacia una pared de ladrillos parpadeante."
        ];

        this.initMaterials();
    }

    initMaterials() {
        const buildTex = (c1, c2, dots) => {
            const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d'); ctx.fillStyle = c1; ctx.fillRect(0,0,64,64);
            ctx.fillStyle = c2;
            if(dots) { for(let i=0; i<200; i++) ctx.fillRect(Math.random()*64, Math.random()*64, 1, 1); }
            let t = new THREE.CanvasTexture(canvas); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
            return t;
        };
        this.mats = {
            l0: new THREE.MeshStandardMaterial({ map: buildTex('#c2b276', '#9e905d', true), roughness: 0.9 }),
            l1: new THREE.MeshStandardMaterial({ map: buildTex('#474747', '#2b2b2b', false), roughness: 0.5, metalness: 0.6 }),
            l5000: new THREE.MeshStandardMaterial({ map: buildTex('#1a1a1c', '#0d0d0e', true), roughness: 0.95 }),
            floor: new THREE.MeshStandardMaterial({ map: buildTex('#544933', '#362f21', true), roughness: 0.6 }),
            ceil: new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.9 })
        };
    }

    loadLevel(levelNum, methodIndex = 0, fromNetwork = false) {
        this.game.stats.level = levelNum;
        document.getElementById('lbl-level').innerText = this.levelNames[levelNum] || `Nivel ${levelNum}`;
        document.getElementById('lbl-mission').innerText = `Forma de salida usada: ${this.escapeMethods[methodIndex]}`;

        // Limpieza de geometrías
        this.collidableObjects.forEach(obj => this.scene.remove(obj));
        this.collidableObjects = [];
        this.escapeTriggers = [];

        const group = new THREE.Group();
        const wallGeom = new THREE.BoxGeometry(this.wallSize, this.wallSize, this.wallSize);
        
        let activeMat = this.mats.l0;
        if(levelNum >= 1) activeMat = this.mats.l1;
        if(levelNum === 5000) activeMat = this.mats.l5000;

        const totalWidth = this.mapSize * this.wallSize;
        
        // Suelo y Techo
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(totalWidth, totalWidth), this.mats.floor);
        floor.rotation.x = -Math.PI / 2; group.add(floor);
        const ceil = new THREE.Mesh(new THREE.PlaneGeometry(totalWidth, totalWidth), this.mats.ceil);
        ceil.rotation.x = Math.PI / 2; ceil.position.y = this.wallSize; group.add(ceil);

        // Algoritmo de laberinto determinista
        for (let i = 0; i < this.mapSize; i++) {
            for (let j = 0; j < this.mapSize; j++) {
                // Muros de contención perimetral
                if (i === 0 || j === 0 || i === this.mapSize - 1 || j === this.mapSize - 1) {
                    const wall = new THREE.Mesh(wallGeom, activeMat);
                    wall.position.set(i*this.wallSize - totalWidth/2, this.wallSize/2, j*this.wallSize - totalWidth/2);
                    group.add(wall); this.collidableObjects.push(wall);
                    continue;
                }

                if (i > 10 && i < 14 && j > 10 && j < 14) continue; // Salva de Spawn inicial

                let seed = Math.sin(i * 16.1 + j * 45.7 + levelNum * 3.3) * 43758.5;
                let pseudoRand = seed - Math.floor(seed);

                if (pseudoRand < 0.22) {
                    // Si estamos en el nivel de los escalones (5000), modificamos la altura del bloque para simular escaleras truncadas
                    let adjustedGeom = wallGeom;
                    let posY = this.wallSize / 2;
                    if(levelNum === 5000) {
                        adjustedGeom = new THREE.BoxGeometry(this.wallSize, (pseudoRand * 3) + 1, this.wallSize);
                        posY = ((pseudoRand * 3) + 1) / 2;
                    }

                    const wall = new THREE.Mesh(adjustedGeom, activeMat);
                    wall.position.set(i*this.wallSize - totalWidth/2, posY, j*this.wallSize - totalWidth/2);
                    
                    // Inyectar las 5 zonas de salida aleatorias mediante códigos especiales
                    if(pseudoRand < 0.015) {
                        wall.isEscapePoint = true;
                        wall.escapeMethodIndex = Math.floor(pseudoRand * 300) % 5; 
                        // Colorear sutilmente la anomalía en rojo para dar pistas al jugador
                        wall.material = new THREE.MeshStandardMaterial({ color: 0x5c4235, roughness: 0.9 });
                        this.escapeTriggers.push(wall);
                    } else {
                        this.collidableObjects.push(wall);
                    }
                    group.add(wall);
                }
            }
        }

        // Iluminación cenital
        let light = new THREE.PointLight(levelNum === 5000 ? 0xff4444 : 0xfffae6, levelNum === 6 ? 0.2 : 2.5, 35);
        light.position.set(0, this.wallSize - 0.5, 0); group.add(light);

        this.scene.add(group);
        this.currentMapGroup = group;

        if (!fromNetwork) {
            this.game.networkModule.broadcastData({ type: 'noclip', level: levelNum, methodIndex: methodIndex });
        }
    }

    checkCollisions(oldPos, newPos) {
        let radius = 0.38;
        let pBB = new THREE.Box3(
            new THREE.Vector3(newPos.x - radius, 0.1, newPos.z - radius),
            new THREE.Vector3(newPos.x + radius, this.wallSize - 0.1, newPos.z + radius)
        );

        // Evaluar colisiones físicas regulares
        for (let i = 0; i < this.collidableObjects.length; i++) {
            let obsBB = new THREE.Box3().setFromObject(this.collidableObjects[i]);
            if (pBB.intersectsBox(obsBB)) return oldPos; 
        }

        // Evaluar colisiones contra puntos de escape (NoClip)
        for(let i=0; i < this.escapeTriggers.length; i++) {
            let triggerBB = new THREE.Box3().setFromObject(this.escapeTriggers[i]);
            if (pBB.intersectsBox(triggerBB)) {
                this.game.executeEscapeSequence(this.escapeTriggers[i].escapeMethodIndex);
                return oldPos;
            }
        }

        return newPos;
    }
}
