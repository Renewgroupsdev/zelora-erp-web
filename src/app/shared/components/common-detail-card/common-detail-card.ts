import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DetailTrendDirection } from '../../models/common-components.model';

@Component({
  selector: 'app-common-detail-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './common-detail-card.html',
  styleUrl: './common-detail-card.scss',
})
export class CommonDetailCard {
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() trendText?: string;
  @Input() trendDirection: DetailTrendDirection = 'neutral';
  @Input() hero = false;
}
