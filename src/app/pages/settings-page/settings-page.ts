import { Component } from '@angular/core';
import { NavLayoutService } from '../../services/nav-layout.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  constructor(public navLayout: NavLayoutService) { }
}
