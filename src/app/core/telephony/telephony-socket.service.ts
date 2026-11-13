import { Injectable, inject, signal } from '@angular/core';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

/** Socket link state: `connected` = live events flow; anything else = the consumers poll. */
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
  'lead.changed',
];

/** Who holds the connection open: the telephony dock and the notification bell share one socket. */
export type SocketOwner = 'telephony' | 'bell';

/**
 * WebSocket link to Laravel Reverb (Pusher protocol). Private channels are authorised at POST /api/broadcasting/auth
 * with the current Bearer token (read on every authorisation, so token refreshes are picked up).
 *
 * One connection is shared: the telephony service joins its call channels (`join()`), the notification bell listens on
 * its own channels (`listen()`). Each opens it with `connect(owner)` and closes its part with `disconnect(owner)`; the
 * socket itself closes when nobody uses it any more. Both still poll (slower) as a fallback when it is down.
 */
@Injectable({ providedIn: 'root' })
export class TelephonySocketService {
  private readonly auth = inject(AuthService);

  readonly state = signal<SocketState>('off');

  private echo: Echo<'reverb'> | null = null;
  private readonly owners = new Set<SocketOwner>();
  /** Channels joined per owner, so one owner leaving does not drop the other's channels. */
  private readonly channels: Record<SocketOwner, Set<string>> = { telephony: new Set(), bell: new Set() };
  /** channel|event pairs already listened to (listen() is idempotent). */
  private readonly listening = new Set<string>();
  private onEvent?: (event: TelephonySocketEvent) => void;

  /**
   * Opens the shared socket for `owner`. The telephony service passes its event handler (for the channels it `join()`s);
   * older callers that pass only a handler are the telephony owner.
   */
  connect(ownerOrHandler: SocketOwner | ((event: TelephonySocketEvent) => void), onEvent?: (event: TelephonySocketEvent) => void): void {
    const owner: SocketOwner = typeof ownerOrHandler === 'string' ? ownerOrHandler : 'telephony';
    const handler = typeof ownerOrHandler === 'function' ? ownerOrHandler : onEvent;
    this.owners.add(owner);
    if (handler) this.onEvent = handler;
    if (this.echo) return;

    const cfg = environment.reverb;
    if (!cfg?.key || !cfg.host) {
      this.state.set('unavailable');
      return;
    }

    this.state.set('connecting');
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

  /** Telephony: joins `private-{name}` (idempotent) and forwards its telephony events to the telephony handler. */
  join(name: string): void {
    if (!this.echo) return;
    for (const event of EVENTS) {
      // broadcastAs() names are custom, so Echo needs the leading dot (no App\Events namespace prefix).
      this.subscribe('telephony', name, event, (data: any) => this.onEvent?.({ name: event, data }));
    }
  }

  /** Any owner: listens to one event of `private-{name}` (idempotent per channel + event). */
  listen(owner: SocketOwner, name: string, event: string, handler: (data: any) => void): void {
    if (!this.echo) return;
    this.subscribe(owner, name, event, handler);
  }

  leave(name: string): void {
    if (!this.echo) return;
    this.channels.telephony.delete(name);
    this.channels.bell.delete(name);
    this.forget(name);
    this.echo.leave(name);
  }

  /** Closes `owner`'s part (its channels); the socket itself closes once no owner uses it. No owner = telephony (older callers). */
  disconnect(owner: SocketOwner = 'telephony'): void {
    this.owners.delete(owner);
    if (owner === 'telephony') this.onEvent = undefined;

    if (this.owners.size && this.echo) {
      const others = [...this.owners].flatMap(o => [...this.channels[o]]);
      for (const name of this.channels[owner]) {
        if (others.includes(name)) continue;
        this.forget(name);
        this.echo.leave(name);
      }
      this.channels[owner].clear();
      return;
    }

    this.channels.telephony.clear();
    this.channels.bell.clear();
    this.listening.clear();
    this.echo?.disconnect();
    this.echo = null;
    this.onEvent = undefined;
    this.state.set('off');
  }

  private subscribe(owner: SocketOwner, name: string, event: string, handler: (data: any) => void): void {
    this.channels[owner].add(name);
    const key = `${name}|${event}`;
    if (this.listening.has(key) || !this.echo) return;
    this.listening.add(key);
    this.echo.private(name).listen(`.${event}`, handler);
  }

  private forget(name: string): void {
    for (const key of [...this.listening]) if (key.startsWith(`${name}|`)) this.listening.delete(key);
  }
}
