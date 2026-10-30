import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { TeamWidget } from './team-widget';

describe('TeamWidget', () => {
  let component: TeamWidget;
  let fixture: ComponentFixture<TeamWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeamWidget],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TeamWidget);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
