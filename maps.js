class LevelModule {
    constructor(gameEngine) {
        this.game = gameEngine;
        this.scene = gameEngine.scene;
        this.collidableObjects = [];
        this.wallSize = 4;
        this.mapSize = 35; // Tamaño fijo del mapa (35x35 bloques cerrados para evitar bugs)
        
        this.initMaterials();
    }

    initMaterials() {
        const createTex = (color1, color2) => {
            const canvas = document.createElement('canvas');
            canvas.width = 64; canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = color1; ctx.fillRect(0,0,64,64);
            ctx.fillStyle = color2;
            for(let i=0; i<300; i++) ctx.fillRect(Math.random()*64, Math.random()*64, 2, 2);
            let t = new THREE.CanvasTexture(canvas);
            t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
            return t;
        };

        this.mats = {
            level0: new THREE.MeshStandardMaterial({ map: createTex('#c3b47b', '#948753'), roughness: 0.8 }),
            level1: new THREE.MeshStandardMaterial({ map: createTex('#363636', '#141414'), roughness: 0.5, metalness: 0.4 }),
            stairLevel: new THREE.MeshStandardMaterial({ map: createTex('#222222', '#111111'), roughness: 0.9 }),
            floor: new THREE.MeshStandardMaterial({ map: createTex('#594f38', '#383121'), roughness: 0.4 }),
            ceiling: new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.9 })
        };
    }

    loadLevel(levelNum, fromNetwork = false) {
        if(levelNum > 49 && levelNum !== 5000) levelNum = 0; // Límite de 50 mapas principales (0-49)
        
        this.game.stats.level = levelNum;
        document.getElementById('lbl-level').innerText = levelNum;

        // Limpieza total de geometrías viejas
        this.collidableObjects.forEach(obj => this.scene.remove(obj));
        this.collidableObjects = [];

        // Generar estructura del mapa basado en el número de nivel
        const group = new THREE.Group();
        const wallGeom = new THREE.BoxGeometry(this.wallSize, this.wallSize, this.wallSize);
        
        // Elegir material según el nivel
        let currentMat = this.mats.level0;
        if (levelNum === 1) currentMat = this.mats.level1;
        if (levelNum === 5000) currentMat = this.mats.stairLevel;

        // Crear Suelo y Techo cerrado
        const totalSize = this.mapSize * this.wallSize;
        const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(totalSize, totalSize), this.mats.floor);
        floorMesh.rotation.x = -Math.PI / 2;
        group.add(floorMesh);

        const ceilMesh = new THREE.Mesh(new THREE.PlaneGeometry(totalSize, totalSize), this.mats.ceiling);
        ceilMesh.rotation.x = Math.PI / 2; ceilMesh.position.y = this.wallSize;
        group.add(ceilMesh);

        // Generar laberinto único usando la semilla matemática del nivel actual
        for (let i = 0; i < this.mapSize; i++) {
            for (let j = 0; j < this.mapSize; j++) {
                // Bordes exteriores (Paredes perimetrales del mapa para no caer al vacío)
                if (i === 0 || j === 0 || i === this.mapSize - 1 || j === this.mapSize - 1) {
                    const wall = new THREE.Mesh(wallGeom, currentMat);
                    wall.position.set(i*this.wallSize - totalSize/2, this.wallSize/2, j*this.wallSize - totalSize/2);
                    group.add(wall);
                    this.collidableObjects.push(wall);
                    continue;
                }

                // Evitar bloquear el spawn inicial
                if(i > 15 && i < 20 && j > 15 && j < 20) continue;

                // Modulador matemático único por cada uno de los 50 niveles
                let seed = Math.sin(i * 12.9 + j * 78.3 + levelNum * 5.5) * 43758.5453;
                let pseudoRandom = seed - Math.floor(seed);

                if (pseudoRandom < 0.23) {
                    const wall = new THREE.Mesh(wallGeom, currentMat);
                    wall.position.set(i*this.wallSize - totalSize/2, this.wallSize/2, j*this.wallSize - totalSize/2);
                    
                    // Hacer que algunas paredes aleatorias sean zonas NoClip transitables
                    if(pseudoRandom < 0.015) {
                        wall.isAnomalous = true;
                    } else {
                        this.collidableObjects.push(wall); // Solo colisiona si no es anomalía
                    }
                    group.add(wall);
                }
            }
        }

        // Añadir iluminación cenital fija
        let light = new THREE.PointLight(levelNum === 1 ? 0x8cd3ff : 0xfffdb5, 2.5, 30);
        light.position.set(0, this.wallSize - 0.5, 0);
        group.add(light);

        this.scene.add(group);
        this.currentMapGroup = group;
        this.collidableObjects.push(...group.children.filter(c => c.geometry && c.geometry.type === "BoxGeometry" && !c.isAnomalous));

        if (!fromNetwork) {
            this.game.networkModule.broadcastData({ type: 'noclip', level: levelNum });
        }
    }

    checkCollisions(oldPos, newPos) {
        let pRadius = 0.4;
        let pBB = new THREE.Box3(
            new THREE.Vector3(newPos.x - pRadius, 0.1, newPos.z - pRadius),
            new THREE.Vector3(newPos.x + pRadius, this.wallSize - 0.1, newPos.z + pRadius)
        );

        // Verificar colisión con paredes del mapa actual
        for (let i = 0; i < this.collidableObjects.length; i++) {
            let obstacleBB = new THREE.Box3().setFromObject(this.collidableObjects[i]);
            if (pBB.intersectsBox(obstacleBB)) {
                return oldPos; // Bloquear movimiento
            }
        }

        // Activar NoClip si chocas con una pared falsa o sales de los límites establecidos
        if (Math.abs(newPos.x) > (this.mapSize*this.wallSize)/2 - 2 || Math.abs(newPos.z) > (this.mapSize*this.wallSize)/2 - 2) {
            this.game.triggerNoClip();
            return oldPos;
        }

        return newPos;
    }
}
