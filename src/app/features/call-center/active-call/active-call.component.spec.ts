import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { ActiveCallComponent } from './active-call.component';

describe('ActiveCallComponent', () => {
  let component: ActiveCallComponent;
  let fixture: ComponentFixture<ActiveCallComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActiveCallComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ActiveCallComponent);
    component = fixture.componentInstance;
    // Rendered by its opener with real data (dialog data / inputs), so only creation is checked here.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
