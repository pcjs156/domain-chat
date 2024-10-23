import express from 'express';
import { WebSocketServer, WebSocket, Data } from 'ws';
import { v4 as uuidv4 } from 'uuid';

const app: express.Application = express();
const port = 3000;

const wss = new WebSocketServer({ noServer: true });

class User {
    id: string;
    nickname: string;
    ws: WebSocket;

    constructor(nickname: string, ws: WebSocket) {
        this.id = uuidv4();
        this.nickname = nickname;
        this.ws = ws;
    }
}

class UserResp {
    id: string;
    nickname: string;

    constructor(user: User) {
        this.id = user.id;
        this.nickname = user.nickname;
    }
}


class Message {
    sender: UserResp;
    message: any;
    sentAt: Date;

    constructor(sender: User, message: any) {
        this.sender = new UserResp(sender);
        this.message = message;
        this.sentAt = new Date();
    }
}

class TextChattingMessage extends Message {
    message: string;

    constructor(sender: User, message: string) {
        super(sender, message);
        this.message = message;
    }
}

enum ControlMessageType {
    CHANGE_NICKNAME = 'CHANGE_NICKNAME',
}

class ControlMessage extends Message {
    type: ControlMessageType;

    constructor(sender: User, type: ControlMessageType) {
        super(sender, type);
        this.type = type;
    }
}

class Room {
    roomId: string;
    clients: Set<User>;
    messages: Message[];

    constructor(roomId: string) {
        this.roomId = roomId;
        this.clients = new Set();
        this.messages = [];
    }

    broadcastTextChatMessage(sender: User, messageBody: string): Message | undefined {
        if (!this.clients.has(sender)) {
            return;
        }
        
        const message = new TextChattingMessage(sender, messageBody);
        const stringifiedMessage = JSON.stringify(message);
        this.getOpenClients().forEach((client) => {
            client.ws.send(stringifiedMessage);
        });
        return message;
    }

    getOpenClients(): User[] {
        return Array.from(this.clients).filter((client) => client.ws.readyState === WebSocket.OPEN);
    }
}

const rooms: Map<string, Room> = new Map();

wss.on('connection', (ws: WebSocket, roomId: string, nickname: string) => {
    if (!rooms.has(roomId)) {
        const room = new Room(roomId);
        rooms.set(roomId, room);
    }

    const newUser = new User(nickname, ws);
    const targetRoom: Room = rooms.get(roomId)!;
    targetRoom.clients.add(newUser);

    ws.onmessage = (event) => {
        const { type, data } = JSON.parse(event.data.toString());

        if (type === 'chatting') {
            targetRoom.broadcastTextChatMessage(newUser, data);
        } else if (type.startsWith('control')) {
            const controlType = type.split(':')[1];
            if (controlType === 'CHANGE_NICKNAME') {
                newUser.nickname = data;
            } else if (controlType === 'GET_MESSAGES') {
            }
        }
    }

    ws.onclose = () => {
        targetRoom.clients.delete(newUser);
    }
})

const server = app.listen(port, () => {
    console.log(`Server is running : http://localhost:${port}`);
});

server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const roomId = url.searchParams.get('roomId') ?? uuidv4();

    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, roomId);
    });
})