import { Component, computed, output, signal } from '@angular/core';

/** Emoji groups as WhatsApp orders them. Each entry: "emoji keyword keyword" (keywords power the search). */
const GROUPS: { key: string; icon: string; label: string; list: string }[] = [
  {
    key: 'smileys', icon: 'bi-emoji-smile', label: 'Smileys & people',
    list: '😀 grin|😃 smile|😄 happy|😁 beam|😆 laugh|😅 sweat|🤣 rofl|😂 joy tears|🙂 slight|🙃 upside|😉 wink|😊 blush|😇 angel|🥰 love hearts|😍 heart eyes|🤩 star|😘 kiss|😗 kiss|😚 kiss|😙 kiss|🥲 tear smile|😋 yum|😛 tongue|😜 wink tongue|🤪 zany|😝 tongue|🤑 money|🤗 hug|🤭 oops|🤫 shush|🤔 think|🤐 zip|🤨 eyebrow|😐 neutral|😑 blank|😶 silent|😏 smirk|😒 unamused|🙄 eyeroll|😬 grimace|😌 relieved|😔 pensive|😪 sleepy|🤤 drool|😴 sleep|😷 mask|🤒 sick|🤕 hurt|🤢 nausea|🤮 vomit|🥵 hot|🥶 cold|😵 dizzy|🤯 mind blown|🤠 cowboy|🥳 party|😎 cool|🤓 nerd|🧐 monocle|😕 confused|😟 worried|🙁 frown|😮 wow|😯 hushed|😲 astonished|😳 flushed|🥺 pleading|😦 frown|😧 anguish|😨 fear|😰 anxious|😥 sad|😢 cry|😭 sob|😱 scream|😖 confounded|😣 persevere|😞 disappointed|😓 sweat|😩 weary|😫 tired|🥱 yawn|😤 triumph|😡 angry|😠 mad|🤬 curse|😈 devil|💀 skull|💩 poop|🤡 clown|👻 ghost|👽 alien|🤖 robot|👋 wave hello|🤚 hand|🖐 hand|✋ stop|🖖 vulcan|👌 ok|🤌 pinch|✌️ peace|🤞 fingers crossed|🤟 love you|🤘 rock|🤙 call me|👈 left|👉 right|👆 up|👇 down|☝️ point|👍 thumbs up yes ok|👎 thumbs down no|✊ fist|👊 punch|🤛 fist|🤜 fist|👏 clap|🙌 raise hands|👐 open hands|🤲 palms|🤝 handshake deal|🙏 pray thanks please|✍️ write|💅 nails|💪 strong|🧠 brain|👀 eyes|👶 baby|🧒 child|👦 boy|👧 girl|🧑 person|👨 man|👩 woman|🧓 older|👴 old man|👵 old woman|🙍 frown|🙋 raise hand|🙇 bow|🤦 facepalm|🤷 shrug|👨‍⚕️ doctor|👩‍⚕️ doctor nurse|💁 info|💆 massage|💇 haircut hair|🚶 walk|🏃 run|💃 dance|🕺 dance|👫 couple|👪 family',
  },
  {
    key: 'nature', icon: 'bi-tree', label: 'Animals & nature',
    list: '🐶 dog|🐱 cat|🐭 mouse|🐹 hamster|🐰 rabbit|🦊 fox|🐻 bear|🐼 panda|🐨 koala|🐯 tiger|🦁 lion|🐮 cow|🐷 pig|🐸 frog|🐵 monkey|🙈 see no evil|🙉 hear no evil|🙊 speak no evil|🐔 chicken|🐧 penguin|🐦 bird|🐤 chick|🦆 duck|🦅 eagle|🦉 owl|🐴 horse|🦄 unicorn|🐝 bee|🦋 butterfly|🐌 snail|🐞 ladybug|🐢 turtle|🐍 snake|🐙 octopus|🐠 fish|🐬 dolphin|🐳 whale|🐘 elephant|🐪 camel|🌵 cactus|🎄 tree|🌲 tree|🌳 tree|🌴 palm|🌱 seedling|🌿 herb|☘️ shamrock|🍀 luck clover|🍁 maple|🍂 leaves|🌷 tulip|🌹 rose|🥀 wilted|🌺 hibiscus|🌸 blossom|🌼 flower|🌻 sunflower|🌞 sun|🌝 moon|🌙 moon|⭐ star|🌟 glowing star|✨ sparkles|⚡ zap|🔥 fire|🌈 rainbow|☀️ sun|⛅ cloud|☁️ cloud|🌧 rain|⛈ storm|❄️ snow|☃️ snowman|💧 drop|🌊 wave',
  },
  {
    key: 'food', icon: 'bi-cup-hot', label: 'Food & drink',
    list: '🍏 apple|🍎 apple|🍐 pear|🍊 orange|🍋 lemon|🍌 banana|🍉 watermelon|🍇 grapes|🍓 strawberry|🫐 blueberry|🍒 cherry|🍑 peach|🥭 mango|🍍 pineapple|🥥 coconut|🥝 kiwi|🍅 tomato|🥑 avocado|🥦 broccoli|🥕 carrot|🌽 corn|🥔 potato|🍞 bread|🥐 croissant|🧀 cheese|🍳 egg|🥞 pancakes|🍗 chicken|🍔 burger|🍟 fries|🍕 pizza|🌭 hotdog|🥪 sandwich|🌮 taco|🍝 pasta|🍜 noodles|🍲 stew|🍛 curry|🍚 rice|🍣 sushi|🍤 shrimp|🍦 ice cream|🍩 donut|🍪 cookie|🎂 birthday cake|🍰 cake|🧁 cupcake|🍫 chocolate|🍬 candy|🍭 lollipop|🍯 honey|🥛 milk|☕ coffee tea|🍵 tea|🧃 juice|🥤 drink|🍺 beer|🍷 wine|🥂 cheers|🍾 champagne',
  },
  {
    key: 'activity', icon: 'bi-trophy', label: 'Activity',
    list: '⚽ football|🏀 basketball|🏈 football|⚾ baseball|🎾 tennis|🏐 volleyball|🏏 cricket|🏸 badminton|🏓 ping pong|🥊 boxing|🏋️ gym|🧘 yoga|🏆 trophy win|🥇 gold first|🥈 silver|🥉 bronze|🏅 medal|🎖 medal|🎗 ribbon|🎫 ticket|🎟 ticket|🎪 circus|🎭 theatre|🎨 art|🎬 movie|🎤 mic|🎧 headphones|🎼 music|🎹 piano|🥁 drum|🎷 sax|🎸 guitar|🎻 violin|🎲 dice|🎯 target|🎳 bowling|🎮 game|🧩 puzzle|🎉 party celebrate|🎊 confetti|🎈 balloon|🎁 gift present',
  },
  {
    key: 'travel', icon: 'bi-car-front', label: 'Travel & places',
    list: '🚗 car|🚕 taxi|🚌 bus|🚑 ambulance|🚓 police|🚒 fire|🏍 motorbike|🛵 scooter|🚲 bike|🚚 truck delivery|✈️ plane flight|🚀 rocket|🚁 helicopter|⛵ boat|🚢 ship|🚂 train|🚉 station|🗺 map|🧭 compass|🏔 mountain|🏖 beach|🏝 island|🏠 home house|🏡 home|🏢 office|🏥 hospital clinic|🏦 bank|🏨 hotel|🏪 shop|🏫 school|⛪ church|🕌 mosque|🛕 temple|🗼 tower|🗽 statue|🌃 night|🌅 sunrise|🌄 sunrise|🎡 wheel|📍 pin location|🧳 luggage',
  },
  {
    key: 'objects', icon: 'bi-lightbulb', label: 'Objects',
    list: '⌚ watch|📱 phone mobile|💻 laptop|⌨️ keyboard|🖥 computer|🖨 printer|🖱 mouse|💾 disk|📷 camera|📹 video|📞 phone call|☎️ phone|📺 tv|⏰ alarm|⏳ hourglass|⌛ time|💡 idea bulb|🔦 torch|🕯 candle|💸 money|💵 cash|💳 card payment|💰 money bag|🪙 coin|💎 gem|⚖️ scale|🧰 toolbox|🔧 wrench|🔨 hammer|🔩 bolt|⚙️ gear settings|🔫 gun|💊 pill medicine|💉 injection|🩺 stethoscope|🩹 bandage|🧴 lotion|🧼 soap|🪒 razor|🧽 sponge|🛁 bath|🚿 shower|🔑 key|🚪 door|🛏 bed|🛋 sofa|🛒 cart shopping|🎈 balloon|🧸 teddy|📦 package box|📫 mailbox|✉️ envelope|📧 email|📝 memo note|📄 document|📅 calendar date|📆 calendar|📋 clipboard|📌 pin|📎 clip|✂️ scissors|🔒 lock|🔓 unlock|🔔 bell|📣 megaphone|📢 loudspeaker|🏷 tag label|🔍 search',
  },
  {
    key: 'symbols', icon: 'bi-heart', label: 'Symbols',
    list: '❤️ red heart love|🧡 orange heart|💛 yellow heart|💚 green heart|💙 blue heart|💜 purple heart|🖤 black heart|🤍 white heart|🤎 brown heart|💔 broken heart|❣️ heart|💕 hearts|💞 hearts|💓 heart|💗 heart|💖 sparkling heart|💘 cupid|💝 gift heart|✅ check done yes|☑️ check|✔️ check|❌ cross no|❎ cross|➕ plus|➖ minus|➗ divide|❓ question|❔ question|❗ exclamation|❕ exclamation|‼️ bang|⁉️ interrobang|💯 hundred|🔟 ten|🆗 ok|🆕 new|🆓 free|🔝 top|🔜 soon|⏩ forward|⏪ back|▶️ play|⏸ pause|🔄 refresh|🔁 repeat|🔀 shuffle|⬆️ up|⬇️ down|⬅️ left|➡️ right|↩️ return|♻️ recycle|⚠️ warning|🚫 forbidden|⛔ no entry|📵 no phone|🔞 adult|☢️ radioactive|🟢 green|🟡 yellow|🔴 red|🔵 blue|⚪ white|⚫ black|🔶 diamond|🔷 diamond|▪️ square|◼️ square|🔺 triangle|💬 speech chat|💭 thought|🗯 anger|♠️ spade|♥️ heart|♦️ diamond|♣️ club|🎵 music|💤 zzz|🏁 finish|🚩 flag|🇮🇳 india flag',
  },
];

