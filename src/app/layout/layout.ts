import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopNavbar } from '../top-navbar/top-navbar';
import { LeftSideNavbar } from '../left-side-navbar/left-side-navbar';
import { NavLayoutService } from '../services/nav-layout.service';
import { TelephonyDock } from '../features/call-center/telephony-dock/telephony-dock';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, TopNavbar, LeftSideNavbar, TelephonyDock],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {
  constructor(public navLayout: NavLayoutService) { }
}
