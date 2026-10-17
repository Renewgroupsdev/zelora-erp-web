import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { Recruitment } from './recruitment';

describe('Recruitment', () => {
  let component: Recruitment;
  let fixture: ComponentFixture<Recruitment>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Recruitment],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Recruitment);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