const RECENT_KEY = 'wa_recent_emoji';

/** WhatsApp-style emoji panel: category tabs, search by name, recently used first. Emits the chosen emoji. */
@Component({
  selector: 'app-wa-emoji-picker',
  standalone: true,
  template: `
    <div class="ep" role="dialog" aria-label="Emoji">
      <nav class="ep-tabs" aria-label="Emoji categories">
        @if (recent().length) {
          <button type="button" [class.on]="tab() === 'recent'" (click)="tab.set('recent')" title="Recent" aria-label="Recent"><i class="bi bi-clock"></i></button>
        }
        @for (g of groups; track g.key) {
          <button type="button" [class.on]="tab() === g.key" (click)="tab.set(g.key)" [title]="g.label" [attr.aria-label]="g.label"><i class="bi" [class]="g.icon"></i></button>
        }
      </nav>
      <div class="ep-search">
        <i class="bi bi-search" aria-hidden="true"></i>
        <input type="search" placeholder="Search emoji" [value]="query()" (input)="query.set($any($event.target).value)" aria-label="Search emoji" />
      </div>
      <div class="ep-title">{{ title() }}</div>
      <div class="ep-grid">
        @for (e of shown(); track e) {
          <button type="button" (click)="choose(e)" [attr.aria-label]="e">{{ e }}</button>
        } @empty {
          <span class="ep-none">No emoji found</span>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .ep { width: 100%; height: 320px; display: flex; flex-direction: column; background: var(--w-panel, #fff); color: var(--w-text, #111b21); }
    .ep-tabs { display: flex; gap: 2px; padding: 4px 8px 0; border-bottom: 1px solid var(--w-line, #e9edef);
      button { flex: 1; height: 40px; border: 0; border-bottom: 3px solid transparent; background: none; color: var(--w-icon, #54656f); font-size: 18px; cursor: pointer;
        &.on { color: var(--w-green, #00a884); border-bottom-color: var(--w-green, #00a884); }
        &:focus-visible { outline: none; background: var(--w-hover, #f5f6f6); } } }
    .ep-search { display: flex; align-items: center; gap: 10px; margin: 8px 12px 4px; padding: 0 12px; height: 34px; border-radius: 8px; background: var(--w-bar, #f0f2f5); color: var(--w-sub, #667781);
      input { flex: 1; border: 0; background: none; color: inherit; font: inherit; font-size: 14px; &:focus { outline: none; } } }
    .ep-title { padding: 6px 16px 2px; font-size: 13px; color: var(--w-sub, #667781); }
    .ep-grid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); padding: 4px 10px 10px; align-content: start;
      button { height: 40px; border: 0; border-radius: 8px; background: none; font-size: 26px; line-height: 1; cursor: pointer;
        &:hover, &:focus-visible { outline: none; background: var(--w-hover, #f5f6f6); } } }
    .ep-none { grid-column: 1 / -1; padding: 20px; text-align: center; color: var(--w-sub, #667781); font-size: 13px; }
  `],
})
export class WaEmojiPicker {
  readonly picked = output<string>();

  readonly groups = GROUPS;
  private readonly parsed = GROUPS.map(g => ({ key: g.key, label: g.label, items: g.list.split('|').map(x => { const [e, ...k] = x.split(' '); return { e, k: k.join(' ') }; }) }));

  readonly recent = signal<string[]>(loadRecent());
  readonly tab = signal<string>(loadRecent().length ? 'recent' : 'smileys');
  readonly query = signal('');

  readonly title = computed(() => this.query().trim() ? 'Search results' : this.tab() === 'recent' ? 'Recent' : GROUPS.find(g => g.key === this.tab())?.label ?? '');

  readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (q) return this.parsed.flatMap(g => g.items).filter(i => i.k.includes(q)).map(i => i.e);
    if (this.tab() === 'recent') return this.recent();
    return this.parsed.find(g => g.key === this.tab())?.items.map(i => i.e) ?? [];
  });

  choose(e: string): void {
    const next = [e, ...this.recent().filter(x => x !== e)].slice(0, 32);
    this.recent.set(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // not remembered: fine
    }
    this.picked.emit(e);
  }
}

function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 32) : [];
  } catch {
    return [];
  }
}
