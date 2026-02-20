import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnModuleInit } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
export class MyGateway implements OnModuleInit {
  @WebSocketServer()
  server: Server;

  private pingInterval: NodeJS.Timeout;

  onModuleInit() {
    this.server.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Send a "ping" event every 30 seconds to keep the connection alive
      this.pingInterval = setInterval(() => {
        socket.emit('ping', { msg: 'ping' });
        console.log(`Ping is sent to user ${socket.id}`);
      }, 30000); // Adjust interval as needed

      // Listen for "pong" response from client
      socket.on('pong', () => {
        console.log(`Pong received from ${socket.id}`);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        clearInterval(this.pingInterval); // Stop sending pings
      });
    });
  }

  // New method to send payment success event
  sendPaymentSuccessEvent(session: string) {
    this.server.emit('payment-success', {
      message: 'Payment Successful',
      session,
    });
    console.log('Payment event sent to clients:', session);
  }
}
