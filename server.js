const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});

app.use(express.static('public'));

let players = {};
let backroomsRooms = {}; // Instancias de salas de los Backrooms

io.on('connection', (socket) => {
    console.log(`Jugador conectado al Nexo: ${socket.id}`);
    
    // Al unirse a la simulación
    players[socket.id] = {
        id: socket.id,
        x: 0, y: 1.7, z: 0,
        rx: 0, ry: 0, rz: 0,
        level: 0,
        isCrouching: false,
        sanity: 100
    };

    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Transmisión de movimiento en tiempo real (Tickrate rápido para VR)
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].z = movementData.z;
            players[socket.id].rx = movementData.rx;
            players[socket.id].ry = movementData.ry;
            players[socket.id].isCrouching = movementData.isCrouching;
            players[socket.id].sanity = movementData.sanity;
            
            // Envío ultra-rápido de paquetes
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // Evento de NoClip global (Sincroniza cuando alguien altera la realidad)
    socket.on('triggerNoClip', (data) => {
        console.log(`Jugador ${socket.id} cruzó al nivel ${data.targetLevel}`);
        if(players[socket.id]) {
            players[socket.id].level = data.targetLevel;
            io.emit('globalLog', { msg: `Alguien ha hecho NoClip hacia el Nivel ${data.targetLevel}` });
        }
    });

    // Desconexión (Eliminar del espacio tridimensional)
    socket.on('disconnect', () => {
        console.log(`Jugador desvanecido: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor de los Backrooms activo en el puerto ${PORT}`);
});
