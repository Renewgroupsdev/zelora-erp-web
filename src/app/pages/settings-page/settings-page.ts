import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { NavLayoutService } from '../../services/nav-layout.service';
import { IdleService } from '../../core/idle-service/idle.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  readonly idlePresets = [5, 15, 30, 60];

  constructor(public navLayout: NavLayoutService, public idleService: IdleService) { }

  setIdleMinutes(minutes: number): void {
    if (minutes > 0) {
      this.idleService.setIdleMinutes(minutes);
    }
  }
}
