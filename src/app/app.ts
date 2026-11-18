import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DevToolsGuardService } from './services/devtools-guard.service';
import { startDateFieldEnhancer } from './shared/utils/date-field-enhancer';
import { lockButtonOnClick } from './core/http/submit-lock.interceptor';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('erp-software');

  constructor(private readonly devToolsGuard: DevToolsGuardService) { }

  ngOnInit(): void {
    lockButtonOnClick(); // a button that starts a save is locked until the API answers
    startDateFieldEnhancer(); // every date field in the project: dd-mm-yyyy + the shared calendar popup
    this.devToolsGuard.init();
  }

  ngOnDestroy(): void {
    this.devToolsGuard.destroy();
  }
}
