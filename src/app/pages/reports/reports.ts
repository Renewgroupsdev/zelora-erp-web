import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { REPORTS } from './reports.data';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports {
  readonly reports = REPORTS;
}
