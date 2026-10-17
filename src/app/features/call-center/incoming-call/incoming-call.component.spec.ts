import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { IncomingCallComponent } from './incoming-call.component';

describe('IncomingCallComponent', () => {
  let component: IncomingCallComponent;
  let fixture: ComponentFixture<IncomingCallComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IncomingCallComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(IncomingCallComponent);
    component = fixture.componentInstance;
    // Rendered by its opener with real data (dialog data / inputs), so only creation is checked here.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
