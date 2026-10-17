import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { WipPanel } from './wip-panel';

describe('WipPanel', () => {
  let component: WipPanel;
  let fixture: ComponentFixture<WipPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WipPanel],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(WipPanel);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
