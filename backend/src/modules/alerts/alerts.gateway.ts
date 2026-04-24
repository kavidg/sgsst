import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AlertSeverity } from './schemas/alert.schema';

export interface NewAlertEvent {
  companyId: string;
  message: string;
  severity: AlertSeverity;
}

@WebSocketGateway({
  cors: true,
})
export class AlertsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    const companyId = client.handshake.query.companyId;

    if (typeof companyId === 'string' && companyId.length > 0) {
      client.join(this.getCompanyRoom(companyId));
    }
  }

  @SubscribeMessage('join-company')
  handleJoinCompany(@MessageBody() companyId: string, @ConnectedSocket() client: Socket): void {
    if (companyId) {
      client.join(this.getCompanyRoom(companyId));
    }
  }

  emitNewAlert(alert: NewAlertEvent): void {
    this.server.to(this.getCompanyRoom(alert.companyId)).emit('new-alert', alert);
  }

  private getCompanyRoom(companyId: string): string {
    return `company:${companyId}`;
  }
}
