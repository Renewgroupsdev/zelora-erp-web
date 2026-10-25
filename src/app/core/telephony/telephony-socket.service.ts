import { Injectable, inject, signal } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

/** Socket link state: `connected` = live events flow; anything else = the telephony service polls. */
export type SocketState = 'off' | 'connecting' | 'connected' | 'unavailable';

/** A telephony event as broadcast by the backend (App\Events\Telephony\*, `broadcastAs()` names). */
export interface TelephonySocketEvent {
  name: string;
  data: any;
}

/** Every event the telephony channels carry (backend `broadcastAs()`). */
const EVENTS = [
  'call.incoming',
  'call.ringing',
  'call.waiting',
  'call.answered',
  'call.connected',
  'call.ended',
  'call.missed',
  'agent.status.changed',
  'call.alert.created',
];

/**
 * WebSocket link to Laravel Reverb (Pusher protocol) for live telephony events. Private channels are authorised at
 * POST /api/broadcasting/auth with the current Bearer token (read on every authorisation, so token refreshes are
 * picked up). The telephony service decides which channels to join and still polls (slower) as a fallback.
 */
@Injectable({ providedIn: 'root' })
export class TelephonySocketService {
  private readonly auth = inject(AuthService);

  readonly state = signal<SocketState>('off');

  private echo: Echo<'reverb'> | null = null;
  private readonly joined = new Set<string>();

  connect(onEvent: (event: TelephonySocketEvent) => void): void {
    if (this.echo) return;
    const cfg = environment.reverb;
    if (!cfg?.key || !cfg.host) {
      this.state.set('unavailable');
      return;
    }

    this.state.set('connecting');
    this.onEvent = onEvent;
    this.echo = new Echo({
      broadcaster: 'reverb',
      Pusher,
      key: cfg.key,
      wsHost: cfg.host,
      wsPort: cfg.port,
      wssPort: cfg.port,
      forceTLS: cfg.scheme === 'https',
      enabledTransports: ['ws', 'wss'],
      channelAuthorization: {
        endpoint: `${environment.apiBaseUrl}broadcasting/auth`,
        transport: 'ajax',
        customHandler: ({ socketId, channelName }, callback) => {
          fetch(`${environment.apiBaseUrl}broadcasting/auth`, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: this.auth.getAuthorizationHeader() ?? '',
            },
            body: JSON.stringify({ socket_id: socketId, channel_name: channelName }),
          })
            .then(async res => {
              if (!res.ok) throw new Error(`Channel ${channelName} refused (${res.status})`);
              callback(null, await res.json());
            })
            .catch(err => callback(err instanceof Error ? err : new Error(String(err)), null));
        },
      },
    });

    const connection = this.echo.connector.pusher.connection;
    connection.bind('state_change', ({ current }: { current: string }) => {
      this.state.set(current === 'connected' ? 'connected' : current === 'connecting' || current === 'initialized' ? 'connecting' : 'unavailable');
    });
  }

  /** Joins `private-{name}` (idempotent) and forwards its telephony events. */
  join(name: string): void {
    if (!this.echo || this.joined.has(name)) return;
    this.joined.add(name);
    const channel = this.echo.private(name);
    for (const event of EVENTS) {
      // broadcastAs() names are custom, so Echo needs the leading dot (no App\Events namespace prefix).
      channel.listen(`.${event}`, (data: any) => this.onEvent?.({ name: event, data }));
    }
  }

  leave(name: string): void {
    if (!this.echo || !this.joined.delete(name)) return;
    this.echo.leave(name);
  }

  disconnect(): void {
    this.joined.clear();
    this.echo?.disconnect();
    this.echo = null;
    this.onEvent = undefined;
    this.state.set('off');
  }

  private onEvent?: (event: TelephonySocketEvent) => void;
}
