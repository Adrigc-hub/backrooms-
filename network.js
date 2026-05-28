class NetworkModule {
    constructor(gameEngine) {
        this.game = gameEngine;
        this.peer = new Peer(null, { debug: 1 });
        this.connections = [];
        
        this.peer.on('open', (id) => {
            document.getElementById('lobby-id').innerText = id;
        });

        this.peer.on('connection', (conn) => {
            this.handleConnection(conn);
        });
    }

    connectToPeer() {
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
            if (data.type === 'transform') {
                this.game.updateRemotePlayerTransform(conn.peer, data);
            } else if (data.type === 'noclip') {
                this.game.levelModule.loadLevel(data.level, true);
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
