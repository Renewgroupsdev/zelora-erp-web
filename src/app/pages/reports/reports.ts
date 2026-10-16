import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { REPORTS } from './reports.data';
import { AutoModuleTabs } from '../../shared/components/module-tabs/auto-module-tabs';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [AutoModuleTabs, CommonModule, RouterLink],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports {
  readonly reports = REPORTS;
}
