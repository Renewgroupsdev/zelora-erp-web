import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DevToolsGuardService } from './services/devtools-guard.service';

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
    this.devToolsGuard.init();
  }

  ngOnDestroy(): void {
    this.devToolsGuard.destroy();
  }
}
