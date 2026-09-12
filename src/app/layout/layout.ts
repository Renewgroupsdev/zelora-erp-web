import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopNavbar } from '../top-navbar/top-navbar';
import { LeftSideNavbar } from '../left-side-navbar/left-side-navbar';
import { NavLayoutService } from '../services/nav-layout.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, TopNavbar, LeftSideNavbar],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {
  constructor(public navLayout: NavLayoutService) { }
}
