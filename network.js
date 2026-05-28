class NetworkModule {
    constructor(gameEngine) {
        this.game = gameEngine;
        this.peer = new Peer(null, { debug: 1 });
        this.connections = [];
        this.maxPlayers = 4; // 4 remotos + 1 local = 5 personas max por servidor
        
        this.peer.on('open', (id) => {
            document.getElementById('lobby-id').innerText = id;
        });

        this.peer.on('connection', (conn) => {
            if (this.connections.length >= this.maxPlayers) {
                conn.on('open', () => {
                    conn.send({ type: 'rejected', reason: 'Servidor Async lleno (Máximo 5 personas)' });
                    setTimeout(() => conn.close(), 500);
                });
                return;
            }
            this.handleConnection(conn);
        });
    }

    connectToPeer() {
        if (this.connections.length >= this.maxPlayers) {
            alert("No puedes unirte. Límite de 5 exploradores alcanzado.");
            return;
        }
        let targetId = document.getElementById('connect-id').value.trim();
        if (targetId) {
            let conn = this.peer.connect(targetId);
            this.handleConnection(conn);
        }
    }

    handleConnection(conn) {
        conn.on('open', () => {
            this.connections.push(conn);
            this.game.spawnRemotePlayer(conn.peer);
        });

        conn.on('data', (data) => {
            if (data.type === 'rejected') {
                alert(data.reason);
            } else if (data.type === 'transform') {
                this.game.updateRemotePlayerTransform(conn.peer, data);
            } else if (data.type === 'noclip') {
                this.game.levelModule.loadLevel(data.level, data.methodIndex, true);
            }
        });

        conn.on('close', () => {
            this.game.removeRemotePlayer(conn.peer);
            this.connections = this.connections.filter(c => c.peer !== conn.peer);
        });
    }

    broadcastData(data) {
        this.connections.forEach(conn => {
            if (conn.open) conn.send(data);
        });
    }
}
